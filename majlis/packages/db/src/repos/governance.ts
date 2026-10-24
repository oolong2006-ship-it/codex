import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import {
  auditLog,
  interviewSessions,
  participants,
  retentionPolicies,
  studies,
  turns,
  whatsappContacts,
} from "../schema.js";
import { enqueueJob } from "./jobs.js";
import { hashDeletionCode } from "./participation.js";

/** Only what deletion needs from the object store. */
export interface Deleter {
  delete(key: string): Promise<void>;
}

const DEFAULT_TRANSCRIPT_DAYS = 365;

async function deleteObjects(store: Deleter, keys: (string | null)[]): Promise<number> {
  let n = 0;
  for (const key of keys) {
    if (!key) continue;
    await store.delete(key);
    n++;
  }
  return n;
}

/** Rebuild what was derived from deleted interviews (themes, quotes, personas). */
async function reanalyze(db: Db, studyIds: string[]): Promise<void> {
  if (studyIds.length === 0) return;
  const owners = await db
    .selectDistinct({ studyId: studies.id, orgId: studies.orgId })
    .from(studies)
    .where(inArray(studies.id, studyIds));
  for (const { studyId, orgId } of owners) {
    await enqueueJob(db, "analyze-study", { studyId }, { dedupeKey: `analyze-study:${studyId}` });
    await enqueueJob(db, "update-personas", { orgId }, { dedupeKey: `personas:${orgId}` });
  }
}

/**
 * Erases every interview of the participants given: recordings, transcripts,
 * embeddings, consent records and segment attributes. Audit keeps counts only.
 */
async function eraseParticipants(db: Db, store: Deleter, participantIds: string[], reason: string) {
  if (participantIds.length === 0) return { sessions: 0, recordings: 0 };
  const sessions = await db
    .select({ id: interviewSessions.id, studyId: interviewSessions.studyId })
    .from(interviewSessions)
    .where(inArray(interviewSessions.participantId, participantIds));
  const sessionIds = sessions.map((s) => s.id);
  const audio = sessionIds.length
    ? await db
        .select({ ref: turns.audioRef })
        .from(turns)
        .where(and(inArray(turns.sessionId, sessionIds), isNotNull(turns.audioRef)))
    : [];
  const recordings = await deleteObjects(
    store,
    audio.map((a) => a.ref),
  );
  // Sessions, turns, consent records and flags cascade from the participant row.
  await db.delete(participants).where(inArray(participants.id, participantIds));
  await db.insert(auditLog).values({
    kind: "erasure",
    detail: {
      reason,
      participants: participantIds.length,
      sessions: sessionIds.length,
      recordings,
    },
  });
  await reanalyze(db, [...new Set(sessions.map((s) => s.studyId))]);
  return { sessions: sessionIds.length, recordings };
}

/** The participant's right to deletion, using the code shown at the end of the interview. */
export async function eraseByDeletionCode(db: Db, store: Deleter, code: string): Promise<boolean> {
  const [p] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.deletionTokenHash, hashDeletionCode(code)));
  if (!p) return false;
  await eraseParticipants(db, store, [p.id], "participant_request");
  return true;
}

/** Deletion requested over WhatsApp ("احذف"): everything tied to that number. */
export async function eraseWhatsappContact(
  db: Db,
  store: Deleter,
  contactId: string,
): Promise<void> {
  const [contact] = await db
    .select()
    .from(whatsappContacts)
    .where(eq(whatsappContacts.id, contactId));
  if (!contact) return;
  const linked = await db
    .select({ participantId: interviewSessions.participantId })
    .from(interviewSessions)
    .where(eq(interviewSessions.contactId, contactId));
  await eraseParticipants(
    db,
    store,
    [...new Set(linked.map((l) => l.participantId))],
    "whatsapp_request",
  );
  await db.delete(whatsappContacts).where(eq(whatsappContacts.id, contactId));
}

/**
 * Retention: recordings older than the study's retention are deleted; whole
 * interviews older than the organization's transcript retention are erased.
 */
export async function purgeExpired(db: Db, store: Deleter, now = new Date()) {
  // 1. Recordings, per study retention.
  const expiredAudio = await db
    .select({ turnId: turns.id, ref: turns.audioRef, sessionId: turns.sessionId })
    .from(turns)
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .where(
      and(
        isNotNull(turns.audioRef),
        isNotNull(interviewSessions.endedAt),
        lt(
          interviewSessions.endedAt,
          sql`${now.toISOString()}::timestamptz - make_interval(days => ${studies.retentionDays})`,
        ),
      ),
    );
  const recordings = await deleteObjects(
    store,
    expiredAudio.map((a) => a.ref),
  );
  if (expiredAudio.length) {
    await db
      .update(turns)
      .set({ audioRef: null })
      .where(
        inArray(
          turns.id,
          expiredAudio.map((a) => a.turnId),
        ),
      );
    await db
      .update(interviewSessions)
      .set({ recordingsPurgedAt: now })
      .where(inArray(interviewSessions.id, [...new Set(expiredAudio.map((a) => a.sessionId))]));
  }

  // 2. Whole interviews, per organization transcript retention.
  const expiredParticipants = await db
    .select({ participantId: interviewSessions.participantId })
    .from(interviewSessions)
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .leftJoin(retentionPolicies, eq(retentionPolicies.orgId, studies.orgId))
    .where(
      and(
        isNotNull(interviewSessions.endedAt),
        lt(
          interviewSessions.endedAt,
          sql`${now.toISOString()}::timestamptz - make_interval(days => coalesce(${retentionPolicies.transcriptsDays}, ${DEFAULT_TRANSCRIPT_DAYS}))`,
        ),
      ),
    );
  const erased = await eraseParticipants(
    db,
    store,
    [...new Set(expiredParticipants.map((p) => p.participantId))],
    "retention",
  );

  // Abandoned sessions that never ended are cleaned up after a day.
  const stale = await db
    .select({ participantId: interviewSessions.participantId })
    .from(interviewSessions)
    .where(
      and(
        isNull(interviewSessions.endedAt),
        lt(interviewSessions.createdAt, sql`${now.toISOString()}::timestamptz - interval '1 day'`),
        sql`${interviewSessions.channel} = 'browser'`,
      ),
    );
  const abandoned = await eraseParticipants(
    db,
    store,
    [...new Set(stale.map((s) => s.participantId))],
    "abandoned",
  );

  const summary = { recordings, sessions: erased.sessions, abandonedSessions: abandoned.sessions };
  await db.insert(auditLog).values({ kind: "retention_run", detail: summary });
  return summary;
}

export async function setRetentionPolicy(
  db: Db,
  orgId: string,
  policy: { recordingsDays: number; transcriptsDays: number },
) {
  await db
    .insert(retentionPolicies)
    .values({ orgId, ...policy })
    .onConflictDoUpdate({
      target: retentionPolicies.orgId,
      set: { ...policy, updatedAt: new Date() },
    });
}
