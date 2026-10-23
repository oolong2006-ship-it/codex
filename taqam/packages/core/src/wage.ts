import { round2 } from './dates';

export interface WageComponents {
  basic: number;
  housing: number;
  transport: number;
  /** other fixed monthly allowances */
  other: number;
}

const n = (v: number | undefined | null): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Sum of all fixed monthly components. */
export function totalWage(w: WageComponents): number {
  return round2(n(w.basic) + n(w.housing) + n(w.transport) + n(w.other));
}

/** totalWage / 30 (unrounded internally; returned rounded to 2 decimals). */
export function dailyWage(w: WageComponents): number {
  return round2(totalWage(w) / 30);
}

/** daily / hoursPerDay (default 8). */
export function hourlyWage(w: WageComponents, hoursPerDay: number = 8): number {
  const h = hoursPerDay > 0 ? hoursPerDay : 8;
  return round2(totalWage(w) / 30 / h);
}

/** Unrounded helpers for internal precision. */
export function rawDaily(w: WageComponents): number {
  return (n(w.basic) + n(w.housing) + n(w.transport) + n(w.other)) / 30;
}

/**
 * Overtime pay (Art. 107): per OT hour = hourly(total wage) + 50% of hourly(basic).
 */
export function overtimePay(w: WageComponents, overtimeHours: number, hoursPerDay: number = 8): number {
  const h = hoursPerDay > 0 ? hoursPerDay : 8;
  const hrs = Math.max(0, n(overtimeHours));
  const hourlyTotal = rawDaily(w) / h;
  const hourlyBasic = n(w.basic) / 30 / h;
  return round2(hrs * (hourlyTotal + 0.5 * hourlyBasic));
}

/** dailyWage * absentDays */
export function absenceDeduction(w: WageComponents, absentDays: number): number {
  return round2(rawDaily(w) * Math.max(0, n(absentDays)));
}
