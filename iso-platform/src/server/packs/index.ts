import { CORE_CONFLICTS, CORE_PROCESSES, CORE_QUESTIONS, DOMAINS } from "./core";
import { CONSTRUCTION, EDUCATION, FOOD_SERVICE, GENERAL, MANUFACTURING, PROFESSIONAL_SERVICES, SOFTWARE } from "./industries";
import type { AnswerValue, Answers, IndustryPack, Question } from "./types";

export * from "./types";
export { CORE_PROCESSES, DOMAINS };

export const PACKS: Record<string, IndustryPack> = Object.fromEntries(
  [FOOD_SERVICE, MANUFACTURING, CONSTRUCTION, SOFTWARE, EDUCATION, PROFESSIONAL_SERVICES, GENERAL].map((p) => [p.code, p]),
);
export const INDUSTRY_CODES = Object.keys(PACKS);

export function getPack(code: string): IndustryPack {
  return PACKS[code] ?? GENERAL;
}

/** All questions for an industry, in interview order: profile → operations → sector → system. */
export function questionsFor(industry: string): Question[] {
  const order = { PROFILE: 0, OPERATIONS: 1, SECTOR: 2, SYSTEM: 3 } as const;
  return [...CORE_QUESTIONS, ...getPack(industry).questions]
    .map((q, i) => ({ q, i }))
    .sort((x, y) => order[x.q.section] - order[y.q.section] || x.i - y.i)
    .map((x) => x.q);
}

/** Questions that apply given current answers (conditional branching). */
export function applicableQuestions(industry: string, answers: Answers): Question[] {
  return questionsFor(industry).filter((q) => !q.when || q.when(answers));
}

export function nextQuestion(industry: string, answers: Answers): Question | null {
  return applicableQuestions(industry, answers).find((q) => answers[q.id] === undefined) ?? null;
}

export function progress(industry: string, answers: Answers) {
  const qs = applicableQuestions(industry, answers);
  const answered = qs.filter((q) => answers[q.id] !== undefined).length;
  return { answered, total: qs.length, percent: qs.length ? Math.round((answered / qs.length) * 100) : 0 };
}

export function findQuestion(industry: string, id: string): Question | undefined {
  return questionsFor(industry).find((q) => q.id === id);
}

/** Server-side validation and normalisation of a raw answer. Returns the typed value or throws. */
export function normaliseAnswer(q: Question, raw: unknown): AnswerValue {
  switch (q.type) {
    case "text": {
      const s = String(raw ?? "").trim();
      if (!s) throw new Error("الإجابة مطلوبة");
      if (s.length > 4000) throw new Error("الإجابة طويلة جداً");
      return s;
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
      if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error("أدخل رقماً صحيحاً");
      if (q.min !== undefined && n < q.min) throw new Error(`القيمة يجب ألا تقل عن ${q.min}`);
      if (q.max !== undefined && n > q.max) throw new Error(`القيمة يجب ألا تزيد عن ${q.max}`);
      return n;
    }
    case "boolean": {
      if (raw === true || raw === "true" || raw === "yes") return true;
      if (raw === false || raw === "false" || raw === "no") return false;
      throw new Error("اختر نعم أو لا");
    }
    case "single": {
      const v = String(raw ?? "");
      if (!q.choices?.some((c) => c.value === v)) throw new Error("اختيار غير صالح");
      return v;
    }
    case "multi": {
      const list = (Array.isArray(raw) ? raw : [raw]).map(String).filter(Boolean);
      if (!list.length) throw new Error("اختر خياراً واحداً على الأقل");
      if (!list.every((v) => q.choices?.some((c) => c.value === v))) throw new Error("اختيار غير صالح");
      return Array.from(new Set(list));
    }
  }
}

export interface DetectedConflict {
  id: string;
  level: "CONFLICT" | "WARNING";
  questionIds: string[];
  messageAr: string;
}

export function detectConflicts(industry: string, answers: Answers): DetectedConflict[] {
  return CORE_CONFLICTS.filter((r) => r.questionIds.every((id) => answers[id] !== undefined) && r.test(answers, industry)).map(
    (r) => ({ id: r.id, level: r.level, questionIds: r.questionIds, messageAr: r.ar }),
  );
}

export function formatAnswer(q: Question, v: AnswerValue | undefined): string {
  if (v === undefined) return "—";
  if (q.type === "boolean") return v ? "نعم" : "لا";
  if (q.type === "single") return q.choices?.find((c) => c.value === v)?.ar ?? String(v);
  if (q.type === "multi") return (v as string[]).map((x) => q.choices?.find((c) => c.value === x)?.ar ?? x).join("، ");
  return String(v);
}
