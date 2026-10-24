/** Dialects targeted by the MVP. Detector, normalizer and lexicon arrive in phase 2. */
export const DIALECTS = [
  "najdi",
  "hijazi",
  "southern",
  "eastern",
  "northern",
  "msa_simple",
] as const;
export type Dialect = (typeof DIALECTS)[number];
