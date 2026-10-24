import { catalogs } from "@majlis/i18n";
import { containsPhrase, normalizeForMatch } from "@majlis/dialect";
import type { LlmProvider } from "@majlis/providers";
import { scoreSentiment, type Sentiment } from "./sentiment.js";
import { emptyCounts, type SentimentCounts } from "./types.js";

export interface MemoryFilters {
  gender?: "male" | "female";
  ageBands: string[];
  cities: string[];
  dialects: string[];
}

/** Things asked about that the platform deliberately does not record. */
export type MemoryNote = "parenthood_not_collected" | "no_filters_matched";

export interface ParsedQuestion {
  filters: MemoryFilters;
  notes: MemoryNote[];
  /** The question with segment words removed, used for semantic search. */
  topicQuery: string;
}

const n = (words: string[]) => words.map(normalizeForMatch);
const FEMALE = n([
  "النساء",
  "نساء",
  "الحريم",
  "حريم",
  "البنات",
  "بنات",
  "السيدات",
  "المرأة",
  "الإناث",
  "الأمهات",
  "امهات",
  "women",
  "mothers",
  "female",
]);
const MALE = n(["الرجال", "رجال", "الرجاجيل", "الآباء", "ابهات", "men", "fathers", "male"]);
const PARENTS = n([
  "الأمهات",
  "امهات",
  "الآباء",
  "ابهات",
  "mothers",
  "fathers",
  "parents",
  "الوالدين",
]);
const AGE_WORDS: [string[], string[]][] = [
  [n(["الشباب", "شباب", "الطلاب", "youth", "young"]), ["18-24", "25-34"]],
  [n(["كبار السن", "الكبار", "المتقاعدين", "seniors", "older"]), ["55+"]],
];
const DIALECT_WORDS: [string[], string][] = [
  [n(["النجديين", "نجد", "أهل نجد"]), "najdi"],
  [n(["الحجازيين", "الحجاز", "أهل الحجاز"]), "hijazi"],
  [n(["الجنوبيين", "الجنوب", "أهل الجنوب"]), "southern"],
  [n(["أهل الشرقية", "الشرقاويين"]), "eastern"],
  [n(["الشماليين", "الشمال", "أهل الشمال"]), "northern"],
];
const QUESTION_WORDS = n([
  "وش",
  "ايش",
  "شنو",
  "رأي",
  "رايهم",
  "يشوفون",
  "عن",
  "في",
  "ب",
  "عند",
  "what",
  "do",
  "think",
  "about",
  "in",
  "of",
  "the",
]);

function cityNames(): [string, string][] {
  const out: [string, string][] = [];
  for (const catalog of Object.values(catalogs)) {
    for (const [code, name] of Object.entries(catalog.cities)) {
      if (code !== "other") out.push([normalizeForMatch(name), code]);
    }
  }
  return out;
}

/** Extracts segment filters ("الأمهات في جدة") from a question in Arabic or English. */
export function parseQuestion(question: string): ParsedQuestion {
  let text = normalizeForMatch(question);
  const has = (words: string[]) => words.some((w) => containsPhrase(text, w));
  const strip = (words: string[]) => {
    for (const w of words) text = ` ${text} `.replaceAll(` ${w} `, " ").trim();
  };

  const filters: MemoryFilters = { ageBands: [], cities: [], dialects: [] };
  const notes: MemoryNote[] = [];
  if (has(PARENTS)) notes.push("parenthood_not_collected");
  if (has(FEMALE)) filters.gender = "female";
  else if (has(MALE)) filters.gender = "male";
  strip([...FEMALE, ...MALE, ...PARENTS]);

  for (const [words, bands] of AGE_WORDS) {
    if (has(words)) filters.ageBands.push(...bands);
    strip(words);
  }
  for (const [words, code] of DIALECT_WORDS) {
    if (has(words)) filters.dialects.push(code);
    strip(words);
  }
  for (const [name, code] of cityNames()) {
    // "بجدة" / "في جدة" both count.
    const variants = [name, `ب${name}`, `ل${name}`];
    if (has(variants) && !filters.cities.includes(code)) filters.cities.push(code);
    strip(variants);
  }
  strip(QUESTION_WORDS);
  return { filters, notes, topicQuery: text.trim() || normalizeForMatch(question) };
}

export interface MemoryHit {
  turnId: string;
  sessionId: string;
  studyTitle: string;
  text: string;
  similarity: number;
}

export interface MemoryAnswer {
  mode: "llm" | "extractive" | "insufficient";
  /** Only for mode "llm": an answer that cites the quotes as [1], [2], ... */
  answer: string | null;
  quotes: (MemoryHit & { sentiment: Sentiment })[];
  stats: { quotes: number; sessions: number; sentiment: SentimentCounts };
  filters: MemoryFilters;
  notes: MemoryNote[];
}

/**
 * Answers strictly from retrieved quotes. An LLM answer is kept only if every
 * citation points at a real quote; otherwise the extractive view is returned.
 */
export async function answerFromMemory(
  question: string,
  parsed: ParsedQuestion,
  hits: MemoryHit[],
  options: { llm?: LlmProvider; minQuotes?: number } = {},
): Promise<MemoryAnswer> {
  const quotes = hits.map((h) => ({ ...h, sentiment: scoreSentiment(h.text).label }));
  const sentiment = emptyCounts();
  for (const q of quotes) sentiment[q.sentiment]++;
  const base = {
    quotes,
    stats: {
      quotes: quotes.length,
      sessions: new Set(quotes.map((q) => q.sessionId)).size,
      sentiment,
    },
    filters: parsed.filters,
    notes: parsed.notes,
  };
  if (quotes.length < (options.minQuotes ?? 1))
    return { ...base, mode: "insufficient", answer: null };
  if (!options.llm) return { ...base, mode: "extractive", answer: null };

  try {
    const raw = await options.llm.complete({
      messages: [
        {
          role: "system",
          content:
            "أنت محلل أبحاث مستهلك. أجب عن سؤال العميل بالعربية من الاقتباسات المرقمة فقط. " +
            "استشهد بعد كل معلومة برقم الاقتباس بين قوسين مربعين مثل [1]. " +
            "لا تضف أي معلومة غير موجودة في الاقتباسات، وإذا كانت لا تكفي فقل ذلك.",
        },
        {
          role: "user",
          content: `السؤال: ${question}\n\nالاقتباسات:\n${quotes.map((q, i) => `[${i + 1}] «${q.text}»`).join("\n")}`,
        },
      ],
      maxTokens: 300,
      temperature: 0.2,
    });
    const answer = raw.trim();
    const cited = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    const valid = cited.length > 0 && cited.every((c) => c >= 1 && c <= quotes.length);
    return valid ? { ...base, mode: "llm", answer } : { ...base, mode: "extractive", answer: null };
  } catch {
    return { ...base, mode: "extractive", answer: null };
  }
}
