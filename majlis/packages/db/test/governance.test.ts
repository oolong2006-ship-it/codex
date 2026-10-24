import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appendTurn,
  audioRefForClient,
  audioRefForReviewer,
  auditLog,
  claimJob,
  completeJob,
  contactPhone,
  correctTranscript,
  createOrgWithOwner,
  createStudyFromObjective,
  enqueueJob,
  eraseByDeletionCode,
  hashPhone,
  insights,
  interviewSessions,
  openFlags,
  participants,
  personas,
  purgeExpired,
  qualityMetrics,
  rateInterviewerTurn,
  setRetentionPolicy,
  setSessionStatus,
  startInterview,
  startWhatsappSession,
  transcriptForClient,
  turns,
  updateStudySettings,
  upsertContact,
  whatsappContacts,
  type DbHandle,
} from "../src/index.js";
import { TEST_URL } from "./helpers.js";
import { isolatedTestDb } from "../src/testing.js";

let h: DbHandle;
let org: { orgId: string; userId: string };
let inviteToken = "";
const deleted: string[] = [];
const store = { delete: async (key: string) => void deleted.push(key) };

async function interview(opts: { audio?: boolean; allowAudio?: boolean; dialect?: string } = {}) {
  const r = (await startInterview(h.db, {
    inviteToken,
    consent: { interview: true, allowAudioPlayback: opts.allowAudio ?? false },
    participant: { gender: "female", ...(opts.dialect ? { dialect: opts.dialect } : {}) },
    screenerAnswers: { frequency: "few" },
    voiceGender: "female",
  })) as { sessionId: string; deletionCode: string };
  const interviewerTurn = await appendTurn(h.db, r.sessionId, {
    role: "interviewer",
    text: "وش اللي عجبك؟",
    action: "ask",
  });
  const answer = await appendTurn(h.db, r.sessionId, {
    role: "participant",
    text: "الاكل كان زين مره",
    asrConfidence: 0.4,
    questionId: "food",
    ...(opts.audio ? { audioRef: `recordings/${r.sessionId}/a.wav` } : {}),
  });
  await setSessionStatus(h.db, r.sessionId, "completed");
  return { ...r, interviewerTurn, answer };
}

describe.skipIf(!TEST_URL)("governance, review and WhatsApp data", () => {
  beforeAll(async () => {
    h = await isolatedTestDb(TEST_URL!, "governance");
    org = await createOrgWithOwner(h.db, {
      orgName: "o",
      email: "g@example.com",
      name: "n",
      password: "a long enough password",
    });
    const { study } = await createStudyFromObjective(h.db, {
      ...org,
      objective: "نقيس رضا زوار المطعم",
    });
    await updateStudySettings(h.db, org.orgId, study.id, {
      status: "recruiting",
      retentionDays: 30,
    });
    inviteToken = study.inviteToken;
  });
  afterAll(async () => h?.close());

  it("erases everything about a participant with their deletion code", async () => {
    const s = await interview({ audio: true });
    const other = await interview();
    const [study] = await h.db
      .select({ id: interviewSessions.studyId })
      .from(interviewSessions)
      .limit(1);
    const quotes = [
      { turnId: s.answer, text: "الاكل كان زين مره" },
      { turnId: other.answer, text: "باقي" },
    ];
    await h.db
      .insert(insights)
      .values({ studyId: study!.id, theme: "الأكل", sentiment: "positive", quotes });
    await h.db
      .insert(personas)
      .values({ orgId: org.orgId, segment: {}, attributes: {}, evidence: quotes });
    expect(s.deletionCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(await eraseByDeletionCode(h.db, store, "WRONG-CODE-0000")).toBe(false);
    // Typed in lower case with spaces still works.
    expect(
      await eraseByDeletionCode(h.db, store, s.deletionCode.toLowerCase().replace(/-/g, " ")),
    ).toBe(true);
    expect(deleted).toContain(`recordings/${s.sessionId}/a.wav`);
    expect(
      await h.db.select().from(interviewSessions).where(eq(interviewSessions.id, s.sessionId)),
    ).toEqual([]);
    expect(await h.db.select().from(turns).where(eq(turns.sessionId, s.sessionId))).toEqual([]);
    // Derived quotes disappear immediately, before any rebuild runs.
    const [insight] = await h.db.select().from(insights);
    const [persona] = await h.db.select().from(personas);
    expect(insight!.quotes.map((q) => q.turnId)).toEqual([other.answer]);
    expect(persona!.evidence.map((q) => q.turnId)).toEqual([other.answer]);
    const [log] = await h.db.select().from(auditLog).where(eq(auditLog.kind, "erasure"));
    expect(log!.detail).toMatchObject({
      reason: "participant_request",
      sessions: 1,
      recordings: 1,
    });
    expect(JSON.stringify(log!.detail)).not.toContain(s.sessionId);
  });

  it("deletes recordings after the study retention, and interviews after the transcript retention", async () => {
    const s = await interview({ audio: true });
    const ended = (days: number) =>
      h.db
        .update(interviewSessions)
        .set({ endedAt: sql`now() - make_interval(days => ${days})` })
        .where(eq(interviewSessions.id, s.sessionId));

    await ended(10);
    expect((await purgeExpired(h.db, store)).recordings).toBe(0);
    await ended(31);
    expect((await purgeExpired(h.db, store)).recordings).toBe(1);
    const [answer] = await h.db.select().from(turns).where(eq(turns.id, s.answer));
    expect(answer!.audioRef).toBeNull();
    expect(answer!.text).toBe("الاكل كان زين مره"); // transcript kept

    await setRetentionPolicy(h.db, org.orgId, { recordingsDays: 30, transcriptsDays: 60 });
    expect((await purgeExpired(h.db, store)).sessions).toBe(0);
    await ended(61);
    expect((await purgeExpired(h.db, store)).sessions).toBe(1);
    expect(await h.db.select().from(turns).where(eq(turns.sessionId, s.sessionId))).toEqual([]);
  });

  it("lets reviewers correct transcripts and turns corrections into a real WER per dialect", async () => {
    const s = await interview({ dialect: "najdi" });
    const flags = await openFlags(h.db, org.orgId);
    expect(flags.some((f) => f.turnId === s.answer && f.kind === "low_asr_confidence")).toBe(true);

    expect(
      await correctTranscript(h.db, org.orgId, {
        turnId: s.answer,
        text: "الأكل كان زين مرة بس بارد",
        reviewerId: org.userId,
      }),
    ).toBe(true);
    const [t] = await h.db.select().from(turns).where(eq(turns.id, s.answer));
    expect(t).toMatchObject({
      text: "الأكل كان زين مرة بس بارد",
      originalText: "الاكل كان زين مره",
    });
    expect((await openFlags(h.db, org.orgId)).some((f) => f.turnId === s.answer)).toBe(false);

    expect(
      await rateInterviewerTurn(h.db, org.orgId, {
        turnId: s.interviewerTurn,
        reviewerId: org.userId,
        naturalness: 4,
        dialectCorrect: true,
      }),
    ).toBe(true);
    expect(
      await rateInterviewerTurn(h.db, org.orgId, {
        turnId: s.interviewerTurn,
        reviewerId: org.userId,
        naturalness: 9,
        dialectCorrect: true,
      }),
    ).toBe(false);

    const m = await qualityMetrics(h.db, org.orgId);
    // 6 reference words; ASR missed 2 ("بس بارد") after normalization → 2/6.
    expect(m.wer).toEqual([{ dialect: "najdi", wer: 2 / 6, words: 6, turns: 1 }]);
    expect(m.mos).toEqual({ mean: 4, ratings: 1 });
    expect(m.dialectCorrect).toEqual({ share: 1, ratings: 1 });

    const other = await createOrgWithOwner(h.db, {
      orgName: "x",
      email: "x@example.com",
      name: "x",
      password: "a long enough password",
    });
    expect(
      await correctTranscript(h.db, other.orgId, {
        turnId: s.answer,
        text: "اختراق",
        reviewerId: other.userId,
      }),
    ).toBe(false);
  });

  it("plays a participant's audio to the client only with their separate permission", async () => {
    const denied = await interview({ audio: true, allowAudio: false });
    const allowed = await interview({ audio: true, allowAudio: true });
    expect(await audioRefForClient(h.db, org.orgId, denied.answer)).toBeNull();
    const players = async (sessionId: string) =>
      (await transcriptForClient(h.db, org.orgId, sessionId))!.map((t) => t.audioTurnId);
    expect(await players(denied.sessionId)).toEqual([null, null]);
    expect(await players(allowed.sessionId)).toEqual([null, allowed.answer]);
    expect(await audioRefForClient(h.db, org.orgId, allowed.answer)).toBe(
      `recordings/${allowed.sessionId}/a.wav`,
    );
    expect(await audioRefForReviewer(h.db, org.orgId, denied.answer)).toBe(
      `recordings/${denied.sessionId}/a.wav`,
    );
  });

  it("runs jobs with the same serial key one at a time and in order", async () => {
    await h.db.execute(sql`update jobs set status = 'done'`); // earlier tests queued re-analysis
    await enqueueJob(h.db, "msg", { n: 1 }, { serialKey: "contact-1" });
    await enqueueJob(h.db, "msg", { n: 2 }, { serialKey: "contact-1" });
    await enqueueJob(h.db, "other", {}, {});
    const first = await claimJob(h.db);
    const second = await claimJob(h.db);
    expect(first!.payload).toEqual({ n: 1 });
    expect(second!.kind).toBe("other"); // n:2 waits for n:1
    expect(await claimJob(h.db)).toBeNull();
    await completeJob(h.db, first!.id);
    expect((await claimJob(h.db))!.payload).toEqual({ n: 2 });
  });

  it("stores WhatsApp numbers encrypted, found by a keyed hash", async () => {
    const keys = {
      encryptionKey: Buffer.alloc(32, 3).toString("base64"),
      hashPepper: "pepper-for-tests-only",
    };
    const id = await upsertContact(h.db, "0551234567", keys);
    expect(await upsertContact(h.db, "+966 55 123 4567", keys)).toBe(id);
    const [row] = await h.db.select().from(whatsappContacts).where(eq(whatsappContacts.id, id));
    expect(row!.phoneEncrypted).not.toContain("551234567");
    expect(row!.phoneHash).toBe(hashPhone("966551234567", keys));
    expect(await contactPhone(h.db, id, keys)).toBe("966551234567");
    // Participants never hold contact data.
    expect(Object.keys((await h.db.select().from(participants).limit(1))[0] ?? {})).not.toContain(
      "phone",
    );
  });

  it("deletes idle WhatsApp numbers and their unfinished interviews, keeping finished ones", async () => {
    const keys = {
      encryptionKey: Buffer.alloc(32, 4).toString("base64"),
      hashPepper: "pepper-for-tests-only",
    };
    const done = await upsertContact(h.db, "0501111111", keys);
    const idle = await upsertContact(h.db, "0502222222", keys);
    const finished = await startWhatsappSession(h.db, done, inviteToken);
    expect(finished!.deletionCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    await setSessionStatus(h.db, finished!.sessionId, "completed");
    const unfinished = await startWhatsappSession(h.db, idle, inviteToken);

    const soon = new Date(Date.now() + 10 * 86_400_000);
    expect((await purgeExpired(h.db, store, soon, { contactDays: 30 })).whatsappNumbers).toBe(0);
    const later = new Date(Date.now() + 31 * 86_400_000);
    const summary = await purgeExpired(h.db, store, later, { contactDays: 30 });
    expect(summary.whatsappNumbers).toBeGreaterThanOrEqual(2);
    expect(await h.db.select().from(whatsappContacts).where(eq(whatsappContacts.id, done))).toEqual(
      [],
    );
    const [kept] = await h.db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, finished!.sessionId));
    expect(kept).toMatchObject({ status: "completed", contactId: null });
    expect(
      await h.db
        .select()
        .from(interviewSessions)
        .where(eq(interviewSessions.id, unfinished!.sessionId)),
    ).toEqual([]);
    // The finished interview can still be erased with the code sent over WhatsApp.
    expect(await eraseByDeletionCode(h.db, store, finished!.deletionCode)).toBe(true);
  });
});
