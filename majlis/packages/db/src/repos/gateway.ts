import { and, eq, sql } from "drizzle-orm";
import type { InterviewGuide } from "@majlis/interviewer";
import type { Db } from "../client.js";
import { consentRecords, interviewSessions, qaFlags, turns } from "../schema.js";

/** Data access used by the voice gateway; it never reads organization data. */

export async function loadSessionForGateway(db: Db, sessionId: string) {
  const [row] = await db
    .select({
      id: interviewSessions.id,
      status: interviewSessions.status,
      guide: interviewSessions.guideSnapshot,
      voiceGender: interviewSessions.voiceGender,
      participantId: interviewSessions.participantId,
    })
    .from(interviewSessions)
    .where(eq(interviewSessions.id, sessionId));
  if (!row) return null;
  const [consent] = await db
    .select({ id: consentRecords.id })
    .from(consentRecords)
    .where(and(eq(consentRecords.sessionId, sessionId), eq(consentRecords.method, "click")));
  return { ...row, guide: row.guide as InterviewGuide, hasConsent: Boolean(consent) };
}

export async function setSessionStatus(
  db: Db,
  sessionId: string,
  status: "active" | "completed" | "no_consent" | "abandoned",
  extra: { latencyStats?: unknown; dialectDetected?: string | null } = {},
) {
  const now = new Date();
  await db
    .update(interviewSessions)
    .set({
      status,
      ...(status === "active" ? { startedAt: now } : { endedAt: now }),
      ...(extra.latencyStats !== undefined ? { latencyStats: extra.latencyStats } : {}),
      ...(extra.dialectDetected !== undefined ? { dialectDetected: extra.dialectDetected } : {}),
    })
    .where(eq(interviewSessions.id, sessionId));
}

/**
 * Claims a session for one live connection. Only a session in "created" state
 * can be claimed, so the same link cannot be opened twice.
 */
export async function claimSession(db: Db, sessionId: string): Promise<boolean> {
  const claimed = await db
    .update(interviewSessions)
    .set({ status: "active", startedAt: new Date() })
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.status, "created")))
    .returning({ id: interviewSessions.id });
  return claimed.length === 1;
}

export interface TurnInput {
  /** Object-store key of the participant's recorded utterance. */
  audioRef?: string;
  role: "interviewer" | "participant";
  text: string;
  asrConfidence?: number;
  dialectTag?: string | null;
  action?: string;
  questionId?: string;
}

export const LOW_CONFIDENCE = 0.6;

/** Appends a turn; low-confidence transcriptions are flagged for human review. */
export async function appendTurn(db: Db, sessionId: string, turn: TurnInput) {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select({ idx: sql<number>`coalesce(max(${turns.idx}) + 1, 0)::int` })
      .from(turns)
      .where(eq(turns.sessionId, sessionId));
    const [row] = await tx
      .insert(turns)
      .values({
        sessionId,
        idx: next!.idx,
        role: turn.role,
        text: turn.text,
        asrConfidence: turn.asrConfidence ?? null,
        audioRef: turn.audioRef ?? null,
        dialectTag: turn.dialectTag ?? null,
        action: turn.action ?? null,
        questionId: turn.questionId ?? null,
      })
      .returning({ id: turns.id });
    if (
      turn.role === "participant" &&
      turn.asrConfidence !== undefined &&
      turn.asrConfidence < LOW_CONFIDENCE
    ) {
      await tx.insert(qaFlags).values({
        sessionId,
        turnId: row!.id,
        kind: "low_asr_confidence",
        detail: `asrConfidence=${turn.asrConfidence.toFixed(2)}`,
      });
    }
    return row!.id;
  });
}

export async function recordVerbalConsent(
  db: Db,
  sessionId: string,
  participantId: string,
  record: {
    grantedAt: string;
    disclosureText: string;
    disclosureVersion: number;
    disclosureSha256: string;
  },
  method: "verbal" | "message" = "verbal",
) {
  await db.insert(consentRecords).values({
    participantId,
    sessionId,
    method,
    grantedAt: new Date(record.grantedAt),
    disclosureText: record.disclosureText,
    disclosureVersion: record.disclosureVersion,
    disclosureSha256: record.disclosureSha256,
  });
}
