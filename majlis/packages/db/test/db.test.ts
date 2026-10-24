import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FORBIDDEN_CLIENT_FIELDS,
  REDACTED,
  appendTurn,
  claimSession,
  consentRecords,
  createOrgWithOwner,
  createStudyFromObjective,
  getInvite,
  getStudy,
  interviewSessions,
  listSessionsForClient,
  listStudies,
  loadSessionForGateway,
  login,
  logout,
  qaFlags,
  recordVerbalConsent,
  saveGuide,
  setSessionStatus,
  startInterview,
  transcriptForClient,
  updateStudySettings,
  userForToken,
  type DbHandle,
} from "../src/index.js";
import { TEST_URL, freshDb } from "./helpers.js";

let h: DbHandle;
let orgA: { orgId: string; userId: string };
let orgB: { orgId: string; userId: string };

describe.skipIf(!TEST_URL)("database", () => {
  beforeAll(async () => {
    h = await freshDb();
    orgA = await createOrgWithOwner(h.db, {
      orgName: "مطاعم أ",
      email: "owner@a.example",
      name: "A",
      password: "correct horse battery",
    });
    orgB = await createOrgWithOwner(h.db, {
      orgName: "شركة ب",
      email: "owner@b.example",
      name: "B",
      password: "another long password",
    });
  });
  afterAll(async () => h?.close());

  it("logs in with a stored scrypt hash and revokes on logout", async () => {
    expect(await login(h.db, "owner@a.example", "wrong password")).toBeNull();
    const token = await login(h.db, "OWNER@a.example", "correct horse battery");
    expect(token).toBeTruthy();
    expect(await userForToken(h.db, token!)).toMatchObject({ orgId: orgA.orgId, role: "owner" });
    await logout(h.db, token!);
    expect(await userForToken(h.db, token!)).toBeNull();
  });

  it("creates a study from one sentence and keeps it inside its organization", async () => {
    const { study, generated } = await createStudyFromObjective(h.db, {
      ...orgA,
      objective: "نبي نعرف ليش العملاء يتركون التطبيق",
    });
    expect(generated.templateId).toBe("churn_reasons");
    expect((await listStudies(h.db, orgA.orgId)).map((s) => s.id)).toContain(study.id);
    expect(await listStudies(h.db, orgB.orgId)).toEqual([]);
    expect(await getStudy(h.db, orgB.orgId, study.id)).toBeNull();
    await expect(
      updateStudySettings(h.db, orgB.orgId, study.id, { status: "closed" }),
    ).rejects.toThrow();
  });

  it("versions guide edits and rejects invalid guides", async () => {
    const { study } = await createStudyFromObjective(h.db, {
      ...orgA,
      objective: "نقيس رضا زوار المطعم",
    });
    const { guide } = (await getStudy(h.db, orgA.orgId, study.id))!;
    const edited = { ...guide!.content, sections: guide!.content.sections.slice(0, 2) };
    expect(await saveGuide(h.db, orgA.orgId, study.id, edited)).toBe(2);
    await expect(
      saveGuide(h.db, orgA.orgId, study.id, { ...edited, sections: [] }),
    ).rejects.toThrow();
  });

  describe("participation, gateway and client views", () => {
    let inviteToken = "";
    let studyId = "";

    beforeAll(async () => {
      const { study } = await createStudyFromObjective(h.db, {
        ...orgA,
        objective: "نقيس رضا زوار المطعم",
        topic: "مطعم الديرة",
      });
      inviteToken = study.inviteToken;
      studyId = study.id;
    });

    const start = (patch: Record<string, unknown> = {}) =>
      startInterview(h.db, {
        inviteToken,
        consent: { interview: true, allowAudioPlayback: false },
        participant: { gender: "female", city: "جدة", ageBand: "25-34" },
        screenerAnswers: { frequency: "few" },
        voiceGender: "female",
        ...patch,
      });

    it("refuses to start while the study is not recruiting, without consent, or when screened out", async () => {
      expect(await start()).toEqual({ ok: false, reason: "closed" });
      await updateStudySettings(h.db, orgA.orgId, studyId, { status: "recruiting" });
      expect(await start({ consent: { interview: false, allowAudioPlayback: true } })).toEqual({
        ok: false,
        reason: "no_consent",
      });
      expect(await start({ screenerAnswers: { frequency: "none" } })).toEqual({
        ok: false,
        reason: "screened_out",
      });
      expect(await start({ inviteToken: "nope" })).toEqual({ ok: false, reason: "not_found" });
    });

    it("records consent with the exact disclosure before the interview exists", async () => {
      const invite = await getInvite(h.db, inviteToken);
      expect(invite!.disclosure.female).toContain("مساعدة ذكية");
      expect(invite!.disclosure.female).toContain("مطعم الديرة");

      const result = await start();
      expect(result.ok).toBe(true);
      const sessionId = (result as { sessionId: string }).sessionId;
      const [consent] = await h.db
        .select()
        .from(consentRecords)
        .where(eq(consentRecords.sessionId, sessionId));
      expect(consent).toMatchObject({ method: "click", disclosureText: invite!.disclosure.female });
      expect(consent!.disclosureSha256).toMatch(/^[0-9a-f]{64}$/);

      const forGateway = await loadSessionForGateway(h.db, sessionId);
      expect(forGateway).toMatchObject({
        status: "created",
        voiceGender: "female",
        hasConsent: true,
      });
      expect(forGateway!.guide.topic).toBe("مطعم الديرة");
    });

    it("lets a session be claimed once and stores turns with QA flags", async () => {
      const { sessionId } = (await start()) as { sessionId: string };
      expect(await claimSession(h.db, sessionId)).toBe(true);
      expect(await claimSession(h.db, sessionId)).toBe(false);

      await appendTurn(h.db, sessionId, {
        role: "interviewer",
        text: "هلا والله",
        action: "disclose",
      });
      await appendTurn(h.db, sessionId, { role: "participant", text: "إيه", asrConfidence: 0.95 });
      await appendTurn(h.db, sessionId, {
        role: "participant",
        text: "رقمي 0551234567 وإيميلي a@b.co والأكل كان حلو",
        asrConfidence: 0.4,
        questionId: "food",
      });
      const flags = await h.db.select().from(qaFlags).where(eq(qaFlags.sessionId, sessionId));
      expect(flags.map((f) => f.kind)).toEqual(["low_asr_confidence"]);

      const participantId = (await loadSessionForGateway(h.db, sessionId))!.participantId;
      await recordVerbalConsent(h.db, sessionId, participantId, {
        grantedAt: new Date().toISOString(),
        disclosureText: "x",
        disclosureVersion: 1,
        disclosureSha256: "0".repeat(64),
      });
      await setSessionStatus(h.db, sessionId, "completed", {
        latencyStats: { turns: 2 },
        dialectDetected: "hijazi",
      });
      const [session] = await h.db
        .select()
        .from(interviewSessions)
        .where(eq(interviewSessions.id, sessionId));
      expect(session).toMatchObject({ status: "completed", dialectDetected: "hijazi" });

      // Compliance: what the client sees.
      const transcript = await transcriptForClient(h.db, orgA.orgId, sessionId);
      expect(transcript!.map((t) => t.idx)).toEqual([0, 1, 2]);
      expect(transcript![2]!.text).toBe(`رقمي ${REDACTED} وإيميلي ${REDACTED} والأكل كان حلو`);
      expect(await transcriptForClient(h.db, orgB.orgId, sessionId)).toBeNull();

      const [listed] = (await listStudies(h.db, orgA.orgId)).filter((s) => s.id === studyId);
      expect(listed!.completed).toBe(1);
      expect(listed!.sessions).toBeGreaterThanOrEqual(2);

      const sessions = await listSessionsForClient(h.db, orgA.orgId, studyId);
      expect(sessions.length).toBeGreaterThan(0);
      expect(await listSessionsForClient(h.db, orgB.orgId, studyId)).toEqual([]);
      assertNoIdentifyingData({ sessions, transcript });
    });
  });
});

/** Fails if any key in a client payload names identifying data, or any value contains it. */
function assertNoIdentifyingData(payload: unknown, path = "$"): void {
  const forbidden = new Set<string>(FORBIDDEN_CLIENT_FIELDS.map((f) => f.toLowerCase()));
  if (Array.isArray(payload)) {
    payload.forEach((v, i) => assertNoIdentifyingData(v, `${path}[${i}]`));
  } else if (payload && typeof payload === "object") {
    for (const [key, value] of Object.entries(payload)) {
      expect(forbidden.has(key.toLowerCase()), `${path}.${key}`).toBe(false);
      assertNoIdentifyingData(value, `${path}.${key}`);
    }
  } else if (typeof payload === "string") {
    expect(payload, path).not.toMatch(/05\d{8}|@[\w-]+\.\w/);
  }
}
