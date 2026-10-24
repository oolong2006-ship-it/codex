import { randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  generateStudy,
  validateGuide,
  type GeneratedStudy,
  type GuideSection,
  type ScreenerQuestion,
  type TemplateId,
} from "@majlis/interviewer";
import type { LlmProvider } from "@majlis/providers";
import type { Db } from "../client.js";
import { interviewGuides, studies, type StudySegment } from "../schema.js";

export type StudyRow = typeof studies.$inferSelect;

export interface GuideContent {
  topic: string;
  sections: GuideSection[];
}

export async function createStudyFromObjective(
  db: Db,
  input: {
    orgId: string;
    userId: string;
    objective: string;
    templateId?: TemplateId;
    topic?: string;
    llm?: LlmProvider;
  },
): Promise<{ study: StudyRow; generated: GeneratedStudy }> {
  const objective = input.objective.trim();
  if (!objective) throw new Error("objective is required");
  const generated = await generateStudy(objective, {
    ...(input.llm ? { llm: input.llm } : {}),
    ...(input.templateId ? { templateId: input.templateId } : {}),
    ...(input.topic ? { topic: input.topic } : {}),
  });
  const study = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(studies)
      .values({
        orgId: input.orgId,
        createdBy: input.userId,
        title: objective.slice(0, 120),
        objective,
        topic: generated.topic,
        templateId: generated.templateId,
        inviteToken: randomBytes(12).toString("base64url"),
      })
      .returning();
    await tx.insert(interviewGuides).values({
      studyId: row!.id,
      version: 1,
      content: generated.guide,
      screener: generated.screener,
    });
    return row!;
  });
  return { study, generated };
}

export async function listStudies(db: Db, orgId: string) {
  return db
    .select({
      id: studies.id,
      title: studies.title,
      status: studies.status,
      createdAt: studies.createdAt,
      // Fully qualified: drizzle renders bare column names inside raw subqueries.
      sessions: sql<number>`(select count(*)::int from interview_sessions s where s.study_id = "studies"."id")`,
      completed: sql<number>`(select count(*)::int from interview_sessions s where s.study_id = "studies"."id" and s.status = 'completed')`,
    })
    .from(studies)
    .where(eq(studies.orgId, orgId))
    .orderBy(desc(studies.createdAt));
}

/** Org-scoped: returns nothing for another organization's study. */
export async function getStudy(db: Db, orgId: string, studyId: string) {
  const [study] = await db
    .select()
    .from(studies)
    .where(and(eq(studies.id, studyId), eq(studies.orgId, orgId)));
  if (!study) return null;
  const guide = await latestGuide(db, study.id);
  return { study, guide };
}

export async function latestGuide(db: Db, studyId: string) {
  const [guide] = await db
    .select()
    .from(interviewGuides)
    .where(eq(interviewGuides.studyId, studyId))
    .orderBy(desc(interviewGuides.version))
    .limit(1);
  return guide
    ? {
        version: guide.version,
        content: guide.content as GuideContent,
        screener: guide.screener as ScreenerQuestion[],
      }
    : null;
}

/** Saves an edited guide as a new version; past sessions keep their frozen snapshot. */
export async function saveGuide(
  db: Db,
  orgId: string,
  studyId: string,
  content: GuideContent,
  screener?: ScreenerQuestion[],
) {
  validateGuide({ ...content, studyId });
  const found = await getStudy(db, orgId, studyId);
  if (!found) throw new Error("study not found");
  const version = (found.guide?.version ?? 0) + 1;
  await db.insert(interviewGuides).values({
    studyId,
    version,
    content,
    screener: screener ?? found.guide?.screener ?? [],
  });
  await db
    .update(studies)
    .set({ topic: content.topic, updatedAt: new Date() })
    .where(eq(studies.id, studyId));
  return version;
}

export async function updateStudySettings(
  db: Db,
  orgId: string,
  studyId: string,
  patch: Partial<{
    title: string;
    status: "draft" | "recruiting" | "closed";
    segment: StudySegment;
    voiceSetting: "participant_choice" | "male" | "female";
    incentive: string | null;
    durationPhrase: string;
    retentionDays: number;
  }>,
) {
  const [row] = await db
    .update(studies)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(studies.id, studyId), eq(studies.orgId, orgId)))
    .returning({ id: studies.id });
  if (!row) throw new Error("study not found");
}
