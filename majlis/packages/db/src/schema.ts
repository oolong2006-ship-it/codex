import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/** Must match the embedding model (bge-m3 / multilingual-e5-large: 1024). */
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * Core data model. Participant rows deliberately carry no identifying data:
 * no name, phone, email or IP. Anything the client sees is further redacted.
 */

export const userRole = pgEnum("user_role", ["owner", "admin", "analyst", "reviewer"]);
export const studyStatus = pgEnum("study_status", ["draft", "recruiting", "closed"]);
export const voiceSetting = pgEnum("voice_setting", ["participant_choice", "male", "female"]);
export const gender = pgEnum("gender", ["male", "female"]);
export const ageBand = pgEnum("age_band", ["18-24", "25-34", "35-44", "45-54", "55+"]);
export const channel = pgEnum("channel", ["browser", "whatsapp", "phone"]);
export const sessionStatus = pgEnum("session_status", [
  "created",
  "active",
  "completed",
  "no_consent",
  "abandoned",
]);
export const turnRole = pgEnum("turn_role", ["interviewer", "participant"]);
export const consentMethod = pgEnum("consent_method", ["click", "verbal", "message"]);
export const qaFlagKind = pgEnum("qa_flag_kind", [
  "low_asr_confidence",
  "too_short",
  "repeated",
  "automated",
]);
export const qaStatus = pgEnum("qa_status", ["open", "resolved", "dismissed"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRole("role").notNull().default("analyst"),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

/** Dashboard login sessions; only a SHA-256 of the cookie token is stored. */
export const authSessions = pgTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export interface StudySegment {
  cities: string[];
  ageBands: string[];
  genders: string[];
  dialects: string[];
}

export const studies = pgTable(
  "studies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    topic: text("topic").notNull(),
    templateId: text("template_id"),
    status: studyStatus("status").notNull().default("draft"),
    segment: jsonb("segment")
      .$type<StudySegment>()
      .notNull()
      .default({ cities: [], ageBands: [], genders: [], dialects: [] }),
    voiceSetting: voiceSetting("voice_setting").notNull().default("participant_choice"),
    /** Off by default; turning it on also requires separate participant consent. */
    videoEnabled: boolean("video_enabled").notNull().default(false),
    incentive: text("incentive"),
    durationPhrase: text("duration_phrase").notNull().default("عشر دقايق"),
    retentionDays: integer("retention_days").notNull().default(90),
    inviteToken: text("invite_token").notNull().unique(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("studies_org_idx").on(t.orgId)],
);

export const interviewGuides = pgTable(
  "interview_guides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** InterviewGuide sections and questions (Question: sensitive, followUpPolicy, ...). */
    content: jsonb("content").notNull(),
    screener: jsonb("screener").notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("guides_study_version_idx").on(t.studyId, t.version)],
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    dialect: text("dialect"),
    gender: gender("gender"),
    city: text("city"),
    ageBand: ageBand("age_band"),
    /** SHA-256 of the code given to the participant to request deletion later. */
    deletionTokenHash: text("deletion_token_hash").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("participants_study_idx").on(t.studyId)],
);

export const interviewSessions = pgTable(
  "interview_sessions",
  {
    /** Random, unguessable: it is also the capability token in the stream URL. */
    id: text("id").primaryKey(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    guideVersion: integer("guide_version").notNull(),
    /** Frozen copy of the guide used, so later edits never change a past interview. */
    guideSnapshot: jsonb("guide_snapshot").notNull(),
    channel: channel("channel").notNull().default("browser"),
    voiceGender: gender("voice_gender").notNull(),
    status: sessionStatus("status").notNull().default("created"),
    dialectDetected: text("dialect_detected"),
    latencyStats: jsonb("latency_stats"),
    /** Set once the worker has embedded and analyzed this interview. */
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    /** Interviewer state for asynchronous channels (WhatsApp), between messages. */
    engineState: jsonb("engine_state"),
    recordingsPurgedAt: timestamp("recordings_purged_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_study_idx").on(t.studyId)],
);

export const consentRecords = pgTable("consent_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  participantId: uuid("participant_id")
    .notNull()
    .references(() => participants.id, { onDelete: "cascade" }),
  sessionId: text("session_id")
    .notNull()
    .references(() => interviewSessions.id, { onDelete: "cascade" }),
  method: consentMethod("method").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
  disclosureText: text("disclosure_text").notNull(),
  disclosureVersion: integer("disclosure_version").notNull(),
  disclosureSha256: text("disclosure_sha256").notNull(),
  /** Separate, optional permission for the client to listen to this participant's clips. */
  allowAudioPlayback: boolean("allow_audio_playback").notNull().default(false),
  createdAt: createdAt(),
});

export const turns = pgTable(
  "turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    role: turnRole("role").notNull(),
    text: text("text").notNull(),
    audioRef: text("audio_ref"),
    asrConfidence: real("asr_confidence"),
    dialectTag: text("dialect_tag"),
    action: text("action"),
    questionId: text("question_id"),
    /** ASR output before a reviewer corrected it (source of the measured WER). */
    originalText: text("original_text"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    /** Embedding of the redacted text, for semantic search over the consumer memory. */
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("turns_session_idx").on(t.sessionId, t.idx),
    index("turns_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export interface Quote {
  turnId: string;
  text: string;
  sentiment?: string;
}

export const insights = pgTable(
  "insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    themeId: text("theme_id").notNull().default(""),
    theme: text("theme").notNull(),
    sentiment: text("sentiment").notNull(),
    summary: text("summary"),
    quotes: jsonb("quotes").$type<Quote[]>().notNull().default([]),
    counts: jsonb("counts").notNull().default({}),
    breakdown: jsonb("breakdown").notNull().default({}),
    answers: integer("answers").notNull().default(0),
    sessions: integer("sessions").notNull().default(0),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("insights_study_idx").on(t.studyId)],
);

export const personas = pgTable(
  "personas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    segmentKey: text("segment_key").notNull().default(""),
    segment: jsonb("segment").notNull(),
    attributes: jsonb("attributes").notNull(),
    evidence: jsonb("evidence").$type<Quote[]>().notNull().default([]),
    /** Increases each time the memory behind this persona changes. */
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("personas_org_segment_idx").on(t.orgId, t.segmentKey)],
);

export const jobStatus = pgEnum("job_status", ["pending", "running", "done", "failed"]);

/** Background jobs, claimed with FOR UPDATE SKIP LOCKED (no separate queue service). */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().default({}),
    /** Pending jobs with the same key are coalesced into one. */
    dedupeKey: text("dedupe_key"),
    status: jobStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [
    index("jobs_ready_idx").on(t.status, t.runAfter),
    uniqueIndex("jobs_pending_dedupe_idx")
      .on(t.dedupeKey)
      .where(sql`${t.status} = 'pending' and ${t.dedupeKey} is not null`),
  ],
);

export const qaFlags = pgTable(
  "qa_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    turnId: uuid("turn_id").references(() => turns.id, { onDelete: "cascade" }),
    kind: qaFlagKind("kind").notNull(),
    detail: text("detail"),
    status: qaStatus("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("qa_flags_open_idx")
      .on(t.status)
      .where(sql`${t.status} = 'open'`),
  ],
);

export const retentionPolicies = pgTable("retention_policies", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  recordingsDays: integer("recordings_days").notNull().default(90),
  transcriptsDays: integer("transcripts_days").notNull().default(365),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Human ratings of interviewer speech: naturalness (MOS 1–5) and dialect correctness. */
export const turnRatings = pgTable(
  "turn_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => turns.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    naturalness: integer("naturalness"),
    dialectCorrect: boolean("dialect_correct"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("turn_ratings_turn_reviewer_idx").on(t.turnId, t.reviewerId)],
);

/**
 * WhatsApp participants. The number is needed to reply, so it is kept
 * encrypted; lookups use a peppered hash. Never exposed to clients.
 */
export const whatsappContacts = pgTable("whatsapp_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  phoneHash: text("phone_hash").notNull().unique(),
  phoneEncrypted: text("phone_encrypted").notNull(),
  sessionId: text("session_id").references(() => interviewSessions.id, { onDelete: "set null" }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** What the platform did with personal data (erasures, retention runs); holds counts only. */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  detail: jsonb("detail").notNull().default({}),
  createdAt: createdAt(),
});
