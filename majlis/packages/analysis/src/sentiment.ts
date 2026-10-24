import { readFileSync } from "node:fs";
import { normalizeForMatch } from "@majlis/dialect";
import { parse } from "yaml";

export type Sentiment = "positive" | "negative" | "neutral" | "mixed";

interface Lexicon {
  positive: Set<string>;
  negative: Set<string>;
  negators: Set<string>;
  phrases: { text: string; polarity: 1 | -1 }[];
}

let cached: Lexicon | undefined;

function lexicon(): Lexicon {
  if (cached) return cached;
  const raw = parse(
    readFileSync(new URL("../lexicon/sentiment-ar-SA.yaml", import.meta.url), "utf8"),
  ) as {
    positive: string[];
    negative: string[];
    negators: string[];
  };
  const norm = (l: string[]) => l.map(normalizeForMatch);
  const single = (l: string[]) => new Set(norm(l).filter((w) => !w.includes(" ")));
  cached = {
    positive: single(raw.positive),
    negative: single(raw.negative),
    negators: new Set(norm(raw.negators)),
    phrases: [
      ...norm(raw.positive)
        .filter((w) => w.includes(" "))
        .map((text) => ({ text, polarity: 1 as const })),
      ...norm(raw.negative)
        .filter((w) => w.includes(" "))
        .map((text) => ({ text, polarity: -1 as const })),
    ],
  };
  return cached;
}

export interface SentimentResult {
  label: Sentiment;
  /** Positive minus negative hits, after negation. */
  score: number;
  positive: number;
  negative: number;
}

/** Lexicon sentiment with negation; "mixed" when both sides are clearly present. */
export function scoreSentiment(text: string): SentimentResult {
  const lex = lexicon();
  let normalized = normalizeForMatch(text);
  let positive = 0;
  let negative = 0;
  for (const p of lex.phrases) {
    if (` ${normalized} `.includes(` ${p.text} `)) {
      if (p.polarity > 0) positive++;
      else negative++;
      normalized = ` ${normalized} `.replace(` ${p.text} `, " ").trim();
    }
  }
  const tokens = normalized.split(" ").filter(Boolean);
  tokens.forEach((token, i) => {
    // Strip a leading و/ف conjunction ("وزين") when the rest is a known word.
    const word =
      !lex.positive.has(token) && !lex.negative.has(token) && /^[وف]/.test(token)
        ? token.slice(1)
        : token;
    const polarity = lex.positive.has(word) ? 1 : lex.negative.has(word) ? -1 : 0;
    if (!polarity) return;
    const prev = tokens[i - 1] ?? "";
    // "وما تستاهل": the negator can carry the same attached conjunction.
    const negated =
      lex.negators.has(prev) || (/^[وف]/.test(prev) && lex.negators.has(prev.slice(1)));
    if (polarity * (negated ? -1 : 1) > 0) positive++;
    else negative++;
  });
  const score = positive - negative;
  const label: Sentiment =
    positive && negative && Math.abs(score) <= 1
      ? "mixed"
      : score > 0
        ? "positive"
        : score < 0
          ? "negative"
          : "neutral";
  return { label, score, positive, negative };
}
