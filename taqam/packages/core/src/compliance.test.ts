import { describe, it, expect } from 'vitest';
import {
  branchLaborCost,
  complianceDocCounts,
  governmentRisk,
  laborCostTotals,
  RISK_LEVEL_LABELS,
  riskHeadline,
  type GovernmentRiskInput,
} from './index';

/** A company with nothing to report. */
const CLEAN: GovernmentRiskInput = {
  band: 'MID_GREEN',
  marginToDrop: 3,
  undocumentedSaudis: 0,
  prevMonthWpsExported: true,
  dayOfMonth: 15,
  latestWpsErrors: 0,
  expiredIqamas: 0,
  iqamasExpiring30: 0,
  docsExpired: 0,
  docsMissing: 0,
};
const keys = (r: ReturnType<typeof governmentRisk>) => r.items.map((i) => `${i.key}:${i.level}:${i.count}`);

describe('governmentRisk (spec §5)', () => {
  it('all clean → LOW with no items', () => {
    expect(governmentRisk(CLEAN)).toEqual({ level: 'LOW', items: [] });
  });

  it('official band RED → HIGH item and overall HIGH', () => {
    const r = governmentRisk({ ...CLEAN, band: 'RED', marginToDrop: 0 });
    expect(r.level).toBe('HIGH');
    expect(r.items).toEqual([
      { key: 'NITAQAT', level: 'HIGH', count: 0, titleAr: 'النطاق الرسمي أحمر', titleEn: 'Official Nitaqat band is red', href: '/app/saudization' },
    ]);
  });

  it('LOW_GREEN or marginToDrop <= 1 → MEDIUM Nitaqat item', () => {
    expect(keys(governmentRisk({ ...CLEAN, band: 'LOW_GREEN', marginToDrop: 4 }))).toEqual(['NITAQAT:MEDIUM:4']);
    expect(keys(governmentRisk({ ...CLEAN, band: 'HIGH_GREEN', marginToDrop: 1 }))).toEqual(['NITAQAT:MEDIUM:1']);
    expect(keys(governmentRisk({ ...CLEAN, band: 'PLATINUM', marginToDrop: 2 }))).toEqual([]);
    expect(governmentRisk({ ...CLEAN, marginToDrop: 0 }).level).toBe('MEDIUM');
  });

  it('a company with no active staff has no Nitaqat item (an empty RED band is not a risk)', () => {
    expect(governmentRisk({ ...CLEAN, band: 'RED', marginToDrop: 0, total: 0 })).toEqual({ level: 'LOW', items: [] });
    expect(governmentRisk({ ...CLEAN, band: 'RED', marginToDrop: 0, total: 5 }).level).toBe('HIGH');
  });

  it('undocumented Saudis → MEDIUM with the count', () => {
    const r = governmentRisk({ ...CLEAN, undocumentedSaudis: 3 });
    expect(r.level).toBe('MEDIUM');
    expect(r.items).toEqual([
      { key: 'UNDOCUMENTED_SAUDIS', level: 'MEDIUM', count: 3, titleAr: 'سعوديون غير موثقة عقودهم في قوى', titleEn: 'Saudis without Qiwa-documented contracts', href: '/app/saudization' },
    ]);
  });

  it('previous month not exported: no item on day 9, HIGH from day 10', () => {
    expect(governmentRisk({ ...CLEAN, prevMonthWpsExported: false, dayOfMonth: 9 })).toEqual({ level: 'LOW', items: [] });
    const r = governmentRisk({ ...CLEAN, prevMonthWpsExported: false, dayOfMonth: 10 });
    expect(r.level).toBe('HIGH');
    expect(keys(r)).toEqual(['WPS_NOT_EXPORTED:HIGH:1']);
    expect(r.items[0]).toMatchObject({ titleAr: 'لم يُصدَّر ملف حماية الأجور للشهر السابق', href: '/app/payroll' });
    expect(keys(governmentRisk({ ...CLEAN, prevMonthWpsExported: false, dayOfMonth: 28 }))).toEqual(['WPS_NOT_EXPORTED:HIGH:1']);
  });

  it('WPS errors in the latest run → MEDIUM', () => {
    expect(keys(governmentRisk({ ...CLEAN, latestWpsErrors: 2 }))).toEqual(['WPS_ERRORS:MEDIUM:2']);
  });

  it('iqamas: expired → HIGH, expiring ≤ 30 days → MEDIUM; sector documents: expired → HIGH, missing → MEDIUM', () => {
    const r = governmentRisk({ ...CLEAN, expiredIqamas: 1, iqamasExpiring30: 2, docsExpired: 3, docsMissing: 4 });
    expect(r.level).toBe('HIGH');
    expect(keys(r)).toEqual(['IQAMA_EXPIRED:HIGH:1', 'DOCS_EXPIRED:HIGH:3', 'IQAMA_EXPIRING:MEDIUM:2', 'DOCS_MISSING:MEDIUM:4']);
    expect(r.items.every((i) => i.href === '/app/documents')).toBe(true);
  });

  it('overall = max item level; HIGH items listed before MEDIUM', () => {
    const r = governmentRisk({ ...CLEAN, undocumentedSaudis: 2, band: 'RED', marginToDrop: 0, latestWpsErrors: 1, docsMissing: 1 });
    expect(r.level).toBe('HIGH');
    expect(keys(r)).toEqual(['NITAQAT:HIGH:0', 'UNDOCUMENTED_SAUDIS:MEDIUM:2', 'WPS_ERRORS:MEDIUM:1', 'DOCS_MISSING:MEDIUM:1']);
  });

  it('headline and labels', () => {
    expect(riskHeadline('HIGH')).toEqual({ ar: 'خدماتك الحكومية: مخاطر مرتفعة', en: 'Your government services: high risk' });
    expect(riskHeadline('MEDIUM').ar).toBe('خدماتك الحكومية: مخاطر متوسطة');
    expect(riskHeadline('LOW').ar).toBe('خدماتك الحكومية: مخاطر منخفضة');
    expect(RISK_LEVEL_LABELS.MEDIUM).toEqual({ ar: 'متوسطة', en: 'Medium' });
  });
});

describe('complianceDocCounts — iqama vs sector documents, nothing counted twice', () => {
  it('splits documentCompliance rows: IQAMA feeds the iqama counts only', () => {
    const rows = [
      { type: 'IQAMA', status: 'EXPIRED' as const },
      { type: 'IQAMA', status: 'CRITICAL' as const },
      { type: 'IQAMA', status: 'CRITICAL' as const },
      { type: 'IQAMA', status: 'WARNING' as const },
      { type: 'HEALTH_CERTIFICATE', status: 'EXPIRED' as const },
      { type: 'HEALTH_CERTIFICATE', status: 'MISSING' as const },
      { type: 'DRIVER_CARD', status: 'MISSING' as const },
      { type: 'DRIVING_LICENSE', status: 'CRITICAL' as const },
    ];
    expect(complianceDocCounts(rows)).toEqual({ expiredIqamas: 1, iqamasExpiring30: 2, docsExpired: 1, docsMissing: 2 });
  });

  it('an expired iqama is never also an expired document; a missing iqama (none on file) counts as a missing document', () => {
    expect(complianceDocCounts([{ type: 'IQAMA', status: 'EXPIRED' }])).toEqual({ expiredIqamas: 1, iqamasExpiring30: 0, docsExpired: 0, docsMissing: 0 });
    expect(complianceDocCounts([{ type: 'IQAMA', status: 'MISSING' }])).toEqual({ expiredIqamas: 0, iqamasExpiring30: 0, docsExpired: 0, docsMissing: 1 });
    expect(complianceDocCounts([])).toEqual({ expiredIqamas: 0, iqamasExpiring30: 0, docsExpired: 0, docsMissing: 0 });
  });
});

describe('branchLaborCost (spec §5)', () => {
  const FEES = { expatLevyMonthly: 800, iqamaFeeAnnual: 650 };

  it('gross + GOSI employer + government fees for non-Saudis (levy + iqama/12)', () => {
    const out = branchLaborCost(
      [
        { branchId: 'b1', isSaudi: false, gross: 3000, gosiEmployer: 60 },
        { branchId: 'b1', isSaudi: false, gross: 3000, gosiEmployer: 60 },
        { branchId: 'b1', isSaudi: true, gross: 8000, gosiEmployer: 940 },
      ],
      FEES,
    );
    expect(out).toEqual([
      { branchId: 'b1', headcount: 3, saudis: 1, gross: 14000, gosiEmployer: 1060, govFees: 1708.33, total: 16768.33, perEmployee: 5589.44 },
    ]);
  });

  it('one row per branch present in the input (first-seen order, unassigned = null); branches without rows are absent', () => {
    const out = branchLaborCost(
      [
        { branchId: 'b2', isSaudi: true, gross: 5000, gosiEmployer: 587.5 },
        { branchId: null, isSaudi: false, gross: 2000, gosiEmployer: 40 },
        { branchId: 'b2', isSaudi: true, gross: 7000, gosiEmployer: 822.5 },
      ],
      FEES,
    );
    expect(out.map((r) => r.branchId)).toEqual(['b2', null]);
    expect(out[0]).toEqual({ branchId: 'b2', headcount: 2, saudis: 2, gross: 12000, gosiEmployer: 1410, govFees: 0, total: 13410, perEmployee: 6705 });
    expect(out[1]).toMatchObject({ headcount: 1, saudis: 0, govFees: 854.17, total: 2894.17 });
    expect(branchLaborCost([], FEES)).toEqual([]);
  });

  it('never NaN: zero pay gives perEmployee 0; non-finite inputs and fees count as 0', () => {
    const [r] = branchLaborCost([{ branchId: 'b1', isSaudi: true, gross: 0, gosiEmployer: 0 }], FEES);
    expect(r).toEqual({ branchId: 'b1', headcount: 1, saudis: 1, gross: 0, gosiEmployer: 0, govFees: 0, total: 0, perEmployee: 0 });
    const [n] = branchLaborCost([{ branchId: 'b1', isSaudi: false, gross: Number.NaN, gosiEmployer: 10 }], { expatLevyMonthly: Number.NaN, iqamaFeeAnnual: 1200 });
    expect(n).toEqual({ branchId: 'b1', headcount: 1, saudis: 0, gross: 0, gosiEmployer: 10, govFees: 100, total: 110, perEmployee: 110 });
  });

  it('laborCostTotals sums the branch rows; empty → zeros, never NaN', () => {
    const rows = branchLaborCost(
      [
        { branchId: 'b1', isSaudi: false, gross: 3000, gosiEmployer: 60 },
        { branchId: 'b2', isSaudi: true, gross: 8000, gosiEmployer: 940 },
      ],
      FEES,
    );
    expect(laborCostTotals(rows)).toEqual({ headcount: 2, saudis: 1, gross: 11000, gosiEmployer: 1000, govFees: 854.17, total: 12854.17, perEmployee: 6427.09 });
    expect(laborCostTotals([])).toEqual({ headcount: 0, saudis: 0, gross: 0, gosiEmployer: 0, govFees: 0, total: 0, perEmployee: 0 });
  });
});
