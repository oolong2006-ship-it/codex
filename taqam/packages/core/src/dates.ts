/**
 * Date & rounding helpers. All date math is done in UTC on date-only values
 * ('YYYY-MM-DD' strings are parsed as UTC midnight) to avoid timezone bugs.
 */
export type DateInput = string | Date;

const MS_PER_DAY = 86_400_000;

/** Round to 2 decimals (half away from zero, with float-epsilon correction). */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const r = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : sign * r;
}

/** Convert a DateInput to a UTC-midnight Date (date-only). */
export function toUtcDate(d: DateInput): Date {
  if (d instanceof Date) {
    if (isNaN(d.getTime())) throw new Error('Invalid date');
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d).trim());
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const da = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, da));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) {
      throw new Error(`Invalid date: ${d}`);
    }
    return dt;
  }
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) throw new Error(`Invalid date: ${d}`);
  return toUtcDate(parsed);
}

/** Format a DateInput as 'YYYY-MM-DD' (UTC). */
export function formatIsoDate(d: DateInput): string {
  const dt = toUtcDate(d);
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole days from a to b (b - a), date-only. */
export function diffDays(a: DateInput, b: DateInput): number {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / MS_PER_DAY);
}

export function addDays(d: DateInput, days: number): Date {
  return new Date(toUtcDate(d).getTime() + days * MS_PER_DAY);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Add calendar months, clamping the day to the target month's length. */
export function addMonths(d: DateInput, months: number): Date {
  const dt = toUtcDate(d);
  const total = dt.getUTCFullYear() * 12 + dt.getUTCMonth() + months;
  const y = Math.floor(total / 12);
  const m0 = total - y * 12;
  const day = Math.min(dt.getUTCDate(), daysInMonth(y, m0 + 1));
  return new Date(Date.UTC(y, m0, day));
}

export function addYears(d: DateInput, years: number): Date {
  return addMonths(d, years * 12);
}

/** Parse 'YYYY-MM' into { year, month } (month 1..12). */
export function parsePeriod(period: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period).trim());
  if (!m) throw new Error(`Invalid period (expected YYYY-MM): ${period}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid period month: ${period}`);
  return { year, month };
}

export interface ServiceDuration {
  years: number;
  months: number;
  days: number;
  /** Fractional years: completed years + remaining days / 365 (pro-rata by days). */
  totalYears: number;
  /** Total calendar days from start to end (end exclusive). */
  totalDays: number;
}

/**
 * Service duration from start to end. The end date is treated as exclusive
 * (e.g. 2020-01-01 → 2023-01-01 is exactly 3 years). totalYears counts completed
 * calendar years plus the remaining days (after the last anniversary) / 365.
 */
export function serviceDuration(start: DateInput, end: DateInput): ServiceDuration {
  const s = toUtcDate(start);
  const e = toUtcDate(end);
  if (e.getTime() <= s.getTime()) {
    return { years: 0, months: 0, days: 0, totalYears: 0, totalDays: 0 };
  }
  let totalMonths =
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
  if (addMonths(s, totalMonths).getTime() > e.getTime()) totalMonths -= 1;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths - years * 12;
  const days = diffDays(addMonths(s, totalMonths), e);
  const remainderAfterYears = diffDays(addYears(s, years), e);
  const totalYears = years + remainderAfterYears / 365;
  return { years, months, days, totalYears, totalDays: diffDays(s, e) };
}

/**
 * Payable days in a payroll period on a 30-day basis (0..30).
 * Full month = 30; joiner on day d → 30 - d + 1; leaver on day d → d
 * (leaving on the last calendar day of the month → 30); both → combined.
 */
export function payableDaysInPeriod(
  period: string,
  hireDate: DateInput,
  terminationDate?: DateInput | null,
): number {
  const { year, month } = parsePeriod(period);
  const periodStart = Date.UTC(year, month - 1, 1);
  const lastDay = daysInMonth(year, month);
  const periodEnd = Date.UTC(year, month - 1, lastDay);
  const hire = toUtcDate(hireDate);
  if (hire.getTime() > periodEnd) return 0;
  let startDay = 1;
  if (hire.getTime() >= periodStart) startDay = hire.getUTCDate();
  let endDay = 30;
  if (terminationDate !== undefined && terminationDate !== null && terminationDate !== '') {
    const term = toUtcDate(terminationDate);
    if (term.getTime() < periodStart) return 0;
    if (term.getTime() < hire.getTime()) return 0;
    if (term.getTime() <= periodEnd) {
      const d = term.getUTCDate();
      endDay = d === lastDay ? 30 : Math.min(d, 30);
    }
  }
  const days = endDay - startDay + 1;
  return Math.max(0, Math.min(30, days));
}

/** amount * days / 30 */
export function prorate(amount: number, payableDays: number): number {
  const d = Math.max(0, Math.min(30, payableDays));
  return round2((amount * d) / 30);
}
