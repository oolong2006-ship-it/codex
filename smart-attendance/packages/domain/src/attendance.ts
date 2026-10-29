/**
 * عقد البصمة (specs §D) وسياسات الحضور الافتراضية.
 */
import { DEFAULT_DEVICE_POLICY, DEVICE_POLICY_KIND } from './device-lock';
import { DEFAULT_TRUST_POLICY } from './trust/engine';

export const PUNCH_TYPES = ['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END'] as const;
export type PunchType = (typeof PUNCH_TYPES)[number];

/**
 * JSON قانوني للتوقيع: مفاتيح مرتبة، دون مسافات. الهاتف والخادم يحسبانه بالطريقة نفسها.
 * التوقيع على SHA256(nonce ‖ canonicalJson(body دون attestation)) — specs §D.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** سياسة الحضور (CLAUDE.md §5.4: لا أرقام في الكود — هذه قيم ابتدائية تُنسخ للسياسة). */
export const DEFAULT_ATTENDANCE_POLICY = {
  /** D-05: الاستراحات خارج المرحلة 2. */
  breaks_enabled: false,
  /** specs §A: انصراف دون حضور مفتوح = SEQUENCE_INVALID. */
  clock_out_requires_open_session: true,
  /** phase-2 §3: إغلاق الجلسة المفتوحة INCOMPLETE بعد هذه المدة. */
  max_session_hours: 16,
  /** phase-2 §4: السماح للتأخر والخروج المبكر بالدقائق. */
  late_grace_minutes: 10,
  early_leave_grace_minutes: 10,
  /** نافذة قبل بداية الوردية يُعد فيها الموقع «موقع الوردية الحالية» (specs §B). */
  shift_window_before_minutes: 120,
  shift_window_after_minutes: 120,
  /** specs §D: Idempotency 24 ساعة. */
  idempotency_ttl_hours: 24,
  /** مدة صلاحية تحدي البصمة بالثواني (specs §D: +60s). */
  challenge_ttl_seconds: 60,
};
export type AttendancePolicy = typeof DEFAULT_ATTENDANCE_POLICY;

export const ATTENDANCE_POLICY_KIND = 'attendance';
export const TRUST_POLICY_KIND = 'trust';

/** كل السياسات الابتدائية لعميل جديد. */
export const DEFAULT_POLICIES: { kind: string; name: string; values: unknown }[] = [
  { kind: DEVICE_POLICY_KIND, name: 'سياسة الأجهزة', values: DEFAULT_DEVICE_POLICY },
  { kind: TRUST_POLICY_KIND, name: 'سياسة الثقة', values: DEFAULT_TRUST_POLICY },
  { kind: ATTENDANCE_POLICY_KIND, name: 'سياسة الحضور', values: DEFAULT_ATTENDANCE_POLICY },
];
