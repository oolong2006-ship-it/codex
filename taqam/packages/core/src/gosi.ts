import { DateInput, formatIsoDate, round2 } from './dates';

export interface GosiRates {
  /** default 0.0975 (9% annuities + 0.75% SANED) */
  saudiEmployee: number;
  /** default 0.1175 (9% + 0.75% SANED + 2% occupational hazards) */
  saudiEmployer: number;
  /** default 0 */
  nonSaudiEmployee: number;
  /** default 0.02 (occupational hazards) */
  nonSaudiEmployer: number;
  /** default 1500 */
  minBase: number;
  /** default 45000 */
  maxBase: number;
}

export const DEFAULT_GOSI_RATES: GosiRates = Object.freeze({
  saudiEmployee: 0.0975,
  saudiEmployer: 0.1175,
  nonSaudiEmployee: 0,
  nonSaudiEmployer: 0.02,
  minBase: 1500,
  maxBase: 45000,
}) as GosiRates;

export interface GosiResult {
  base: number;
  employee: number;
  employer: number;
  total: number;
}

/** base = clamp(basic + housing, minBase, maxBase) */
export function calculateGosi(
  input: { basic: number; housing: number; isSaudi: boolean },
  rates?: Partial<GosiRates>,
): GosiResult {
  const r: GosiRates = { ...DEFAULT_GOSI_RATES, ...(rates ?? {}) };
  const raw = (input.basic || 0) + (input.housing || 0);
  const base = round2(Math.min(r.maxBase, Math.max(r.minBase, raw)));
  const employee = round2(base * (input.isSaudi ? r.saudiEmployee : r.nonSaudiEmployee));
  const employer = round2(base * (input.isSaudi ? r.saudiEmployer : r.nonSaudiEmployer));
  return { base, employee, employer, total: round2(employee + employer) };
}

// ---------------------------------------------------------------------------
// New Social Insurance Law: two regimes for Saudi employees.
// النسب وفق نظام التأمينات الجديد؛ يُنصح بمطابقتها مع التأمينات
// ---------------------------------------------------------------------------

export type GosiRegime = 'LEGACY' | 'NEW';

/** Saudis first registered in GOSI on/after this date fall under the NEW regime. */
export const GOSI_NEW_REGIME_FROM = '2024-07-03';

/** Pension (annuities) rate per side under the LEGACY regime. */
export const LEGACY_PENSION_RATE = 0.09;

/** SANED (unemployment insurance) per side. */
export const SANED_RATE = 0.0075;

/** Occupational hazards — employer only. */
export const OCCUPATIONAL_HAZARDS_RATE = 0.02;

/**
 * NEW regime pension rate per side, by payroll period ('YYYY-MM').
 * Periods before the first entry use LEGACY_PENSION_RATE (9%). Sorted ascending.
 */
export const NEW_REGIME_PENSION_SCHEDULE: ReadonlyArray<{ readonly from: string; readonly rate: number }> = Object.freeze([
  { from: '2025-07', rate: 0.095 },
  { from: '2026-07', rate: 0.10 },
  { from: '2027-07', rate: 0.105 },
  { from: '2028-07', rate: 0.11 },
]);

/** Saudi with first GOSI registration ≥ 2024-07-03 → NEW; otherwise (incl. null / non-Saudi) → LEGACY. */
export function gosiRegime(isSaudi: boolean, firstRegisteredAt: DateInput | null): GosiRegime {
  if (!isSaudi || firstRegisteredAt == null || firstRegisteredAt === '') return 'LEGACY';
  let day: string;
  try {
    day = formatIsoDate(firstRegisteredAt);
  } catch {
    return 'LEGACY'; // an unparseable date must never break a payroll run
  }
  return day >= GOSI_NEW_REGIME_FROM ? 'NEW' : 'LEGACY';
}

/** Pension rate per side for the regime in the given period ('YYYY-MM'). */
export function saudiPensionRate(regime: GosiRegime, period: string): number {
  let rate = LEGACY_PENSION_RATE;
  if (regime !== 'NEW') return rate;
  const p = String(period).slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) throw new Error(`Invalid period (expected YYYY-MM): ${period}`);
  for (const step of NEW_REGIME_PENSION_SCHEDULE) {
    if (p >= step.from) rate = step.rate;
  }
  return rate;
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Full rates object for calculateGosi, resolved for the employee's regime and the payroll period. */
export function gosiRatesFor(
  input: { isSaudi: boolean; firstRegisteredAt: DateInput | null },
  period: string,
): GosiRates {
  const pension = saudiPensionRate(gosiRegime(input.isSaudi, input.firstRegisteredAt), period);
  return {
    ...DEFAULT_GOSI_RATES,
    saudiEmployee: round6(pension + SANED_RATE),
    saudiEmployer: round6(pension + SANED_RATE + OCCUPATIONAL_HAZARDS_RATE),
  };
}
