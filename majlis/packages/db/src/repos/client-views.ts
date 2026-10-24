import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { redactPII } from "../privacy.js";
import { consentRecords, interviewSessions, participants, studies, turns } from "../schema.js";

/**
 * Everything here is what the client (the research buyer) may see. Rows are
 * scoped to the caller's organization, participant data is limited to segment
 * attributes, and all free text passes through PII redaction.
 */

export interface ClientSessionSummary {
  id: string;
  status: string;
  channel: string;
  startedAt: string | null;
  endedAt: string | null;
  dialectDetected: string | null;
  participant: {
    gender: string | null;
    city: string | null;
    ageBand: string | null;
    dialect: string | null;
  };
  audioPlaybackAllowed: boolean;
}

export async function listSessionsForClient(
  db: Db,
  orgId: string,
  studyId: string,
): Promise<ClientSessionSummary[]> {
  const rows = await db
    .select({
      id: interviewSessions.id,
      status: interviewSessions.status,
      channel: interviewSessions.channel,
      startedAt: interviewSessions.startedAt,
      endedAt: interviewSessions.endedAt,
      dialectDetected: interviewSessions.dialectDetected,
      gender: participants.gender,
      city: participants.city,
      ageBand: participants.ageBand,
      dialect: participants.dialect,
      allow: consentRecords.allowAudioPlayback,
    })
    .from(interviewSessions)
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .innerJoin(participants, eq(participants.id, interviewSessions.participantId))
    .leftJoin(
      consentRecords,
      and(eq(consentRecords.sessionId, interviewSessions.id), eq(consentRecords.method, "click")),
    )
    .where(and(eq(studies.orgId, orgId), eq(studies.id, studyId)))
    .orderBy(desc(interviewSessions.createdAt));
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    channel: r.channel,
    startedAt: r.startedAt?.toISOString() ?? null,
    endedAt: r.endedAt?.toISOString() ?? null,
    dialectDetected: r.dialectDetected,
    participant: { gender: r.gender, city: r.city, ageBand: r.ageBand, dialect: r.dialect },
    audioPlaybackAllowed: r.allow ?? false,
  }));
}

export interface ClientTurn {
  idx: number;
  role: "interviewer" | "participant";
  text: string;
  questionId: string | null;
}

export async function transcriptForClient(
  db: Db,
  orgId: string,
  sessionId: string,
): Promise<ClientTurn[] | null> {
  const [owned] = await db
    .select({ id: interviewSessions.id })
    .from(interviewSessions)
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .where(and(eq(interviewSessions.id, sessionId), eq(studies.orgId, orgId)));
  if (!owned) return null;
  const rows = await db
    .select({ idx: turns.idx, role: turns.role, text: turns.text, questionId: turns.questionId })
    .from(turns)
    .where(eq(turns.sessionId, sessionId))
    .orderBy(asc(turns.idx));
  return rows.map((r) => ({ ...r, text: redactPII(r.text) }));
}
