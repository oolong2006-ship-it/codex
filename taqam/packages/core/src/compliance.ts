import { round2 } from './dates';
import type { DocumentComplianceStatus } from './documents';
import type { NitaqatBand } from './nitaqat';

// ---------- Compliance center (spec §5): government-services risk + true labor cost per branch ----------

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export const RISK_LEVEL_LABELS: Record<RiskLevel, { ar: string; en: string }> = {
  HIGH: { ar: 'مرتفعة', en: 'High' },
  MEDIUM: { ar: 'متوسطة', en: 'Medium' },
  LOW: { ar: 'منخفضة', en: 'Low' },
};

/** «خدماتك الحكومية: مخاطر مرتفعة / متوسطة / منخفضة» */
export function riskHeadline(level: RiskLevel): { ar: string; en: string } {
  return { ar: `خدماتك الحكومية: مخاطر ${RISK_LEVEL_LABELS[level].ar}`, en: `Your government services: ${RISK_LEVEL_LABELS[level].en.toLowerCase()} risk` };
}

export interface GovernmentRiskInput {
  /** official (Qiwa-documented) Nitaqat band */
  band: NitaqatBand;
  marginToDrop: number;
  undocumentedSaudis: number;
  /** the previous month has a payroll run whose WPS file was exported (or nothing was payable) */
  prevMonthWpsExported: boolean;
  /** day of the current month (Riyadh); the WPS item applies from the 10th */
  dayOfMonth: number;
  /** ERROR issues of the latest run's WPS check */
  latestWpsErrors: number;
  expiredIqamas: number;
  iqamasExpiring30: number;
  /** required documents expired, iqamas excluded (see complianceDocCounts) */
  docsExpired: number;
  /** required documents missing */
  docsMissing: number;
  /** active employees; when 0 there is no Nitaqat item (an empty company has no meaningful band) */
  total?: number;
}

export interface GovernmentRiskItem {
  key: string;
  level: RiskLevel;
  count: number;
  titleAr: string;
  titleEn: string;
  href: string;
}

export interface GovernmentRisk {
  level: RiskLevel;
  items: GovernmentRiskItem[];
}

/** WPS: from this day of the month the previous month's file must have been exported. */
export const WPS_EXPORT_DUE_DAY = 10;

const RANK: Record<RiskLevel, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };
const n0 = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Risk items (HIGH first, then MEDIUM, spec order within a level); overall level = max item level, LOW when none. */
export function governmentRisk(input: GovernmentRiskInput): GovernmentRisk {
  const items: GovernmentRiskItem[] = [];
  const add = (key: string, level: RiskLevel, count: number, titleAr: string, titleEn: string, href: string) =>
    items.push({ key, level, count, titleAr, titleEn, href });

  const margin = n0(input.marginToDrop);
  if (input.total === undefined || input.total > 0) {
    if (input.band === 'RED') add('NITAQAT', 'HIGH', margin, 'النطاق الرسمي أحمر', 'Official Nitaqat band is red', '/app/saudization');
    else if (input.band === 'LOW_GREEN' || margin <= 1)
      add('NITAQAT', 'MEDIUM', margin, 'النطاق الرسمي مهدد بالانخفاض', 'Official Nitaqat band at risk of dropping', '/app/saudization');
  }
  if (n0(input.undocumentedSaudis) > 0)
    add('UNDOCUMENTED_SAUDIS', 'MEDIUM', n0(input.undocumentedSaudis), 'سعوديون غير موثقة عقودهم في قوى', 'Saudis without Qiwa-documented contracts', '/app/saudization');
  if (!input.prevMonthWpsExported && input.dayOfMonth >= WPS_EXPORT_DUE_DAY)
    add('WPS_NOT_EXPORTED', 'HIGH', 1, 'لم يُصدَّر ملف حماية الأجور للشهر السابق', "Previous month's WPS file not exported", '/app/payroll');
  if (n0(input.latestWpsErrors) > 0)
    add('WPS_ERRORS', 'MEDIUM', n0(input.latestWpsErrors), 'أخطاء في ملف حماية الأجور لآخر مسير', "Errors in the latest run's WPS file", '/app/payroll');
  if (n0(input.expiredIqamas) > 0) add('IQAMA_EXPIRED', 'HIGH', n0(input.expiredIqamas), 'إقامات منتهية', 'Expired iqamas', '/app/documents');
  if (n0(input.iqamasExpiring30) > 0)
    add('IQAMA_EXPIRING', 'MEDIUM', n0(input.iqamasExpiring30), 'إقامات تنتهي خلال 30 يوماً', 'Iqamas expiring within 30 days', '/app/documents');
  if (n0(input.docsExpired) > 0) add('DOCS_EXPIRED', 'HIGH', n0(input.docsExpired), 'وثائق مطلوبة منتهية', 'Expired required documents', '/app/documents');
  if (n0(input.docsMissing) > 0) add('DOCS_MISSING', 'MEDIUM', n0(input.docsMissing), 'وثائق مطلوبة ناقصة', 'Missing required documents', '/app/documents');

  const sorted = items.map((it, i) => ({ it, i })).sort((a, b) => RANK[b.it.level] - RANK[a.it.level] || a.i - b.i).map((x) => x.it);
  const level = sorted.length ? sorted[0].level : 'LOW';
  return { level, items: sorted };
}

export interface ComplianceDocCounts {
  expiredIqamas: number;
  iqamasExpiring30: number;
  docsExpired: number;
  docsMissing: number;
}

/**
 * Splits documentCompliance rows into governmentRisk inputs so nothing is counted twice:
 * IQAMA EXPIRED → expiredIqamas, IQAMA CRITICAL (≤ 30 days) → iqamasExpiring30; EXPIRED of any other
 * type → docsExpired; MISSING of any type (an expat with no iqama on file included) → docsMissing.
 * WARNING (≤ 90 days) and other CRITICAL rows are not risk items.
 */
export function complianceDocCounts(rows: { type: string; status: DocumentComplianceStatus }[]): ComplianceDocCounts {
  const out: ComplianceDocCounts = { expiredIqamas: 0, iqamasExpiring30: 0, docsExpired: 0, docsMissing: 0 };
  for (const r of rows) {
    if (r.status === 'MISSING') out.docsMissing++;
    else if (r.type === 'IQAMA') {
      if (r.status === 'EXPIRED') out.expiredIqamas++;
      else if (r.status === 'CRITICAL') out.iqamasExpiring30++;
    } else if (r.status === 'EXPIRED') out.docsExpired++;
  }
  return out;
}

export interface LaborCostFees {
  /** المقابل المالي — monthly expat levy per non-Saudi (default 800) */
  expatLevyMonthly: number;
  /** رسوم الإقامة — annual iqama fee per non-Saudi (default 650; monthly = /12) */
  iqamaFeeAnnual: number;
}

export const DEFAULT_LABOR_COST_FEES: LaborCostFees = Object.freeze({ expatLevyMonthly: 800, iqamaFeeAnnual: 650 }) as LaborCostFees;

export interface LaborCostRow {
  branchId: string | null;
  isSaudi: boolean;
  gross: number;
  gosiEmployer: number;
}

export interface LaborCostTotals {
  headcount: number;
  saudis: number;
  gross: number;
  gosiEmployer: number;
  govFees: number;
  total: number;
  perEmployee: number;
}

export interface BranchLaborCost extends LaborCostTotals {
  branchId: string | null;
}

const fin = (n: number) => (Number.isFinite(n) ? n : 0);
const per = (total: number, headcount: number) => (headcount > 0 ? round2(total / headcount) : 0);

/** Monthly government fees for one non-Saudi: levy + iqama fee / 12 (unrounded). */
export function monthlyGovFeesPerExpat(fees: LaborCostFees): number {
  return fin(fees.expatLevyMonthly) + fin(fees.iqamaFeeAnnual) / 12;
}

/**
 * True labor cost per branch for one period: gross + GOSI employer + government fees for non-Saudis.
 * One row per branch present in `rows` (first-seen order); perEmployee is 0 (never NaN) without staff.
 */
export function branchLaborCost(rows: LaborCostRow[], fees: LaborCostFees): BranchLaborCost[] {
  const feePerExpat = monthlyGovFeesPerExpat(fees);
  const acc = new Map<string | null, { headcount: number; saudis: number; gross: number; gosiEmployer: number }>();
  for (const r of rows) {
    const a = acc.get(r.branchId) ?? { headcount: 0, saudis: 0, gross: 0, gosiEmployer: 0 };
    a.headcount++;
    if (r.isSaudi) a.saudis++;
    a.gross += fin(r.gross);
    a.gosiEmployer += fin(r.gosiEmployer);
    acc.set(r.branchId, a);
  }
  return [...acc.entries()].map(([branchId, a]) => {
    const gross = round2(a.gross);
    const gosiEmployer = round2(a.gosiEmployer);
    const govFees = round2((a.headcount - a.saudis) * feePerExpat);
    const total = round2(gross + gosiEmployer + govFees);
    return { branchId, headcount: a.headcount, saudis: a.saudis, gross, gosiEmployer, govFees, total, perEmployee: per(total, a.headcount) };
  });
}

/** Company totals as the sum of the branch rows (so the table adds up); zeros when empty. */
export function laborCostTotals(rows: LaborCostTotals[]): LaborCostTotals {
  const sum = (f: (r: LaborCostTotals) => number) => round2(rows.reduce((s, r) => s + fin(f(r)), 0));
  const headcount = rows.reduce((s, r) => s + r.headcount, 0);
  const total = sum((r) => r.total);
  return {
    headcount,
    saudis: rows.reduce((s, r) => s + r.saudis, 0),
    gross: sum((r) => r.gross),
    gosiEmployer: sum((r) => r.gosiEmployer),
    govFees: sum((r) => r.govFees),
    total,
    perEmployee: per(total, headcount),
  };
}
