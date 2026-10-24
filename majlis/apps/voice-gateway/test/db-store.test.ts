import type { AddressInfo } from "node:net";
import { isolatedTestDb } from "@majlis/db/testing";
import {
  consentRecords,
  createOrgWithOwner,
  createStudyFromObjective,
  interviewSessions,
  startInterview,
  turns,
  updateStudySettings,
  type DbHandle,
} from "@majlis/db";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DbSessionStore } from "../src/db-store.js";
import { CLOSE, buildServer } from "../src/server.js";

const URL_TEST = process.env.DATABASE_URL_TEST;

describe.skipIf(!URL_TEST)("gateway with PostgreSQL", () => {
  let h: DbHandle;
  let app: FastifyInstance;
  let base = "";
  let inviteToken = "";

  beforeAll(async () => {
    h = await isolatedTestDb(URL_TEST!, "gateway");
    const org = await createOrgWithOwner(h.db, {
      orgName: "o",
      email: "gw@example.com",
      name: "n",
      password: "a long enough password",
    });
    const { study } = await createStudyFromObjective(h.db, {
      ...org,
      objective: "نقيس رضا زوار المطعم",
    });
    await updateStudySettings(h.db, org.orgId, study.id, { status: "recruiting" });
    inviteToken = study.inviteToken;
    app = await buildServer({ store: new DbSessionStore(h.db), seed: 1 });
    await app.listen({ port: 0, host: "127.0.0.1" });
    base = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  const newSession = async () => {
    const r = await startInterview(h.db, {
      inviteToken,
      consent: { interview: true, allowAudioPlayback: false },
      participant: { gender: "male" },
      screenerAnswers: { frequency: "few" },
      voiceGender: "male",
    });
    return (r as { sessionId: string }).sessionId;
  };

  const closeCode = (id: string) =>
    new Promise<number>((resolve) =>
      new WebSocket(`${base}/v1/sessions/${id}/stream`).on("close", (code) => resolve(code)),
    );

  it("refuses a session without a consent record", async () => {
    const id = await newSession();
    await h.db.delete(consentRecords).where(eq(consentRecords.sessionId, id));
    expect(await closeCode(id)).toBe(CLOSE.consentRequired);
  });

  it("runs an interview and stores turns, verbal consent and outcome", async () => {
    const id = await newSession();
    const ws = new WebSocket(`${base}/v1/sessions/${id}/stream`);
    const types: string[] = [];
    ws.on(
      "message",
      (d, binary) => !binary && types.push((JSON.parse(d.toString()) as { type: string }).type),
    );
    await new Promise((r) => ws.on("open", r));
    ws.send(JSON.stringify({ type: "hello", protocol: 1, mode: "text", voiceGender: "female" }));
    const answers = [
      "إيه",
      "اخترته لأنه قريب من البيت وأكله نظيف",
      "الطلب كان سريع والاستلام من السيارة سهل",
      "الأكل طعمه ممتاز والكمية مناسبة والجودة عالية",
      "الموظفين محترمين ويردون بسرعة على الطلبات",
      "الأسعار مقبولة مقارنة بالكمية اللي نحصلها",
      "أوسّع الجلسات العائلية وأخلي الإضاءة أهدى",
      "بقول لهم جربوه أكيد بس روحوا بدري",
    ];
    for (const text of answers) {
      ws.send(JSON.stringify({ type: "text", text }));
      await new Promise((r) => setTimeout(r, 30));
    }
    const deadline = Date.now() + 3000;
    let status = "";
    while (Date.now() < deadline) {
      [{ status = "" } = { status: "" }] = await h.db
        .select({ status: interviewSessions.status })
        .from(interviewSessions)
        .where(eq(interviewSessions.id, id));
      if (status === "completed") break;
      await new Promise((r) => setTimeout(r, 30));
    }
    expect(status).toBe("completed");
    expect(types).toContain("ended");
    // A second connection with the same link is refused.
    expect(await closeCode(id)).toBe(CLOSE.conflict);

    const stored = await h.db
      .select()
      .from(turns)
      .where(eq(turns.sessionId, id))
      .orderBy(asc(turns.idx));
    expect(stored[0]).toMatchObject({ role: "interviewer", action: "disclose" });
    expect(stored.at(-1)).toMatchObject({ role: "interviewer", action: "close" });
    expect(stored.filter((t) => t.role === "participant")).toHaveLength(answers.length);
    // The interviewer used the voice fixed at consent, not the one the browser asked for.
    expect(stored[0]!.text).toContain("مساعد ذكي");

    const consents = await h.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.sessionId, id));
    expect(consents.map((c) => c.method).sort()).toEqual(["click", "verbal"]);
    ws.close();
  });
});
