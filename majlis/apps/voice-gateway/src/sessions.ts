import { randomBytes } from "node:crypto";
import type { Dialect } from "@majlis/dialect";
import { validateGuide, type InterviewGuide } from "@majlis/interviewer";
import type { LatencySummary } from "@majlis/voice-client/protocol";

export interface SessionSettings {
  /** Fixed by the study; otherwise the participant's choice from the hello message is used. */
  voiceGender?: "male" | "female";
  dialect?: Dialect;
}

export interface SessionRecord {
  id: string;
  guide: InterviewGuide;
  settings: SessionSettings;
  createdAt: Date;
  status: "created" | "active" | "completed" | "no_consent" | "abandoned";
  latency?: LatencySummary;
}

/** Storage seam: in-memory now, PostgreSQL once packages/db lands. */
export interface SessionStore {
  create(guide: InterviewGuide, settings?: SessionSettings, id?: string): Promise<SessionRecord>;
  get(id: string): Promise<SessionRecord | undefined>;
  update(id: string, patch: Partial<Pick<SessionRecord, "status" | "latency">>): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  async create(guide: InterviewGuide, settings: SessionSettings = {}, id?: string) {
    // Session ids double as capability tokens in the stream URL, so they are unguessable.
    const record: SessionRecord = {
      id: id ?? randomBytes(18).toString("base64url"),
      guide: validateGuide(guide),
      settings,
      createdAt: new Date(),
      status: "created",
    };
    this.sessions.set(record.id, record);
    return record;
  }

  async get(id: string) {
    return this.sessions.get(id);
  }

  async update(id: string, patch: Partial<Pick<SessionRecord, "status" | "latency">>) {
    const record = this.sessions.get(id);
    if (record) Object.assign(record, patch);
  }
}
