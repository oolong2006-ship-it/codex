import {
  appendTurn,
  claimSession,
  loadSessionForGateway,
  recordVerbalConsent,
  setSessionStatus,
  type Db,
} from "@majlis/db";
import type { Dialect } from "@majlis/dialect";
import type { ConsentRecord, TranscriptEntry } from "@majlis/interviewer";
import type { LatencySummary } from "@majlis/voice-client/protocol";
import type { FinalStatus, SessionRecord, SessionStore } from "./sessions.js";

/** Sessions created by the web app (after click consent) and stored in PostgreSQL. */
export class DbSessionStore implements SessionStore {
  private readonly participants = new Map<string, string>();

  constructor(private readonly db: Db) {}

  async get(id: string): Promise<SessionRecord | undefined> {
    const row = await loadSessionForGateway(this.db, id);
    if (!row) return undefined;
    this.participants.set(id, row.participantId);
    return {
      id: row.id,
      guide: row.guide,
      settings: { voiceGender: row.voiceGender },
      hasConsent: row.hasConsent,
      status: row.status,
    };
  }

  claim(id: string) {
    return claimSession(this.db, id);
  }

  async appendTurns(id: string, entries: TranscriptEntry[], dialect: Dialect | null) {
    for (const e of entries) {
      await appendTurn(this.db, id, {
        role: e.role,
        text: e.text,
        ...(e.asrConfidence !== undefined ? { asrConfidence: e.asrConfidence } : {}),
        ...(e.action ? { action: e.action } : {}),
        ...(e.questionId ? { questionId: e.questionId } : {}),
        dialectTag: e.role === "participant" ? dialect : null,
      });
    }
  }

  async recordVerbalConsent(id: string, record: ConsentRecord) {
    const participantId = this.participants.get(id);
    if (participantId) await recordVerbalConsent(this.db, id, participantId, record);
  }

  async finish(id: string, status: FinalStatus, latency: LatencySummary, dialect: Dialect | null) {
    await setSessionStatus(this.db, id, status, {
      latencyStats: latency,
      dialectDetected: dialect,
    });
  }
}
