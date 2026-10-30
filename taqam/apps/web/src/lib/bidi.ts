/**
 * Bidi helpers for plain-text Arabic (emails, notifications). Latin runs such as ISO dates ("2026-10-29") or document
 * numbers ("SH-2026-0001") are reordered by the Unicode bidi algorithm inside right-to-left text (hyphens are weak
 * characters), so they are wrapped in a left-to-right isolate (U+2066 … U+2069), which renders them intact.
 */
export const LRI = '⁦';
export const PDI = '⁩';

/** Wraps one left-to-right run in an isolate (idempotent). */
export const ltr = (s: string) => (s.startsWith(LRI) && s.endsWith(PDI) ? s : `${LRI}${s}${PDI}`);

const LTR_RUNS = /⁦[^⁩]*⁩|SHC?-\d{4}-\d{4}|\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?/g;
/** Isolates every ISO date and SH/SHC document number in an Arabic text (already isolated runs are kept). */
export const isolateLtrRuns = (text: string) => text.replace(LTR_RUNS, (m) => (m.startsWith(LRI) ? m : ltr(m)));

/** Removes the isolate marks (e.g. before comparing text in tests). */
export const stripIsolates = (text: string) => text.replace(/[⁦-⁩]/g, '');
