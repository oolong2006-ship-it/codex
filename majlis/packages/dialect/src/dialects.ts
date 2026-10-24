export const DIALECTS = [
  "najdi",
  "hijazi",
  "southern",
  "eastern",
  "northern",
  "msa_simple",
] as const;
export type Dialect = (typeof DIALECTS)[number];

export function isDialect(value: unknown): value is Dialect {
  return typeof value === "string" && (DIALECTS as readonly string[]).includes(value);
}
