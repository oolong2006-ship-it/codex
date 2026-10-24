import { randomBytes } from "node:crypto";
import type { InterviewGuide, PersistedEngineState } from "@majlis/interviewer";
import { eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { decryptPii, encryptPii, hashPhone, normalizePhone, type PiiKeys } from "../pii-crypto.js";
import { interviewSessions, participants, studies, whatsappContacts } from "../schema.js";
import { latestGuide } from "./studies.js";

export async function upsertContact(db: Db, phone: string, keys: PiiKeys): Promise<string> {
  const phoneHash = hashPhone(phone, keys);
  const [existing] = await db
    .select({ id: whatsappContacts.id })
    .from(whatsappContacts)
    .where(eq(whatsappContacts.phoneHash, phoneHash));
  if (existing) {
    await db
      .update(whatsappContacts)
      .set({ lastMessageAt: new Date() })
      .where(eq(whatsappContacts.id, existing.id));
    return existing.id;
  }
  const [row] = await db
    .insert(whatsappContacts)
    .values({
      phoneHash,
      phoneEncrypted: encryptPii(normalizePhone(phone), keys),
      lastMessageAt: new Date(),
    })
    .onConflictDoUpdate({ target: whatsappContacts.phoneHash, set: { lastMessageAt: new Date() } })
    .returning({ id: whatsappContacts.id });
  return row!.id;
}

export async function contactPhone(
  db: Db,
  contactId: string,
  keys: PiiKeys,
): Promise<string | null> {
  const [row] = await db
    .select({ blob: whatsappContacts.phoneEncrypted })
    .from(whatsappContacts)
    .where(eq(whatsappContacts.id, contactId));
  return row ? decryptPii(row.blob, keys) : null;
}

/** The contact's current interview, if any. */
export async function contactSession(db: Db, contactId: string) {
  const [row] = await db
    .select({
      id: interviewSessions.id,
      status: interviewSessions.status,
      engineState: interviewSessions.engineState,
      guide: interviewSessions.guideSnapshot,
      voiceGender: interviewSessions.voiceGender,
      participantId: interviewSessions.participantId,
      studyId: interviewSessions.studyId,
    })
    .from(whatsappContacts)
    .innerJoin(interviewSessions, eq(interviewSessions.id, whatsappContacts.sessionId))
    .where(eq(whatsappContacts.id, contactId));
  return row
    ? {
        ...row,
        guide: row.guide as InterviewGuide,
        engineState: row.engineState as PersistedEngineState | null,
      }
    : null;
}

/**
 * Starts a WhatsApp interview from an invite code. Consent is given by reply
 * to the disclosure message and recorded then; until that, nothing is asked.
 */
export async function startWhatsappSession(db: Db, contactId: string, inviteToken: string) {
  const [study] = await db.select().from(studies).where(eq(studies.inviteToken, inviteToken));
  if (!study || study.status !== "recruiting") return null;
  const guide = await latestGuide(db, study.id);
  if (!guide) return null;
  const voiceGender: "male" | "female" = study.voiceSetting === "male" ? "male" : "female";
  const guideSnapshot: InterviewGuide = {
    ...guide.content,
    studyId: study.id,
    durationPhrase: study.durationPhrase,
    ...(study.incentive ? { incentive: study.incentive } : {}),
  };
  const sessionId = randomBytes(18).toString("base64url");
  await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(participants)
      .values({ studyId: study.id })
      .returning({ id: participants.id });
    await tx.insert(interviewSessions).values({
      id: sessionId,
      studyId: study.id,
      participantId: p!.id,
      guideVersion: guide.version,
      guideSnapshot,
      channel: "whatsapp",
      voiceGender,
      status: "active",
      startedAt: new Date(),
      contactId,
    });
    await tx.update(whatsappContacts).set({ sessionId }).where(eq(whatsappContacts.id, contactId));
  });
  return { sessionId, guide: guideSnapshot, voiceGender, studyId: study.id };
}

export async function saveEngineState(db: Db, sessionId: string, state: PersistedEngineState) {
  await db
    .update(interviewSessions)
    .set({ engineState: state })
    .where(eq(interviewSessions.id, sessionId));
}

export async function detachContactSession(db: Db, contactId: string) {
  await db
    .update(whatsappContacts)
    .set({ sessionId: null })
    .where(eq(whatsappContacts.id, contactId));
}
