import type { LlmProvider } from "@majlis/providers";
import { scoreSentiment, type Sentiment } from "./sentiment.js";
import {
  DIMENSIONS,
  emptyCounts,
  type Answer,
  type Dimension,
  type Quote,
  type SentimentCounts,
} from "./types.js";

export interface GuideShape {
  sections: { id: string; title: string; questions: { id: string }[] }[];
}

export interface ThemeInsight {
  themeId: string;
  title: string;
  /** Most frequent non-neutral sentiment, or neutral. */
  sentiment: Sentiment;
  counts: SentimentCounts;
  answers: number;
  sessions: number;
  quotes: Quote[];
  /** Sentiment counts per segment value, e.g. breakdown.city.jeddah. */
  breakdown: Record<Dimension, Record<string, SentimentCounts>>;
  summary: string | null;
}

const MIN_QUOTE_WORDS = 4;

function dominant(counts: SentimentCounts): Sentiment {
  const ranked = (["positive", "negative", "mixed"] as const)
    .filter((s) => counts[s] > 0)
    .sort((a, b) => counts[b] - counts[a]);
  return ranked[0] ?? "neutral";
}

/**
 * Picks up to `max` quotes: substantive answers, one per session, covering
 * each sentiment present before repeating one.
 */
function pickQuotes(
  scored: { answer: Answer; sentiment: Sentiment; strength: number }[],
  max: number,
  redact: (s: string) => string,
): Quote[] {
  const candidates = scored
    .filter((s) => s.answer.text.split(/\s+/).length >= MIN_QUOTE_WORDS)
    .sort((a, b) => b.strength - a.strength || b.answer.text.length - a.answer.text.length);
  const out: Quote[] = [];
  const usedSessions = new Set<string>();
  const usedSentiments = new Set<Sentiment>();
  for (const pass of [0, 1]) {
    for (const c of candidates) {
      if (out.length >= max) break;
      if (usedSessions.has(c.answer.sessionId)) continue;
      if (pass === 0 && usedSentiments.has(c.sentiment)) continue;
      out.push({ turnId: c.answer.turnId, text: redact(c.answer.text), sentiment: c.sentiment });
      usedSessions.add(c.answer.sessionId);
      usedSentiments.add(c.sentiment);
    }
  }
  return out;
}

/** Themes follow the guide's sections; each answer belongs to the section of its question. */
export function buildThemes(
  guide: GuideShape,
  answers: Answer[],
  options: { redact?: (s: string) => string; maxQuotes?: number } = {},
): ThemeInsight[] {
  const redact = options.redact ?? ((s) => s);
  const sectionOf = new Map<string, string>();
  for (const s of guide.sections) for (const q of s.questions) sectionOf.set(q.id, s.id);

  return guide.sections
    .map((section) => {
      const scored = answers
        .filter((a) => a.questionId && sectionOf.get(a.questionId) === section.id)
        .map((answer) => {
          const r = scoreSentiment(answer.text);
          return { answer, sentiment: r.label, strength: r.positive + r.negative };
        });
      const counts = emptyCounts();
      const breakdown = Object.fromEntries(
        DIMENSIONS.map((d) => [d, {}]),
      ) as ThemeInsight["breakdown"];
      for (const s of scored) {
        counts[s.sentiment]++;
        for (const d of DIMENSIONS) {
          const value = s.answer.participant[d];
          if (!value) continue;
          (breakdown[d][value] ??= emptyCounts())[s.sentiment]++;
        }
      }
      return {
        themeId: section.id,
        title: section.title,
        sentiment: dominant(counts),
        counts,
        answers: scored.length,
        sessions: new Set(scored.map((s) => s.answer.sessionId)).size,
        quotes: pickQuotes(scored, options.maxQuotes ?? 3, redact),
        breakdown,
        summary: null,
      };
    })
    .filter((t) => t.answers > 0);
}

/**
 * Optional one-to-two sentence summary written by the self-hosted LLM, from
 * the theme's quotes only. Without an LLM (or on failure) the UI renders the
 * counts instead.
 */
export async function summarizeTheme(
  llm: LlmProvider,
  theme: ThemeInsight,
): Promise<string | null> {
  if (theme.quotes.length === 0) return null;
  try {
    const text = await llm.complete({
      messages: [
        {
          role: "system",
          content:
            "أنت محلل أبحاث. لخّص آراء المشاركين في جملة أو جملتين بالعربية الواضحة، " +
            "من الاقتباسات المعطاة فقط، بدون أرقام غير موجودة وبدون مبالغة.",
        },
        {
          role: "user",
          content: `المحور: ${theme.title}\n${theme.quotes.map((q, i) => `${i + 1}. «${q.text}»`).join("\n")}`,
        },
      ],
      maxTokens: 160,
      temperature: 0.2,
    });
    const clean = text.trim();
    return clean && clean.length <= 400 ? clean : null;
  } catch {
    return null;
  }
}
