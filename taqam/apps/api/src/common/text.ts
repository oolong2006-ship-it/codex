/** Text hygiene helpers (docs/ADMIN_PORTAL.md v2.1). */

// C0/C1 whitespace-like controls and line/paragraph separators become a space
const BREAKS = /[\t\n\v\f\r\u0085\u2028\u2029]+/g;
// other control characters and bidi embeddings/overrides/isolates are removed
// eslint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/**
 * Company names are printed in emails and invoices: newlines / control characters / bidi overrides are stripped
 * (prevents injecting fake "bank instructions" lines into Shuoon emails), runs of spaces collapsed, trimmed.
 * Non-strings are returned as is (validation rejects them).
 */
export function cleanName<T>(v: T): T {
  if (typeof v !== 'string') return v;
  return v.replace(BREAKS, ' ').replace(CONTROLS, '').replace(/ {2,}/g, ' ').trim() as T;
}

/** class-transformer @Transform callback for name fields. */
export const cleanNameTransform = ({ value }: { value: unknown }) => cleanName(value);

/** Wraps a left-to-right value (ISO date, number, invoice number) in Unicode isolates LRI … PDI for Arabic text. */
export const isolate = (s: string | number) => `\u2066${s}\u2069`;

/** Maximum length of a company name. */
export const NAME_MAX = 200;
