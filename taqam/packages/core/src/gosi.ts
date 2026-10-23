import { round2 } from './dates';

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
