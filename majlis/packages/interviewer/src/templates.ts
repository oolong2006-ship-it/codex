import { readFileSync } from "node:fs";
import type { LlmProvider } from "@majlis/providers";
import { parse } from "yaml";
import { validateGuide, type GuideSection, type InterviewGuide, type Question } from "./guide.js";
import { checkUtterance } from "./guardrails.js";

export const TEMPLATE_IDS = [
  "restaurant_satisfaction",
  "churn_reasons",
  "new_item_test",
  "price_test",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface ScreenerOption {
  id: string;
  label: string;
  qualifies: boolean;
}

export interface ScreenerQuestion {
  id: string;
  text: string;
  options: ScreenerOption[];
}

interface TemplateFile {
  topic: string;
  keywords: string[];
  screener: ScreenerQuestion[];
  sections: GuideSection[];
}

export interface GeneratedStudy {
  templateId: TemplateId | null;
  topic: string;
  guide: Omit<InterviewGuide, "studyId">;
  screener: ScreenerQuestion[];
  source: "template" | "llm";
}

const TEMPLATES_FILE = new URL("../templates/ar-SA.yaml", import.meta.url);
let cached: Record<TemplateId, TemplateFile> | undefined;

function templates(): Record<TemplateId, TemplateFile> {
  cached ??= parse(readFileSync(TEMPLATES_FILE, "utf8")) as Record<TemplateId, TemplateFile>;
  return cached;
}

const fillTopic = (s: string, topic: string) => s.replaceAll("{topic}", topic);

/** Instantiates a template for a topic, replacing {topic} everywhere. */
export function fromTemplate(id: TemplateId, topic?: string): GeneratedStudy {
  const t = templates()[id];
  const finalTopic = topic?.trim() || t.topic;
  const sections = t.sections.map((s) => ({
    ...s,
    questions: s.questions.map((q) => ({
      ...q,
      text: fillTopic(q.text, finalTopic),
      ...(q.textFemale ? { textFemale: fillTopic(q.textFemale, finalTopic) } : {}),
    })),
  }));
  return {
    templateId: id,
    topic: finalTopic,
    guide: { topic: finalTopic, sections },
    screener: t.screener.map((q) => ({ ...q, text: fillTopic(q.text, finalTopic) })),
    source: "template",
  };
}

/** Picks the template whose keywords best match a one-sentence objective. */
export function pickTemplate(objective: string): TemplateId {
  let best: TemplateId = "restaurant_satisfaction";
  let bestScore = 0;
  for (const id of TEMPLATE_IDS) {
    const score = templates()[id].keywords.filter((k) => objective.includes(k)).length;
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

const MIN_QUESTIONS = 3;

function questionsPass(q: Question): boolean {
  return [q.text, q.textFemale ?? ""].every((t) => !t || checkUtterance(t, null).length === 0);
}

/**
 * Generates a guide from a one-sentence objective. With an LLM, it drafts a
 * guide as JSON; every question must pass the interviewer guardrails or it is
 * dropped. Without an LLM, or if too little survives, the best template is used.
 */
export async function generateStudy(
  objective: string,
  options: { llm?: LlmProvider; templateId?: TemplateId; topic?: string } = {},
): Promise<GeneratedStudy> {
  const fallback = fromTemplate(options.templateId ?? pickTemplate(objective), options.topic);
  if (!options.llm || options.templateId) return fallback;

  try {
    const raw = await options.llm.complete({
      messages: [
        {
          role: "system",
          content:
            "أنت باحث أسواق سعودي. صمّم دليل مقابلة صوتية قصيرة باللهجة السعودية البيضاء. " +
            "أسئلة مفتوحة وقصيرة وغير موجّهة، سؤال واحد في كل جملة، بدون مصطلحات أكاديمية. " +
            "علّم الأسئلة الحساسة (الدخل، العائلة، الصحة، الدين) بـ sensitive: true. " +
            'أجب بـ JSON فقط بهذا الشكل: {"topic": "...", "sections": [{"id": "...", "title": "...", ' +
            '"questions": [{"id": "...", "text": "...", "textFemale": "...", "sensitive": false}]}]}',
        },
        { role: "user", content: `هدف الدراسة: ${objective}` },
      ],
      maxTokens: 1200,
      temperature: 0.4,
    });
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { topic?: string; sections?: GuideSection[] };
    const sections = (parsed.sections ?? [])
      .map((s, i) => ({
        id: s.id || `s${i + 1}`,
        title: s.title || `محور ${i + 1}`,
        questions: (s.questions ?? [])
          .filter((q) => typeof q.text === "string" && questionsPass(q))
          .map((q, j) => ({
            id: q.id || `s${i + 1}q${j + 1}`,
            text: q.text,
            ...(q.textFemale ? { textFemale: q.textFemale } : {}),
            ...(q.sensitive ? { sensitive: true } : {}),
          })),
      }))
      .filter((s) => s.questions.length > 0);
    const topic = options.topic?.trim() || parsed.topic?.trim() || fallback.topic;
    const guide = { topic, sections };
    if (sections.flatMap((s) => s.questions).length < MIN_QUESTIONS) return fallback;
    validateGuide({ ...guide, studyId: "draft" });
    return { templateId: null, topic, guide, screener: fallback.screener, source: "llm" };
  } catch {
    return fallback;
  }
}
