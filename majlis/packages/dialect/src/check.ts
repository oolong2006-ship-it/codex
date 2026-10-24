import type { Dialect } from "./dialects.js";
import { avoidListFor, loadLexicon, type Lexicon } from "./lexicon.js";
import { containsPhrase, normalizeForMatch } from "./text.js";

export interface DialectIssue {
  phrase: string;
  reason: string;
}

/** Phrases in an interviewer sentence that sound artificial or belong to another dialect. */
export function checkDialectText(
  sentence: string,
  dialect: Dialect,
  lexicon: Lexicon = loadLexicon(),
): DialectIssue[] {
  const text = normalizeForMatch(sentence);
  return avoidListFor(dialect, lexicon)
    .filter((a) => containsPhrase(text, normalizeForMatch(a.phrase)))
    .map((a) => ({ phrase: a.phrase, reason: a.reason }));
}

/** Share of sentences with no dialect issues (feeds the ≥95% dialect-correctness metric). */
export function dialectCorrectness(
  sentences: readonly string[],
  dialect: Dialect,
  lexicon: Lexicon = loadLexicon(),
): number {
  if (sentences.length === 0) return 1;
  const clean = sentences.filter((s) => checkDialectText(s, dialect, lexicon).length === 0);
  return clean.length / sentences.length;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Applies the shared ASR spelling corrections on word boundaries. */
export function correctTranscript(text: string, lexicon: Lexicon = loadLexicon()): string {
  let out = text;
  for (const { from, to } of lexicon.common.asr_corrections) {
    out = out.replace(
      new RegExp(`(^|[\\s،,.؟?!])${escapeRegExp(from)}(?=$|[\\s،,.؟?!])`, "gu"),
      `$1${to}`,
    );
  }
  return out;
}
