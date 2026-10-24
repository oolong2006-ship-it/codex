import { type Answer, buildPersonas, buildThemes, summarizeTheme } from "@majlis/analysis";
import {
  enqueueJob,
  loadOrgAnswers,
  loadStudyAnswers,
  markSessionAnalyzed,
  redactPII,
  replaceInsights,
  saveEmbeddings,
  sessionStudy,
  turnsToEmbed,
  upsertPersonas,
  type Db,
} from "@majlis/db";
import type { EmbeddingProvider, LlmProvider } from "@majlis/providers";
import { JOBS, type JobRegistry } from "./jobs.js";

export interface HandlerDeps {
  db: Db;
  embedding: EmbeddingProvider;
  /** Only a real self-hosted LLM writes theme summaries; otherwise counts are shown. */
  llm?: LlmProvider;
  personaMinSessions?: number;
}

const BATCH = 32;

export async function analyzeStudy(deps: HandlerDeps, studyId: string): Promise<void> {
  const loaded = await loadStudyAnswers(deps.db, studyId);
  if (!loaded?.guide) return;
  const themes = buildThemes(loaded.guide, loaded.answers as Answer[], { redact: redactPII });
  if (deps.llm) {
    for (const theme of themes) theme.summary = await summarizeTheme(deps.llm, theme);
  }
  await replaceInsights(deps.db, studyId, themes);
}

export function registerHandlers(registry: JobRegistry, deps: HandlerDeps): void {
  registry.register(JOBS.analyzeSession, async (payload) => {
    const { sessionId } = payload as { sessionId: string };
    const owner = await sessionStudy(deps.db, sessionId);
    if (!owner || owner.status !== "completed") return;

    // Vectors are computed from redacted text so they never encode a phone number or email.
    const pending = await turnsToEmbed(deps.db, sessionId);
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const vectors = await deps.embedding.embed(
        batch.map((t) => redactPII(t.text)),
        "document",
      );
      await saveEmbeddings(
        deps.db,
        batch.map((t, j) => ({ turnId: t.id, vector: vectors[j]! })),
      );
    }
    await analyzeStudy(deps, owner.studyId);
    await markSessionAnalyzed(deps.db, sessionId);
    await enqueueJob(
      deps.db,
      JOBS.updatePersonas,
      { orgId: owner.orgId },
      { dedupeKey: `personas:${owner.orgId}` },
    );
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
}
