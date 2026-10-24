import type {
  Answer,
  MemoryFilters,
  MemoryHit,
  Persona,
  PersonaAnswer,
  ThemeInsight,
} from "@majlis/analysis";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { redactPII } from "../privacy.js";
import { insights, interviewSessions, participants, personas, studies, turns } from "../schema.js";
import { latestGuide, type GuideContent } from "./studies.js";

/** Participant answers of completed interviews in a study, with segment attributes. */
export async function loadStudyAnswers(db: Db, studyId: string) {
  const [study] = await db.select().from(studies).where(eq(studies.id, studyId));
  if (!study) return null;
  const guide = await latestGuide(db, studyId);
  const rows = await db
    .select({
      turnId: turns.id,
      sessionId: turns.sessionId,
      questionId: turns.questionId,
      text: turns.text,
      gender: participants.gender,
      city: participants.city,
      ageBand: participants.ageBand,
      dialect: participants.dialect,
      dialectDetected: interviewSessions.dialectDetected,
    })
    .from(turns)
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .innerJoin(participants, eq(participants.id, interviewSessions.participantId))
    .where(
      and(
        eq(interviewSessions.studyId, studyId),
        eq(interviewSessions.status, "completed"),
        eq(turns.role, "participant"),
      ),
    )
    .orderBy(asc(turns.sessionId), asc(turns.idx));
  const answers: Answer[] = rows.map((r) => ({
    turnId: r.turnId,
    sessionId: r.sessionId,
    studyId,
    questionId: r.questionId,
    text: r.text,
    participant: {
      gender: r.gender,
      city: r.city,
      ageBand: r.ageBand,
      // Self-reported dialect first, otherwise what the interviewer detected.
      dialect: r.dialect ?? r.dialectDetected,
    },
  }));
  return { study, guide: guide?.content ?? null, answers };
}

export async function sessionStudy(db: Db, sessionId: string) {
  const [row] = await db
    .select({
      studyId: interviewSessions.studyId,
      orgId: studies.orgId,
      status: interviewSessions.status,
    })
    .from(interviewSessions)
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .where(eq(interviewSessions.id, sessionId));
  return row ?? null;
}

export async function turnsToEmbed(db: Db, sessionId: string) {
  return db
    .select({ id: turns.id, text: turns.text })
    .from(turns)
    .where(
      and(eq(turns.sessionId, sessionId), eq(turns.role, "participant"), isNull(turns.embedding)),
    );
}

export async function saveEmbeddings(db: Db, rows: { turnId: string; vector: number[] }[]) {
  for (const r of rows) {
    await db.update(turns).set({ embedding: r.vector }).where(eq(turns.id, r.turnId));
  }
}

export async function markSessionAnalyzed(db: Db, sessionId: string) {
  await db
    .update(interviewSessions)
    .set({ analyzedAt: new Date() })
    .where(eq(interviewSessions.id, sessionId));
}

export async function replaceInsights(db: Db, studyId: string, themes: ThemeInsight[]) {
  await db.transaction(async (tx) => {
    await tx.delete(insights).where(eq(insights.studyId, studyId));
    if (themes.length === 0) return;
    await tx.insert(insights).values(
      themes.map((t, position) => ({
        studyId,
        themeId: t.themeId,
        theme: t.title,
        sentiment: t.sentiment,
        summary: t.summary,
        quotes: t.quotes,
        counts: t.counts,
        breakdown: t.breakdown,
        answers: t.answers,
        sessions: t.sessions,
        position,
      })),
    );
  });
}

/** All analyzed answers of an organization, tagged with their theme, for the memory. */
export async function loadOrgAnswers(db: Db, orgId: string): Promise<PersonaAnswer[]> {
  const orgStudies = await db
    .select({ id: studies.id })
    .from(studies)
    .where(eq(studies.orgId, orgId));
  const out: PersonaAnswer[] = [];
  for (const { id } of orgStudies) {
    const loaded = await loadStudyAnswers(db, id);
    if (!loaded?.guide) continue;
    const themeOf = new Map<string, string>();
    for (const s of loaded.guide.sections) for (const q of s.questions) themeOf.set(q.id, s.title);
    for (const a of loaded.answers) {
      const themeTitle = a.questionId ? themeOf.get(a.questionId) : undefined;
      if (themeTitle) out.push({ ...a, themeTitle });
    }
  }
  return out;
}

/** Inserts new personas, bumps the version of changed ones, removes vanished segments. */
export async function upsertPersonas(db: Db, orgId: string, list: Persona[]) {
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(personas).where(eq(personas.orgId, orgId));
    const byKey = new Map(existing.map((p) => [p.segmentKey, p]));
    for (const p of list) {
      const prev = byKey.get(p.segmentKey);
      byKey.delete(p.segmentKey);
      if (!prev) {
        await tx.insert(personas).values({
          orgId,
          segmentKey: p.segmentKey,
          segment: p.segment,
          attributes: p.attributes,
          evidence: p.evidence,
        });
      } else if (
        JSON.stringify(prev.attributes) !== JSON.stringify(p.attributes) ||
        JSON.stringify(prev.evidence) !== JSON.stringify(p.evidence)
      ) {
        await tx
          .update(personas)
          .set({
            attributes: p.attributes,
            evidence: p.evidence,
            version: prev.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(personas.id, prev.id));
      }
    }
    const vanished = [...byKey.values()].map((p) => p.id);
    if (vanished.length) await tx.delete(personas).where(inArray(personas.id, vanished));
  });
}

/**
 * Semantic search over an organization's interviews, restricted to segment
 * filters. Returns redacted text only.
 */
export async function searchMemory(
  db: Db,
  orgId: string,
  queryVector: number[],
  filters: MemoryFilters,
  options: { limit?: number; minSimilarity?: number } = {},
): Promise<MemoryHit[]> {
  const vector = `[${queryVector.join(",")}]`;
  const conditions = [
    eq(studies.orgId, orgId),
    eq(turns.role, "participant"),
    isNotNull(turns.embedding),
    eq(interviewSessions.status, "completed"),
  ];
  if (filters.gender) conditions.push(eq(participants.gender, filters.gender));
  if (filters.cities.length) conditions.push(inArray(participants.city, filters.cities));
  if (filters.ageBands.length) {
    conditions.push(
      inArray(
        participants.ageBand,
        filters.ageBands as ("18-24" | "25-34" | "35-44" | "45-54" | "55+")[],
      ),
    );
  }
  if (filters.dialects.length) {
    conditions.push(
      sql`coalesce(${participants.dialect}, ${interviewSessions.dialectDetected}) in (${sql.join(
        filters.dialects.map((d) => sql`${d}`),
        sql`, `,
      )})`,
    );
  }
  const similarity = sql<number>`1 - (${turns.embedding} <=> ${vector}::vector)`;
  const rows = await db
    .select({
      turnId: turns.id,
      sessionId: turns.sessionId,
      studyTitle: studies.title,
      text: turns.text,
      similarity,
    })
    .from(turns)
    .innerJoin(interviewSessions, eq(interviewSessions.id, turns.sessionId))
    .innerJoin(studies, eq(studies.id, interviewSessions.studyId))
    .innerJoin(participants, eq(participants.id, interviewSessions.participantId))
    .where(and(...conditions))
    .orderBy(sql`${turns.embedding} <=> ${vector}::vector`)
    .limit(options.limit ?? 8);
  const min = options.minSimilarity ?? 0;
  return rows
    .filter((r) => Number(r.similarity) >= min)
    .map((r) => ({ ...r, similarity: Number(r.similarity), text: redactPII(r.text) }));
}

// ─── client views ──────────────────────────────────────────────────────────

export async function insightsForClient(db: Db, orgId: string, studyId: string) {
  const [owned] = await db
    .select({ id: studies.id })
    .from(studies)
    .where(and(eq(studies.id, studyId), eq(studies.orgId, orgId)));
  if (!owned) return null;
  const rows = await db
    .select()
    .from(insights)
    .where(eq(insights.studyId, studyId))
    .orderBy(asc(insights.position));
  const [status] = await db
    .select({
      completed: sql<number>`count(*) filter (where ${interviewSessions.status} = 'completed')::int`,
      pending: sql<number>`count(*) filter (where ${interviewSessions.status} = 'completed' and ${interviewSessions.analyzedAt} is null)::int`,
    })
    .from(interviewSessions)
    .where(eq(interviewSessions.studyId, studyId));
  return {
    completed: status?.completed ?? 0,
    pendingAnalysis: status?.pending ?? 0,
    themes: rows.map((r) => ({
      themeId: r.themeId,
      title: r.theme,
      sentiment: r.sentiment,
      summary: r.summary,
      counts: r.counts as Record<string, number>,
      breakdown: r.breakdown as Record<string, Record<string, Record<string, number>>>,
      answers: r.answers,
      sessions: r.sessions,
      quotes: (r.quotes ?? []).map((q) => ({ ...q, text: redactPII(q.text) })),
    })),
  };
}

export async function personasForClient(db: Db, orgId: string) {
  const rows = await db.select().from(personas).where(eq(personas.orgId, orgId));
  return rows
    .map((p) => ({
      segmentKey: p.segmentKey,
      segment: p.segment as Record<string, string>,
      attributes: p.attributes as Persona["attributes"],
      evidence: (p.evidence ?? []).map((q) => ({ ...q, text: redactPII(q.text) })),
      version: p.version,
      updatedAt: p.updatedAt.toISOString(),
    }))
    .sort((a, b) => b.attributes.sessions - a.attributes.sessions);
}

export type { GuideContent };
