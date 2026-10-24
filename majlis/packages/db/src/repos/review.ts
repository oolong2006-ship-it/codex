import { wordErrors } from "@majlis/analysis";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import {
  consentRecords,
  interviewSessions,
  participants,
  qaFlags,
  studies,
  turnRatings,
  turns,
} from "../schema.js";
import { enqueueJob } from "./jobs.js";

/**
 * Internal review panel (reviewers of the organization). Reviewers see the
 * transcript as stored, to correct it; it is still never shown with identity.
 */

export async function openFlags(db: Db, orgId: string, limit = 50) {
  return db
    .select({
      flagId: qaFlags.id,
      kind: qaFlags.kind,
      detail: qaFlags.detail,
      createdAt: qaFlags.createdAt,
      turnId: turns.id,
      text: turns.text,
      asrConfidence: turns.asrConfidence,
      hasAudio: sql<boolean>`${turns.audioRef} is not null`,
      studyTitle: studies.title,
      dialect: interviewSessions.dialectDetected,
    })
    .from(qaFlags)
    .innerJoin(turns, eq(turns.id, qaFlags.turnId))
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .where(and(eq(studies.orgId, orgId), eq(qaFlags.status, "open")))
    .orderBy(asc(qaFlags.createdAt))
    .limit(limit);
}

/** Saves a reviewer's correction; the ASR text is kept once as original_text. */
export async function correctTranscript(
  db: Db,
  orgId: string,
  input: { turnId: string; text: string; reviewerId: string },
): Promise<boolean> {
  const text = input.text.trim();
  if (!text) return false;
  const [turn] = await db
    .select({
      id: turns.id,
      text: turns.text,
      originalText: turns.originalText,
      studyId: studies.id,
    })
    .from(turns)
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .where(
      and(eq(turns.id, input.turnId), eq(studies.orgId, orgId), eq(turns.role, "participant")),
    );
  if (!turn) return false;
  await db.transaction(async (tx) => {
    await tx
      .update(turns)
      .set({
        text,
        originalText: turn.originalText ?? turn.text,
        reviewedAt: new Date(),
        reviewedBy: input.reviewerId,
        // The text changed, so its vector must be recomputed.
        embedding: null,
      })
      .where(eq(turns.id, turn.id));
    await tx
      .update(qaFlags)
      .set({ status: "resolved", resolvedBy: input.reviewerId, resolvedAt: new Date() })
      .where(and(eq(qaFlags.turnId, turn.id), eq(qaFlags.status, "open")));
  });
  await enqueueJob(
    db,
    "analyze-study",
    { studyId: turn.studyId, embed: true },
    { dedupeKey: `analyze-study:${turn.studyId}` },
  );
  return true;
}

export async function dismissFlag(db: Db, orgId: string, flagId: string, reviewerId: string) {
  const [owned] = await db
    .select({ id: qaFlags.id })
    .from(qaFlags)
    .innerJoin(interviewSessions, eq(interviewSessions.id, qaFlags.sessionId))
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .where(and(eq(qaFlags.id, flagId), eq(studies.orgId, orgId)));
  if (!owned) return false;
  await db
    .update(qaFlags)
    .set({ status: "dismissed", resolvedBy: reviewerId, resolvedAt: new Date() })
    .where(eq(qaFlags.id, flagId));
  return true;
}

/** Interviewer lines this reviewer has not rated yet, newest interviews first. */
export async function interviewerTurnsToRate(
  db: Db,
  orgId: string,
  reviewerId: string,
  limit = 10,
) {
  return db
    .select({
      turnId: turns.id,
      text: turns.text,
      hasAudio: sql<boolean>`${turns.audioRef} is not null`,
    })
    .from(turns)
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .leftJoin(
      turnRatings,
      and(eq(turnRatings.turnId, turns.id), eq(turnRatings.reviewerId, reviewerId)),
    )
    .where(and(eq(studies.orgId, orgId), eq(turns.role, "interviewer"), isNull(turnRatings.id)))
    .orderBy(desc(interviewSessions.createdAt), asc(turns.idx))
    .limit(limit);
}

export async function rateInterviewerTurn(
  db: Db,
  orgId: string,
  input: { turnId: string; reviewerId: string; naturalness: number; dialectCorrect: boolean },
): Promise<boolean> {
  if (!Number.isInteger(input.naturalness) || input.naturalness < 1 || input.naturalness > 5)
    return false;
  const [owned] = await db
    .select({ id: turns.id })
    .from(turns)
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .where(
      and(eq(turns.id, input.turnId), eq(studies.orgId, orgId), eq(turns.role, "interviewer")),
    );
  if (!owned) return false;
  await db
    .insert(turnRatings)
    .values(input)
    .onConflictDoUpdate({
      target: [turnRatings.turnId, turnRatings.reviewerId],
      set: { naturalness: input.naturalness, dialectCorrect: input.dialectCorrect },
    });
  return true;
}

export interface QualityMetrics {
  /** Per dialect, from reviewed transcripts (reviewer text = reference, ASR = hypothesis). */
  wer: { dialect: string; wer: number; words: number; turns: number }[];
  mos: { mean: number | null; ratings: number };
  dialectCorrect: { share: number | null; ratings: number };
  latencyP90: { value: number | null; sessions: number };
}

/** The section-3 acceptance metrics, measured on real interviews. */
export async function qualityMetrics(db: Db, orgId: string): Promise<QualityMetrics> {
  const reviewed = await db
    .select({
      original: turns.originalText,
      text: turns.text,
      dialect: sql<string>`coalesce(${turns.dialectTag}, ${participants.dialect}, ${interviewSessions.dialectDetected}, 'unknown')`,
    })
    .from(turns)
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .innerJoin(participants, eq(participants.id, interviewSessions.participantId))
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .where(
      and(eq(studies.orgId, orgId), isNotNull(turns.reviewedAt), eq(turns.role, "participant")),
    );
  const byDialect = new Map<string, { errors: number; words: number; turns: number }>();
  for (const r of reviewed) {
    const { errors, words } = wordErrors(r.text, r.original ?? r.text);
    const acc = byDialect.get(r.dialect) ?? { errors: 0, words: 0, turns: 0 };
    acc.errors += errors;
    acc.words += words;
    acc.turns += 1;
    byDialect.set(r.dialect, acc);
  }
  const [ratings] = await db
    .select({
      mean: sql<number | null>`avg(${turnRatings.naturalness})::float`,
      ratings: sql<number>`count(${turnRatings.naturalness})::int`,
      dialectShare: sql<
        number | null
      >`avg(case when ${turnRatings.dialectCorrect} then 1.0 when ${turnRatings.dialectCorrect} = false then 0.0 end)::float`,
      dialectRatings: sql<number>`count(${turnRatings.dialectCorrect})::int`,
    })
    .from(turnRatings)
    .innerJoin(turns, eq(turns.id, turnRatings.turnId))
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .where(eq(studies.orgId, orgId));
  const [latency] = await db
    .select({
      p90: sql<
        number | null
      >`percentile_cont(0.9) within group (order by (${interviewSessions.latencyStats}->'responseMs'->>'p90')::float)`,
      sessions: sql<number>`count((${interviewSessions.latencyStats}->'responseMs'->>'p90'))::int`,
    })
    .from(interviewSessions)
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .where(eq(studies.orgId, orgId));
  return {
    wer: [...byDialect]
      .map(([dialect, a]) => ({
        dialect,
        wer: a.words ? a.errors / a.words : 0,
        words: a.words,
        turns: a.turns,
      }))
      .sort((a, b) => b.words - a.words),
    mos: { mean: ratings?.mean ?? null, ratings: ratings?.ratings ?? 0 },
    dialectCorrect: { share: ratings?.dialectShare ?? null, ratings: ratings?.dialectRatings ?? 0 },
    latencyP90: { value: latency?.p90 ?? null, sessions: latency?.sessions ?? 0 },
  };
}

/** Audio for internal reviewers of the organization. */
export async function audioRefForReviewer(db: Db, orgId: string, turnId: string) {
  const [row] = await db
    .select({ ref: turns.audioRef })
    .from(turns)
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .where(and(eq(turns.id, turnId), eq(studies.orgId, orgId)));
  return row?.ref ?? null;
}

/**
 * An interviewer line to rate, with the voice it was spoken in. Interviewer audio
 * is not stored, so reviewers listen to it re-synthesized by the same TTS.
 */
export async function interviewerTurnForReview(db: Db, orgId: string, turnId: string) {
  const [row] = await db
    .select({ text: turns.text, voiceGender: interviewSessions.voiceGender })
    .from(turns)
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .where(and(eq(turns.id, turnId), eq(studies.orgId, orgId), eq(turns.role, "interviewer")));
  return row ?? null;
}

/** Audio for the client: only when the participant separately allowed it. */
export async function audioRefForClient(db: Db, orgId: string, turnId: string) {
  const [row] = await db
    .select({ ref: turns.audioRef })
    .from(turns)
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .innerJoin(
      consentRecords,
      and(
        eq(consentRecords.sessionId, interviewSessions.id),
        eq(consentRecords.allowAudioPlayback, true),
      ),
    )
    .where(and(eq(turns.id, turnId), eq(studies.orgId, orgId), eq(turns.role, "participant")));
  return row?.ref ?? null;
}

/** Answers of a study for QA detection. */
export async function studyAnswersForQa(db: Db, studyId: string) {
  return db
    .select({ turnId: turns.id, sessionId: turns.sessionId, text: turns.text })
    .from(turns)
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .where(
      and(
        eq(interviewSessions.studyId, studyId),
        eq(turns.role, "participant"),
        // Replies to the consent prompt are expected to be short.
        isNotNull(turns.questionId),
      ),
    );
}

/** Adds QA flags that do not exist yet for the same turn and kind. */
export async function addQaFlags(
  db: Db,
  flags: {
    sessionId: string;
    turnId: string;
    kind: "too_short" | "repeated" | "automated";
    detail: string;
  }[],
) {
  if (flags.length === 0) return 0;
  const existing = await db
    .select({ turnId: qaFlags.turnId, kind: qaFlags.kind })
    .from(qaFlags)
    .where(
      inArray(
        qaFlags.turnId,
        flags.map((f) => f.turnId),
      ),
    );
  const have = new Set(existing.map((e) => `${e.turnId}:${e.kind}`));
  const fresh = flags.filter((f) => !have.has(`${f.turnId}:${f.kind}`));
  if (fresh.length) await db.insert(qaFlags).values(fresh);
  return fresh.length;
}
