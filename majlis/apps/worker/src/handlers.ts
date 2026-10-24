import {
  buildPersonas,
  buildThemes,
  detectQaIssues,
  summarizeTheme,
  type Answer,
} from "@majlis/analysis";
import {
  addQaFlags,
  enqueueJob,
  loadOrgAnswers,
  loadStudyAnswers,
  markSessionAnalyzed,
  purgeExpired,
  redactPII,
  replaceInsights,
  saveEmbeddings,
  sessionStudy,
  studyAnswersForQa,
  studyTurnsToEmbed,
  turnsToEmbed,
  upsertPersonas,
  type Db,
  type Deleter,
  type PiiKeys,
} from "@majlis/db";
import type {
  AsrProvider,
  EmbeddingProvider,
  LlmProvider,
  TtsProvider,
  WhatsAppProvider,
} from "@majlis/providers";
import type { ObjectStore } from "@majlis/storage";
import { JOBS, type JobRegistry } from "./jobs.js";
import { handleWhatsappMessage } from "./whatsapp.js";

export interface HandlerDeps {
  db: Db;
  embedding: EmbeddingProvider;
  /** Only a real self-hosted LLM writes theme summaries; otherwise counts are shown. */
  llm?: LlmProvider;
  personaMinSessions?: number;
  /** Where recordings live; needed for retention and erasure. */
  recordings?: ObjectStore & Deleter;
  /** Days a WhatsApp number is kept after its last message (default 30). */
  contactDays?: number;
  whatsapp?: {
    provider: WhatsAppProvider;
    asr: AsrProvider;
    tts?: TtsProvider;
    keys: PiiKeys;
    /** Public deletion page, sent with the participant's deletion code. */
    deletionUrl: string;
  };
}

const BATCH = 32;
const DAY = 86_400;

async function embed(deps: HandlerDeps, rows: { id: string; text: string }[]) {
  // Vectors are computed from redacted text so they never encode a phone number or email.
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vectors = await deps.embedding.embed(
      batch.map((t) => redactPII(t.text)),
      "document",
    );
    await saveEmbeddings(
      deps.db,
      batch.map((t, j) => ({ turnId: t.id, vector: vectors[j]! })),
    );
  }
}

export async function analyzeStudy(deps: HandlerDeps, studyId: string): Promise<void> {
  const loaded = await loadStudyAnswers(deps.db, studyId);
  if (!loaded?.guide) return;
  const themes = buildThemes(loaded.guide, loaded.answers as Answer[], { redact: redactPII });
  if (deps.llm) {
    for (const theme of themes) theme.summary = await summarizeTheme(deps.llm, theme);
  }
  await replaceInsights(deps.db, studyId, themes);

  // Quality flags for human review: very short, repeated or automated-looking answers.
  const answers = await studyAnswersForQa(deps.db, studyId);
  const sessionOf = new Map(answers.map((a) => [a.turnId, a.sessionId]));
  await addQaFlags(
    deps.db,
    detectQaIssues(answers).map((i) => ({ ...i, sessionId: sessionOf.get(i.turnId)! })),
  );
}

export function registerHandlers(registry: JobRegistry, deps: HandlerDeps): void {
  registry.register(JOBS.analyzeSession, async (payload) => {
    const { sessionId } = payload as { sessionId: string };
    const owner = await sessionStudy(deps.db, sessionId);
    if (!owner || owner.status !== "completed") return;
    await embed(deps, await turnsToEmbed(deps.db, sessionId));
    await analyzeStudy(deps, owner.studyId);
    await markSessionAnalyzed(deps.db, sessionId);
    await enqueueJob(
      deps.db,
      JOBS.updatePersonas,
      { orgId: owner.orgId },
      { dedupeKey: `personas:${owner.orgId}` },
    );
  });

  // After corrections or erasures: re-embed what changed and rebuild the study's results.
  registry.register(JOBS.analyzeStudy, async (payload) => {
    const { studyId } = payload as { studyId: string };
    await embed(deps, await studyTurnsToEmbed(deps.db, studyId));
    await analyzeStudy(deps, studyId);
  });

  registry.register(JOBS.updatePersonas, async (payload) => {
    const { orgId } = payload as { orgId: string };
    const answers = await loadOrgAnswers(deps.db, orgId);
    const personas = buildPersonas(answers, {
      redact: redactPII,
      minSessions: deps.personaMinSessions ?? 3,
    });
    await upsertPersonas(deps.db, orgId, personas);
  });

  registry.register(JOBS.retentionSweep, async () => {
    if (!deps.recordings) throw new Error("retention needs the recordings store");
    await purgeExpired(deps.db, deps.recordings, new Date(), {
      contactDays: deps.contactDays ?? 30,
    });
    // Reschedules itself: one sweep a day.
    await enqueueJob(
      deps.db,
      JOBS.retentionSweep,
      {},
      { dedupeKey: JOBS.retentionSweep, delaySeconds: DAY },
    );
  });

  const whatsapp = deps.whatsapp;
  if (whatsapp && deps.recordings) {
    const recordings = deps.recordings;
    registry.register(JOBS.whatsappInbound, (payload) =>
      handleWhatsappMessage(
        { db: deps.db, recordings, contactDays: deps.contactDays ?? 30, ...whatsapp },
        payload as never,
      ),
    );
  }
}
