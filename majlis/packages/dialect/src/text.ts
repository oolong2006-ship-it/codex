/**
 * Matching-oriented normalization (not for display). Mirrors the voice-lab
 * scoring rules so lexicon entries match regardless of spelling variants.
 */
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
const PUNCT = /[^\p{L}\p{N}\s]/gu;

const LETTER_MAP: Record<string, string> = {
  أ: "ا",
  إ: "ا",
  آ: "ا",
  ٱ: "ا",
  ى: "ي",
  ة: "ه",
  ؤ: "و",
  ئ: "ي",
  ڤ: "ف",
  چ: "ج",
  گ: "ك",
};

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱىةؤئڤچگ]/g, (c) => LETTER_MAP[c] ?? c)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PUNCT, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  const normalized = normalizeForMatch(text);
  return normalized ? normalized.split(" ") : [];
}

/** True when `phrase` occurs in `text` on token boundaries (both already normalized). */
export function containsPhrase(normalizedText: string, normalizedPhrase: string): boolean {
  if (!normalizedPhrase) return false;
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

export function countPhrase(normalizedText: string, normalizedPhrase: string): number {
  if (!normalizedPhrase) return 0;
  const haystack = ` ${normalizedText} `;
  const needle = ` ${normalizedPhrase} `;
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) count++;
  return count;
}
