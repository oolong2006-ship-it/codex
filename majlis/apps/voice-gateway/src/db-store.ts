import {
  enqueueJob,
  appendTurn,
  claimSession,
  loadSessionForGateway,
  recordVerbalConsent,
  setSessionStatus,
  type Db,
} from "@majlis/db";
import { randomUUID } from "node:crypto";
import type { Dialect } from "@majlis/dialect";
import { pcmToWav, type ObjectStore } from "@majlis/storage";
import type { ConsentRecord, TranscriptEntry } from "@majlis/interviewer";
import type { LatencySummary } from "@majlis/voice-client/protocol";
import type { FinalStatus, SessionRecord, SessionStore } from "./sessions.js";

/** Sessions created by the web app (after click consent) and stored in PostgreSQL. */
export class DbSessionStore implements SessionStore {
  private readonly participants = new Map<string, string>();

  /** Without an object store, utterances are transcribed but not recorded. */
  constructor(
    private readonly db: Db,
    private readonly recordings?: ObjectStore,
  ) {}

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

  async appendTurns(
    id: string,
    entries: TranscriptEntry[],
    dialect: Dialect | null,
    audioFor?: (entry: TranscriptEntry) => Uint8Array | undefined,
  ) {
    for (const e of entries) {
      const pcm = e.role === "participant" ? audioFor?.(e) : undefined;
      let audioRef: string | undefined;
      if (pcm && this.recordings) {
        // Keys carry no personal data: session token + random id.
        audioRef = `recordings/${id}/${randomUUID()}.wav`;
        await this.recordings.put(audioRef, pcmToWav(pcm), "audio/wav");
      }
      await appendTurn(this.db, id, {
        ...(audioRef ? { audioRef } : {}),
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
    // Completed interviews feed the analysis and the consumer memory.
    if (status === "completed") {
      await enqueueJob(
        this.db,
        "analyze-session",
        { sessionId: id },
        { dedupeKey: `analyze:${id}` },
      );
    }
  }
}
