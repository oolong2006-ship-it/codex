import { DIALECTS, type Dialect } from "./dialects.js";
import { loadLexicon, type Lexicon } from "./lexicon.js";
import { countPhrase, normalizeForMatch } from "./text.js";

export interface DetectionResult {
  /** null when the evidence is too weak or too ambiguous to commit to a dialect. */
  dialect: Dialect | null;
  /** Share of the total marker score held by the top dialect (0..1). */
  confidence: number;
  scores: Record<Dialect, number>;
  evidence: { dialect: Dialect; marker: string; count: number }[];
}

export interface DetectOptions {
  /** Minimum marker score for the top dialect. */
  minScore?: number;
  /** Minimum lead of the top dialect over the runner-up. */
  minMargin?: number;
}

/**
 * Lexical baseline: weighted dialect markers over the participant's first
 * utterances. It commits only on clear evidence; otherwise the interviewer stays
 * in neutral "white" Saudi speech. Accuracy must be measured on labelled data
 * before it is trusted beyond that.
 */
export function detectDialect(
  utterances: readonly string[],
  options: DetectOptions = {},
  lexicon: Lexicon = loadLexicon(),
): DetectionResult {
  const minScore = options.minScore ?? 2;
  const minMargin = options.minMargin ?? 1;
  const text = normalizeForMatch(utterances.join(" "));
  const scores = Object.fromEntries(DIALECTS.map((d) => [d, 0])) as Record<Dialect, number>;
  const evidence: DetectionResult["evidence"] = [];

  for (const dialect of DIALECTS) {
    for (const marker of lexicon.dialects[dialect].markers) {
      const count = countPhrase(text, normalizeForMatch(marker.w));
      if (count > 0) {
        scores[dialect] += marker.weight * count;
        evidence.push({ dialect, marker: marker.w, count });
      }
    }
  }

  const ranked = [...DIALECTS].sort((a, b) => scores[b] - scores[a]);
  const top = ranked[0]!;
  const runnerUp = ranked[1]!;
  const total = DIALECTS.reduce((sum, d) => sum + scores[d], 0);
  const confidence = total > 0 ? scores[top] / total : 0;
  const decisive = scores[top] >= minScore && scores[top] - scores[runnerUp] >= minMargin;

  return { dialect: decisive ? top : null, confidence, scores, evidence };
}
