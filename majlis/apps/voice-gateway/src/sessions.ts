import { randomBytes } from "node:crypto";
import type { Dialect } from "@majlis/dialect";
import type { ConsentRecord, InterviewGuide, TranscriptEntry } from "@majlis/interviewer";
import { validateGuide } from "@majlis/interviewer";
import type { LatencySummary } from "@majlis/voice-client/protocol";

export interface SessionSettings {
  /** Fixed for the session (study setting or the participant's choice at consent). */
  voiceGender?: "male" | "female";
  dialect?: Dialect;
}

export interface SessionRecord {
  id: string;
  guide: InterviewGuide;
  settings: SessionSettings;
  /** An explicit consent record exists; no interview runs without one. */
  hasConsent: boolean;
  status: "created" | "active" | "completed" | "no_consent" | "abandoned";
}

export type FinalStatus = "completed" | "no_consent" | "abandoned";

/** Storage seam between the gateway and the database (or memory for dev/tests). */
export interface SessionStore {
  get(id: string): Promise<SessionRecord | undefined>;
  /** Marks a created session active; false if it was already used. */
  claim(id: string): Promise<boolean>;
  appendTurns(id: string, entries: TranscriptEntry[], dialect: Dialect | null): Promise<void>;
  recordVerbalConsent(id: string, record: ConsentRecord): Promise<void>;
  finish(
    id: string,
    status: FinalStatus,
    latency: LatencySummary,
    dialect: Dialect | null,
  ): Promise<void>;
  /** Only stores that back the internal API / dev page can create sessions. */
  create?(guide: InterviewGuide, settings?: SessionSettings): Promise<SessionRecord>;
}

export class InMemorySessionStore implements SessionStore {
  readonly sessions = new Map<
    string,
    SessionRecord & {
      turns: TranscriptEntry[];
      latency?: LatencySummary;
      consents: ConsentRecord[];
    }
  >();

  async create(guide: InterviewGuide, settings: SessionSettings = {}) {
    // Session ids double as capability tokens in the stream URL, so they are unguessable.
    const record = {
      id: randomBytes(18).toString("base64url"),
      guide: validateGuide(guide),
      settings,
      // The caller of the internal API is responsible for having collected consent.
      hasConsent: true,
      status: "created" as const,
      turns: [],
      consents: [],
    };
    this.sessions.set(record.id, record);
    return record;
  }

  async get(id: string) {
    return this.sessions.get(id);
  }

  async claim(id: string) {
    const s = this.sessions.get(id);
    if (!s || s.status !== "created") return false;
    s.status = "active";
    return true;
  }

  async appendTurns(id: string, entries: TranscriptEntry[]) {
    this.sessions.get(id)?.turns.push(...entries);
  }

  async recordVerbalConsent(id: string, record: ConsentRecord) {
    this.sessions.get(id)?.consents.push(record);
  }

  async finish(id: string, status: FinalStatus, latency: LatencySummary) {
    const s = this.sessions.get(id);
    if (s) Object.assign(s, { status, latency });
  }
}
