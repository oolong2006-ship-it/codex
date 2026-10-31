import { round2 } from './dates';

export type NitaqatBand = 'PLATINUM' | 'HIGH_GREEN' | 'MID_GREEN' | 'LOW_GREEN' | 'RED';
/** percentages */
export interface NitaqatThresholds {
  platinum: number;
  highGreen: number;
  midGreen: number;
  lowGreen: number;
}

/** Demo values — real thresholds depend on activity & establishment size. */
export const DEFAULT_NITAQAT_THRESHOLDS: NitaqatThresholds = Object.freeze({
  platinum: 40,
  highGreen: 27,
  midGreen: 20,
  lowGreen: 12,
}) as NitaqatThresholds;

export const NITAQAT_BAND_LABELS: Record<NitaqatBand, { ar: string; en: string }> = {
  PLATINUM: { ar: 'بلاتيني', en: 'Platinum' },
  HIGH_GREEN: { ar: 'أخضر مرتفع', en: 'High green' },
  MID_GREEN: { ar: 'أخضر متوسط', en: 'Mid green' },
  LOW_GREEN: { ar: 'أخضر منخفض', en: 'Low green' },
  RED: { ar: 'أحمر', en: 'Red' },
};

const ORDER: NitaqatBand[] = ['RED', 'LOW_GREEN', 'MID_GREEN', 'HIGH_GREEN', 'PLATINUM'];

/** percent 0..100, 2 decimals; 0 when total is 0. */
export function saudizationRate(saudis: number, total: number): number {
  if (!(total > 0)) return 0;
  const s = Math.max(0, Math.min(saudis, total));
  return round2((s / total) * 100);
}

export function nitaqatBand(rate: number, t: NitaqatThresholds = DEFAULT_NITAQAT_THRESHOLDS): NitaqatBand {
  if (rate >= t.platinum) return 'PLATINUM';
  if (rate >= t.highGreen) return 'HIGH_GREEN';
  if (rate >= t.midGreen) return 'MID_GREEN';
  if (rate >= t.lowGreen) return 'LOW_GREEN';
  return 'RED';
}

function thresholdFor(band: NitaqatBand, t: NitaqatThresholds): number {
  switch (band) {
    case 'PLATINUM': return t.platinum;
    case 'HIGH_GREEN': return t.highGreen;
    case 'MID_GREEN': return t.midGreen;
    case 'LOW_GREEN': return t.lowGreen;
    default: return 0;
  }
}

/** Additional Saudi hires (added to both saudis and total) needed to reach `target`. */
export function hiresNeededForBand(
  saudis: number,
  total: number,
  target: NitaqatBand,
  t: NitaqatThresholds = DEFAULT_NITAQAT_THRESHOLDS,
): number {
  const s = Math.max(0, saudis);
  const n = Math.max(s, total);
  const reached = (x: number) => ORDER.indexOf(nitaqatBand(saudizationRate(s + x, n + x), t)) >= ORDER.indexOf(target);
  if (target === 'RED' || reached(0)) return 0;
  const p = thresholdFor(target, t);
  if (p >= 100) return Number.POSITIVE_INFINITY;
  let x = Math.max(0, Math.ceil((p * n - 100 * s) / (100 - p)) - 1);
  while (!reached(x)) x++;
  return x;
}

/**
 * How many documented Saudis (each leaving reduces both counts) can leave before the
 * official band drops. 0 when already RED or there are no employees.
 */
export function marginToDrop(
  documentedSaudis: number,
  total: number,
  t: NitaqatThresholds = DEFAULT_NITAQAT_THRESHOLDS,
): number {
  const d = Math.max(0, Math.floor(documentedSaudis));
  const n = Math.max(d, Math.floor(total));
  if (!(n > 0)) return 0;
  const band = nitaqatBand(saudizationRate(d, n), t);
  if (band === 'RED') return 0;
  let k = 0;
  while (k < d && nitaqatBand(saudizationRate(d - k - 1, n - k - 1), t) === band) k++;
  return k;
}

export interface OfficialSaudization {
  total: number;
  saudis: number;
  documentedSaudis: number;
  undocumentedSaudis: number;
  /** documented Saudis / all active employees (counts for Nitaqat since 15 Apr 2026) */
  officialRate: number;
  /** all Saudis / all active employees */
  internalRate: number;
  /** band of the official rate */
  band: NitaqatBand;
  marginToDrop: number;
}

/** Since 15 Apr 2026 only Saudis whose contracts are documented in Qiwa count for Nitaqat. */
export function officialSaudization(
  employees: { isSaudi: boolean; qiwaDocumented: boolean }[],
  t: NitaqatThresholds = DEFAULT_NITAQAT_THRESHOLDS,
): OfficialSaudization {
  const total = employees.length;
  const saudis = employees.filter((e) => e.isSaudi).length;
  const documentedSaudis = employees.filter((e) => e.isSaudi && e.qiwaDocumented).length;
  const officialRate = saudizationRate(documentedSaudis, total);
  return {
    total,
    saudis,
    documentedSaudis,
    undocumentedSaudis: saudis - documentedSaudis,
    officialRate,
    internalRate: saudizationRate(saudis, total),
    band: nitaqatBand(officialRate, t),
    marginToDrop: marginToDrop(documentedSaudis, total, t),
  };
}

/** «تنبيه نطاقات»: some Saudi contracts are undocumented, or ≤ 1 documented departure drops the band. Never for an empty branch. */
export function nitaqatAlert(s: Pick<OfficialSaudization, 'total' | 'undocumentedSaudis' | 'marginToDrop'>): boolean {
  if (!(s.total > 0)) return false;
  return s.undocumentedSaudis > 0 || s.marginToDrop <= 1;
}
