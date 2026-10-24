/**
 * Redaction for anything shown to the client. Participants are asked not to
 * share personal details, but people do; this removes the patterns that can be
 * detected reliably. Names cannot be detected reliably and are not handled here.
 */

export const REDACTED = "[محذوف]";

const PATTERNS: [string, RegExp][] = [
  ["email", /[\w.+-]+@[\w-]+\.[\w.-]+/gu],
  // Saudi IBAN: SA + 22 digits, optionally grouped.
  ["iban", /\bSA\d{2}(?:\s?\d{4}){5}\b/giu],
  // Saudi mobiles: 05xxxxxxxx, 5xxxxxxxx, +9665xxxxxxxx, 009665xxxxxxxx (spaces/dashes allowed).
  ["phone", /(?:\+|00)?(?:966[\s-]?)?0?5(?:[\s-]?\d){8}\b/gu],
  // National ID / Iqama: 10 digits starting with 1 or 2.
  ["national_id", /\b[12]\d{9}\b/gu],
];

const ARABIC_DIGITS = /[٠-٩]/g;

export function redactPII(text: string): string {
  let out = text.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660));
  for (const [, pattern] of PATTERNS) out = out.replace(pattern, REDACTED);
  return out;
}

/** Field names that must never appear in a client-facing payload. */
export const FORBIDDEN_CLIENT_FIELDS = [
  "name",
  "fullName",
  "email",
  "phone",
  "mobile",
  "nationalId",
  "ip",
  "ipAddress",
  "contact",
  "participantRef",
  "passwordHash",
] as const;
