import { describe, expect, it } from 'vitest';
import { COST_SEGMENTS, costBarWidths, FEES_NOTE, parseFee } from './compliance';

describe('compliance center copy and chart helpers (spec §5)', () => {
  it('labels the fee defaults as editable values to verify (verbatim from the spec)', () => {
    expect(FEES_NOTE.ar).toBe('قابلة للتعديل من الإعدادات — تحقق من الرسوم الحالية');
    expect(FEES_NOTE.en).toBe('Editable in Settings — verify the current fees');
  });

  it('three cost segments in a fixed order with validated categorical colours', () => {
    expect(COST_SEGMENTS.map((s) => s.key)).toEqual(['gross', 'gosiEmployer', 'govFees']);
    expect(COST_SEGMENTS.map((s) => s.color)).toEqual(['#2a78d6', '#eb6834', '#1baf7a']);
    expect(COST_SEGMENTS[2].label.ar).toBe('رسوم حكومية');
  });

  it('segment widths are a share of the largest branch total; zero totals give zeros, never NaN', () => {
    const w = costBarWidths([
      { gross: 6000, gosiEmployer: 1000, govFees: 1000, total: 8000 },
      { gross: 3000, gosiEmployer: 500, govFees: 500, total: 4000 },
    ]);
    expect(w).toEqual([
      { gross: 75, gosiEmployer: 12.5, govFees: 12.5, total: 100 },
      { gross: 37.5, gosiEmployer: 6.25, govFees: 6.25, total: 50 },
    ]);
    expect(costBarWidths([{ gross: 0, gosiEmployer: 0, govFees: 0, total: 0 }])).toEqual([{ gross: 0, gosiEmployer: 0, govFees: 0, total: 0 }]);
    expect(costBarWidths([])).toEqual([]);
  });
});

describe('parseFee — settings fee inputs', () => {
  it('rounds to 2 decimals', () => {
    expect(parseFee('800')).toEqual({ value: 800 });
    expect(parseFee('54.166')).toEqual({ value: 54.17 });
    expect(parseFee(650.004)).toEqual({ value: 650 });
    expect(parseFee('0')).toEqual({ value: 0 });
  });
  it('empty, non-numeric or negative values are errors (never silently the default)', () => {
    for (const raw of ['', '  ', undefined, null, 'abc', '-1', Number.NaN]) {
      const r = parseFee(raw);
      expect('error' in r && r.error.ar).toBe('أدخل مبلغاً صحيحاً (0 أو أكثر)');
    }
    expect(parseFee('100001')).toEqual({ error: { ar: 'الحد الأقصى 100,000', en: 'Maximum 100,000' } });
  });
});
