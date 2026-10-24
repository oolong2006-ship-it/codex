"use server";

import {
  createStudyFromObjective,
  saveGuide,
  updateStudySettings,
  type GuideContent,
} from "@majlis/db";
import { isLocale } from "@majlis/i18n";
import { TEMPLATE_IDS, checkUtterance, type ScreenerQuestion } from "@majlis/interviewer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AGE_BANDS, CITIES, DIALECT_CODES, GENDERS } from "@/lib/options";
import { db, guideLlm, requireUser } from "@/lib/server";

const NewStudy = z.object({
  objective: z.string().trim().min(5).max(300),
  templateId: z.enum(TEMPLATE_IDS).optional(),
  topic: z.string().trim().max(80).optional(),
});

export async function createStudyAction(locale: string, form: FormData) {
  if (!isLocale(locale)) return;
  const user = await requireUser(locale);
  const parsed = NewStudy.safeParse({
    objective: form.get("objective"),
    templateId: form.get("templateId") || undefined,
    topic: form.get("topic") || undefined,
  });
  if (!parsed.success) redirect(`/${locale}/dashboard/studies/new?error=1`);
  const llm = guideLlm();
  const { study } = await createStudyFromObjective(db(), {
    orgId: user.orgId,
    userId: user.id,
    objective: parsed.data.objective,
    ...(parsed.data.templateId ? { templateId: parsed.data.templateId } : {}),
    ...(parsed.data.topic ? { topic: parsed.data.topic } : {}),
    ...(llm ? { llm } : {}),
  });
  redirect(`/${locale}/dashboard/studies/${study.id}`);
}

const QuestionSchema = z.object({
  id: z.string().min(1).max(60),
  text: z.string().trim().min(2).max(300),
  textFemale: z.string().trim().max(300).optional(),
  sensitive: z.boolean().optional(),
  coverKeywords: z.array(z.string().max(40)).max(20).optional(),
});
const GuideSchema = z.object({
  topic: z.string().trim().min(1).max(80),
  sections: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        title: z.string().trim().min(1).max(120),
        questions: z.array(QuestionSchema).min(1).max(20),
      }),
    )
    .min(1)
    .max(12),
});

export type SaveGuideResult =
  | { ok: true; version: number; issues: { questionId: string; detail: string }[] }
  | { ok: false; reason: string };

export async function saveGuideAction(
  locale: string,
  studyId: string,
  content: GuideContent,
  screener: ScreenerQuestion[],
): Promise<SaveGuideResult> {
  const user = await requireUser(locale);
  const parsed = GuideSchema.safeParse(content);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "invalid" };
  const cleaned: GuideContent = {
    topic: parsed.data.topic,
    sections: parsed.data.sections.map((s) => ({
      ...s,
      questions: s.questions.map((q) => ({
        id: q.id,
        text: q.text,
        ...(q.textFemale ? { textFemale: q.textFemale } : {}),
        ...(q.sensitive ? { sensitive: true } : {}),
        ...(q.coverKeywords?.length ? { coverKeywords: q.coverKeywords } : {}),
      })),
    })),
  };
  try {
    const version = await saveGuide(db(), user.orgId, studyId, cleaned, screener);
    revalidatePath(`/${locale}/dashboard/studies/${studyId}`);
    // Saved either way; wording the interviewer would refuse to say is surfaced to the author.
    const issues = cleaned.sections.flatMap((s) =>
      s.questions.flatMap((q) =>
        [q.text, q.textFemale ?? ""]
          .filter(Boolean)
          .flatMap((text) => checkUtterance(text, null))
          .map((v) => ({ questionId: q.id, detail: v.detail })),
      ),
    );
    return { ok: true, version, issues };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "invalid" };
  }
}

const Settings = z.object({
  cities: z.array(z.enum(CITIES)),
  ageBands: z.array(z.enum(AGE_BANDS)),
  genders: z.array(z.enum(GENDERS)),
  dialects: z.array(z.enum(DIALECT_CODES)),
  voiceSetting: z.enum(["participant_choice", "male", "female"]),
  incentive: z.string().trim().max(200),
  durationPhrase: z.string().trim().min(2).max(40),
});

export async function saveSettingsAction(locale: string, studyId: string, form: FormData) {
  const user = await requireUser(locale);
  const parsed = Settings.safeParse({
    cities: form.getAll("cities"),
    ageBands: form.getAll("ageBands"),
    genders: form.getAll("genders"),
    dialects: form.getAll("dialects"),
    voiceSetting: form.get("voiceSetting"),
    incentive: form.get("incentive") ?? "",
    durationPhrase: form.get("durationPhrase"),
  });
  if (!parsed.success) redirect(`/${locale}/dashboard/studies/${studyId}?tab=segment&error=1`);
  const { cities, ageBands, genders, dialects, voiceSetting, incentive, durationPhrase } =
    parsed.data;
  await updateStudySettings(db(), user.orgId, studyId, {
    segment: { cities, ageBands, genders, dialects },
    voiceSetting,
    incentive: incentive || null,
    durationPhrase,
  });
  revalidatePath(`/${locale}/dashboard/studies/${studyId}`);
  redirect(`/${locale}/dashboard/studies/${studyId}?tab=segment&saved=1`);
}

export async function setStatusAction(
  locale: string,
  studyId: string,
  status: "recruiting" | "closed",
) {
  const user = await requireUser(locale);
  await updateStudySettings(db(), user.orgId, studyId, { status });
  revalidatePath(`/${locale}/dashboard/studies/${studyId}`);
  redirect(`/${locale}/dashboard/studies/${studyId}?tab=invite`);
}
