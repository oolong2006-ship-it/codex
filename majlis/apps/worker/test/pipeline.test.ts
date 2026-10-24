import { answerFromMemory, parseQuestion } from "@majlis/analysis";
import {
  appendTurn,
  claimJob,
  createOrgWithOwner,
  createStudyFromObjective,
  enqueueJob,
  getStudy,
  insightsForClient,
  personasForClient,
  searchMemory,
  setSessionStatus,
  startInterview,
  updateStudySettings,
  type DbHandle,
} from "@majlis/db";
import { isolatedTestDb } from "@majlis/db/testing";
import { MockEmbeddingProvider } from "@majlis/providers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerHandlers } from "../src/handlers.js";
import { JobRegistry } from "../src/jobs.js";
import { drain, runOnce } from "../src/runner.js";

const URL_TEST = process.env.DATABASE_URL_TEST;
const embedding = new MockEmbeddingProvider();

describe.skipIf(!URL_TEST)("analysis pipeline on PostgreSQL", () => {
  let h: DbHandle;
  let orgId = "";
  let studyId = "";
  const registry = new JobRegistry();

  beforeAll(async () => {
    h = await isolatedTestDb(URL_TEST!, "worker");
    const org = await createOrgWithOwner(h.db, {
      orgName: "o",
      email: "w@example.com",
      name: "n",
      password: "a long enough password",
    });
    orgId = org.orgId;
    const { study } = await createStudyFromObjective(h.db, {
      ...org,
      objective: "نقيس رضا زوار المطعم",
      topic: "مطعم الديرة",
    });
    studyId = study.id;
    await updateStudySettings(h.db, orgId, studyId, { status: "recruiting" });
    registerHandlers(registry, { db: h.db, embedding, personaMinSessions: 2 });

    const { guide } = (await getStudy(h.db, orgId, studyId))!;
    const q = (sectionId: string) =>
      guide!.content.sections.find((s) => s.id === sectionId)!.questions[0]!.id;
    const people = [
      {
        gender: "female",
        city: "jeddah",
        food: "الأكل لذيذ والطعم رهيب",
        price: "الأسعار غالية مرة مقارنة بالكمية، جوالي 0551234567",
      },
      {
        gender: "female",
        city: "jeddah",
        food: "الأكل زين بس بارد شوي",
        price: "الأسعار غالية وما تستاهل",
      },
      {
        gender: "male",
        city: "riyadh",
        food: "الطعم ممتاز والكمية مناسبة",
        price: "السعر مو غالي ويستاهل",
      },
    ] as const;
    for (const p of people) {
      const r = await startInterview(h.db, {
        inviteToken: study.inviteToken,
        consent: { interview: true, allowAudioPlayback: false },
        participant: { gender: p.gender, city: p.city },
        screenerAnswers: { frequency: "few" },
        voiceGender: "female",
      });
      const sessionId = (r as { sessionId: string }).sessionId;
      await appendTurn(h.db, sessionId, {
        role: "participant",
        text: p.food,
        questionId: q("quality"),
      });
      await appendTurn(h.db, sessionId, {
        role: "participant",
        text: p.price,
        questionId: q("price"),
      });
      await setSessionStatus(h.db, sessionId, "completed");
      await enqueueJob(
        h.db,
        "analyze-session",
        { sessionId },
        { dedupeKey: `analyze:${sessionId}` },
      );
    }
  });

  afterAll(async () => h?.close());

  it("analyzes every completed interview and builds the study's themes", async () => {
    expect(await drain(h.db, registry)).toBe(4); // three sessions + one coalesced persona update
    const result = (await insightsForClient(h.db, orgId, studyId))!;
    expect(result).toMatchObject({ completed: 3, pendingAnalysis: 0 });
    const price = result.themes.find((t) => t.themeId === "price")!;
    expect(price.counts).toMatchObject({ negative: 2, positive: 1 });
    expect(price.breakdown.city!.jeddah!.negative).toBe(2);
    expect(JSON.stringify(result)).not.toContain("0551234567");
  });

  it("builds personas with evidence and versions them as memory grows", async () => {
    const personas = await personasForClient(h.db, orgId);
    const women = personas.find((p) => p.segmentKey === "gender=female")!;
    expect(women.attributes.sessions).toBe(2);
    expect(women.attributes.complaints[0]!.theme).toBe("السعر");
    expect(women.version).toBe(1);
    expect(personas.find((p) => p.segmentKey === "gender=male")).toBeUndefined(); // only one interview
  });

  it("answers «وش رأي الأمهات في جدة بأسعارنا؟» from Jeddah women's quotes only", async () => {
    const question = "وش رأي الأمهات في جدة بأسعارنا؟";
    const parsed = parseQuestion(question);
    const [vector] = await embedding.embed([parsed.topicQuery], "query");
    const hits = await searchMemory(h.db, orgId, vector!, parsed.filters, {
      limit: 3,
      minSimilarity: 0.1,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.text).toContain("الأسعار");
    expect(hits.every((hit) => !hit.text.includes("الرياض") && !hit.text.includes("مو غالي"))).toBe(
      true,
    );
    expect(hits.map((hit) => hit.text).join(" ")).not.toContain("0551234567");
    const answer = await answerFromMemory(question, parsed, hits);
    expect(answer.notes).toContain("parenthood_not_collected");
    expect(answer.mode).toBe("extractive");
  });

  it("returns no evidence rather than unrelated quotes", async () => {
    const parsed = parseQuestion("وش رأيهم في مواقف السيارات؟");
    const [vector] = await embedding.embed([parsed.topicQuery], "query");
    const hits = await searchMemory(h.db, orgId, vector!, parsed.filters, { minSimilarity: 0.1 });
    expect(hits).toEqual([]);
    expect((await answerFromMemory("س", parsed, hits)).mode).toBe("insufficient");
  });

  it("retries a failing job with backoff, then marks it failed", async () => {
    registry.register("analyze-session-broken" as never, async () => {
      throw new Error("boom");
    });
    await enqueueJob(h.db, "analyze-session-broken", {});
    expect(await runOnce(h.db, registry)).toBe("failed");
    // Backoff: not claimable again right away.
    expect(await claimJob(h.db)).toBeNull();
  });

  it("never hands the same job to two workers", async () => {
    for (let i = 0; i < 5; i++) await enqueueJob(h.db, "noop", { i });
    const claimed = await Promise.all(Array.from({ length: 8 }, () => claimJob(h.db)));
    const ids = claimed.filter(Boolean).map((j) => j!.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });
});
