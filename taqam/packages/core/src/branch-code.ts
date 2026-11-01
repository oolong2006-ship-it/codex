/**
 * Rotating branch code (spec §6): a 6-digit TOTP shown on the branch kiosk
 * screen, HMAC-SHA256 over the 30-second step counter with RFC 4226 dynamic
 * truncation. The HMAC is injected so core stays runtime-agnostic — the API
 * passes node `crypto`, the web passes a pure-JS implementation.
 */

/** HMAC over `msg` with the key given as hex; returns the raw MAC bytes. */
export type HmacFn = (keyHex: string, msg: Uint8Array) => Uint8Array;

export const BRANCH_CODE_STEP_SECONDS = 30;
export const BRANCH_CODE_DIGITS = 6;

/** 8-byte big-endian counter (safe for any counter below 2^53). */
function counterBytes(counter: number): Uint8Array {
  const out = new Uint8Array(8);
  let hi = Math.floor(counter / 0x100000000);
  let lo = counter >>> 0;
  for (let i = 7; i >= 4; i--) {
    out[i] = lo & 0xff;
    lo = lo >>> 8;
  }
  for (let i = 3; i >= 0; i--) {
    out[i] = hi & 0xff;
    hi = hi >>> 8;
  }
  return out;
}

/** RFC 4226 HOTP value for `counter` (the hash family is whatever `hmac` computes). */
export function hotp(secretHex: string, counter: number, hmac: HmacFn, digits = BRANCH_CODE_DIGITS): string {
  const mac = hmac(secretHex, counterBytes(counter));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

function stepOf(at: Date, stepSeconds: number): number {
  return Math.floor(at.getTime() / 1000 / stepSeconds);
}

/** The branch code valid at `at`. */
export function branchCode(
  secretHex: string,
  at: Date,
  hmac: HmacFn,
  stepSeconds = BRANCH_CODE_STEP_SECONDS,
): string {
  return hotp(secretHex, stepOf(at, stepSeconds), hmac);
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Trims and maps Arabic-Indic digits to ASCII. */
export function normalizeBranchCode(code: string): string {
  return String(code ?? '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXTENDED_ARABIC_INDIC.indexOf(d)));
}

/** True when `code` matches the current step or one within ±`window` steps. */
export function verifyBranchCode(
  secretHex: string,
  code: string,
  at: Date,
  hmac: HmacFn,
  window = 1,
  stepSeconds = BRANCH_CODE_STEP_SECONDS,
): boolean {
  const clean = normalizeBranchCode(code);
  if (!/^\d{6}$/.test(clean)) return false;
  const step = stepOf(at, stepSeconds);
  for (let d = -window; d <= window; d++) {
    if (hotp(secretHex, step + d, hmac) === clean) return true;
  }
  return false;
}

/** Whole seconds (1..step) until the code shown at `at` changes. */
export function branchCodeExpiresIn(at: Date, stepSeconds = BRANCH_CODE_STEP_SECONDS): number {
  const ms = stepSeconds * 1000;
  return Math.ceil((ms - (at.getTime() % ms)) / 1000);
}
