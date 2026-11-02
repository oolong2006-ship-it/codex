/**
 * Branch kiosk (spec §6): the shared tablet in a branch. Employees punch with their employee number + PIN; the
 * screen also shows the rotating branch code for ESS punches. Never uses the camera — no photos of people, ever.
 * Pure rules mirror apps/api/src/kiosk/kiosk.service.ts and are shared by the kiosk screen and the demo mock.
 */
export const KIOSK_MAX_FAILS = 5;
export const KIOSK_WINDOW_MS = 15 * 60_000;
export const KIOSK_LOCK_MS = 15 * 60_000;
/** A second tap this soon after a kiosk check-in is not taken as the check-out. */
export const KIOSK_DOUBLE_TAP_MS = 60_000;

export const KIOSK_INVALID_AR = 'رقم الموظف أو الرمز غير صحيح';
export const KIOSK_LOCKED_AR = 'تم إيقاف الرمز مؤقتاً لكثرة المحاولات، حاول بعد 15 دقيقة';
export const KIOSK_TOKEN_INVALID_AR = 'هذا الجهاز غير مربوط أو أُلغي ربطه. اطلب رمز جهاز جديد من الموارد البشرية';
export const NEED_KIOSK_AR = 'اربط جهاز حضور في الفرع أولاً ليظهر الرمز للموظفين';

/** Demo build only: the pre-paired kiosk of «فرع العليا», and the PIN every demo employee has. */
export const DEMO_KIOSK_TOKEN = '7aabc7577c01b85808068b3592ad42f4e18c037be6b57d031a867eba46b9d81b';
export const DEMO_KIOSK_PIN = '1234';
/** سعود الدوسري (employee@shuoon.demo), EMP-0005 at «فرع العليا» — typed on the keypad as «5». */
export const DEMO_KIOSK_EMPLOYEE_NUMBER = '5';

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';
/** Trims and maps Arabic-Indic digits (both forms) to ASCII. */
export function normalizeDigits(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXTENDED_ARABIC_INDIC.indexOf(d)));
}

/** The PIN as ASCII digits, or null when it is not 4–6 digits. */
export function normalizePin(pin: unknown): string | null {
  if (typeof pin !== 'string') return null;
  const p = normalizeDigits(pin);
  return /^\d{4,6}$/.test(p) ? p : null;
}

/** Keypad / keyboard entry: appends one digit (Arabic-Indic accepted), ignores anything else, caps the length. */
export function keypadAppend(value: string, key: string, max: number): string {
  const d = normalizeDigits(key);
  if (!/^\d$/.test(d) || value.length >= max) return value;
  return value + d;
}

export const isKioskToken = (s: string) => /^[0-9a-f]{64}$/i.test(String(s ?? '').trim());

export interface PinState { failCount: number; firstFailAt: string | null; lockedUntil: string | null }
export const PIN_CLEAR: PinState = { failCount: 0, firstFailAt: null, lockedUntil: null };

export const isPinLocked = (s: PinState, now: Date) => !!s.lockedUntil && Date.parse(s.lockedUntil) > now.getTime();

/** State after one more wrong PIN: the window restarts when its first failure is older than 15 minutes. */
export function afterPinFailure(s: PinState, now: Date): PinState {
  const fresh = !s.firstFailAt || now.getTime() - Date.parse(s.firstFailAt) > KIOSK_WINDOW_MS;
  const failCount = fresh ? 1 : s.failCount + 1;
  return {
    failCount,
    firstFailAt: fresh ? now.toISOString() : s.firstFailAt,
    lockedUntil: failCount >= KIOSK_MAX_FAILS ? new Date(now.getTime() + KIOSK_LOCK_MS).toISOString() : null,
  };
}

/** Exact (case-insensitive) employee number, or digits only matched against its numeric part; ambiguous → null. */
export function matchEmployeeNumber<T extends { employeeNumber: string }>(input: string, candidates: T[]): T | null {
  const typed = normalizeDigits(input).toUpperCase();
  if (!typed) return null;
  const exact = candidates.filter((c) => c.employeeNumber.toUpperCase() === typed);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1 || !/^\d+$/.test(typed)) return null;
  const n = Number(typed);
  if (!n) return null;
  const byDigits = candidates.filter((c) => {
    const digits = c.employeeNumber.replace(/\D/g, '');
    return digits !== '' && Number(digits) === n;
  });
  return byDigits.length === 1 ? byDigits[0] : null;
}

interface RecLite { checkIn: string | null; checkOut: string | null; shift: { startTime: string; endTime: string } | null }
export type KioskDecision = { action: 'IN' } | { action: 'OUT'; target: 'today' | 'previous' } | { error: 'ALREADY_OUT' | 'TOO_SOON' };

/** IN when there is no check-in today, else OUT; a previous open record closes as OUT only for a shift crossing midnight. */
export function kioskAction(today: RecLite | null, previousOpen: RecLite | null, now: Date): KioskDecision {
  if (today?.checkIn) {
    if (today.checkOut) return { error: 'ALREADY_OUT' };
    if (now.getTime() - Date.parse(today.checkIn) < KIOSK_DOUBLE_TAP_MS) return { error: 'TOO_SOON' };
    return { action: 'OUT', target: 'today' };
  }
  const s = previousOpen?.shift;
  if (previousOpen?.checkIn && !previousOpen.checkOut && s && s.endTime <= s.startTime) return { action: 'OUT', target: 'previous' };
  return { action: 'IN' };
}
