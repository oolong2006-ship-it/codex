import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import {
  auditLog,
  insights,
  interviewSessions,
  participants,
  personas,
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
const DEFAULT_CONTACT_DAYS = 30;

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
 * Removes quotes of erased turns from results and personas at once, so they
 * never show between the erasure and the rebuild that follows.
 */
async function scrubQuotes(db: Db, studyIds: string[], turnIds: string[]): Promise<void> {
  if (studyIds.length === 0 || turnIds.length === 0) return;
  const erased = sql`array[${sql.join(
    turnIds.map((id) => sql`${id}`),
    sql`, `,
  )}]::text[]`;
  const keep = (column: typeof insights.quotes | typeof personas.evidence) =>
    sql`coalesce((select jsonb_agg(q) from jsonb_array_elements(${column}) q where not ((q->>'turnId') = any(${erased}))), '[]'::jsonb)`;
  await db
    .update(insights)
    .set({ quotes: keep(insights.quotes) })
    .where(inArray(insights.studyId, studyIds));
  const orgs = db
    .select({ orgId: studies.orgId })
    .from(studies)
    .where(inArray(studies.id, studyIds));
  await db
    .update(personas)
    .set({ evidence: keep(personas.evidence) })
    .where(inArray(personas.orgId, orgs));
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
  const erasedTurns = sessionIds.length
    ? await db.select({ id: turns.id }).from(turns).where(inArray(turns.sessionId, sessionIds))
    : [];
  await scrubQuotes(
    db,
    [...new Set(sessions.map((s) => s.studyId))],
    erasedTurns.map((t) => t.id),
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
 * interviews older than the organization's transcript retention are erased;
 * WhatsApp numbers are kept only while a conversation is going on.
 */
export async function purgeExpired(
  db: Db,
  store: Deleter,
  now = new Date(),
  options: { contactDays?: number } = {},
) {
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

  // 3. WhatsApp numbers idle for longer than contactDays. An interview left
  // unfinished there cannot be resumed, so it goes the same way as abandoned ones.
  const contactDays = options.contactDays ?? DEFAULT_CONTACT_DAYS;
  const idle = await db
    .select({ id: whatsappContacts.id })
    .from(whatsappContacts)
    .where(
      lt(
        sql`coalesce(${whatsappContacts.lastMessageAt}, ${whatsappContacts.createdAt})`,
        sql`${now.toISOString()}::timestamptz - make_interval(days => ${contactDays})`,
      ),
    );
  const idleIds = idle.map((c) => c.id);
  let unfinished = 0;
  if (idleIds.length) {
    const open = await db
      .select({ participantId: interviewSessions.participantId })
      .from(interviewSessions)
      .where(and(inArray(interviewSessions.contactId, idleIds), isNull(interviewSessions.endedAt)));
    unfinished = (
      await eraseParticipants(
        db,
        store,
        [...new Set(open.map((o) => o.participantId))],
        "abandoned",
      )
    ).sessions;
    // Completed interviews stay (erasable with their deletion code), unlinked from the number.
    await db
      .update(interviewSessions)
      .set({ contactId: null })
      .where(inArray(interviewSessions.contactId, idleIds));
    await db.delete(whatsappContacts).where(inArray(whatsappContacts.id, idleIds));
  }

  const summary = {
    recordings,
    sessions: erased.sessions,
    abandonedSessions: abandoned.sessions + unfinished,
    whatsappNumbers: idleIds.length,
  };
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
