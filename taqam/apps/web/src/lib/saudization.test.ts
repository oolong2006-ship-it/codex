import { describe, expect, it } from 'vitest';
import { arCount, DOCUMENTED_SAUDI, marginNote, nitaqatAlertReasons, OFFICIAL_ESTIMATE, QIWA_RULE, SAUDI, undocumentedTitle } from './saudization';

const base = { total: 10, undocumentedSaudis: 0, marginToDrop: 3, band: 'HIGH_GREEN' as const, alert: false };

describe('«تنبيه نطاقات» reasons shown on the Saudization page', () => {
  it('explains why the official rate can be lower than the internal one (15 April 2026 rule)', () => {
    expect(QIWA_RULE.ar).toContain('15 أبريل 2026');
    expect(QIWA_RULE.ar).toContain('قوى');
    expect(QIWA_RULE.en).toContain('15 April 2026');
  });

  it('no alert → no reasons', () => {
    expect(nitaqatAlertReasons(base)).toEqual([]);
  });

  it('undocumented Saudis', () => {
    const r = nitaqatAlertReasons({ ...base, alert: true, undocumentedSaudis: 2 });
    expect(r).toEqual([{ ar: 'سعوديان عقداهما غير موثقين في قوى — لا يُحتسبان في نسبتك الرسمية', en: '2 Saudis without a Qiwa-documented contract — not counted in your official rate' }]);
  });

  it('thin margin: one departure drops the band; zero margin (non-RED) means the next departure drops it', () => {
    expect(nitaqatAlertReasons({ ...base, alert: true, marginToDrop: 1 })).toEqual([
      { ar: 'مغادرة سعوديين موثقين اثنين تُنزل نطاقك', en: '2 documented Saudis leaving would drop your band' },
    ]);
    expect(nitaqatAlertReasons({ ...base, alert: true, marginToDrop: 0 })).toEqual([
      { ar: 'مغادرة سعودي موثق واحد تُنزل نطاقك', en: '1 documented Saudi leaving would drop your band' },
    ]);
  });

  it('RED: says so instead of a margin', () => {
    expect(nitaqatAlertReasons({ ...base, band: 'RED', alert: true, marginToDrop: 0, undocumentedSaudis: 1 })).toEqual([
      { ar: 'سعودي واحد عقده غير موثق في قوى — لا يُحتسب في نسبتك الرسمية', en: '1 Saudi without a Qiwa-documented contract — not counted in your official rate' },
      { ar: 'نسبتك الرسمية في النطاق الأحمر', en: 'Your official rate is in the red band' },
    ]);
  });

  it('an empty branch never alerts', () => {
    expect(nitaqatAlertReasons({ total: 0, undocumentedSaudis: 0, marginToDrop: 0, band: 'RED', alert: false })).toEqual([]);
  });

  it('labels the official rate as an estimate', () => {
    expect(OFFICIAL_ESTIMATE.ar).toBe('تقديري — النطاق الرسمي يحدده قوى');
  });
});

describe('Arabic counts', () => {
  it('Saudi noun: 1 → واحد, 2 → dual, 3–10 → plural, 11+ → singular accusative', () => {
    expect(arCount(1, SAUDI)).toBe('سعودي واحد');
    expect(arCount(2, SAUDI)).toBe('سعوديان');
    expect(arCount(3, SAUDI)).toBe('3 سعوديين');
    expect(arCount(10, SAUDI)).toBe('10 سعوديين');
    expect(arCount(11, SAUDI)).toBe('11 سعودياً');
    expect(arCount(100, SAUDI)).toBe('100 سعودياً');
    expect(arCount(0, SAUDI)).toBe('0 سعوديين');
  });
  it('documented Saudi agrees with its adjective', () => {
    expect(arCount(1, DOCUMENTED_SAUDI)).toBe('سعودي موثق واحد');
    expect(arCount(2, DOCUMENTED_SAUDI)).toBe('سعوديان موثقان');
    expect(arCount(5, DOCUMENTED_SAUDI)).toBe('5 سعوديين موثقين');
    expect(arCount(12, DOCUMENTED_SAUDI)).toBe('12 سعودياً موثقاً');
  });
  it('undocumented list title', () => {
    expect(undocumentedTitle(1).ar).toBe('سعودي واحد عقده غير موثق في قوى');
    expect(undocumentedTitle(2).ar).toBe('سعوديان عقداهما غير موثقين في قوى');
    expect(undocumentedTitle(3).ar).toBe('3 سعوديين غير موثقة عقودهم في قوى');
    expect(undocumentedTitle(11).ar).toBe('11 سعودياً غير موثقة عقودهم في قوى');
    expect(undocumentedTitle(1).en).toBe('1 Saudi without a Qiwa-documented contract');
  });
  it('margin note', () => {
    expect(marginNote(0).ar).toBe('أي مغادرة لسعودي موثق تُنزل نطاقك');
    expect(marginNote(1).ar).toBe('يمكن أن يغادر سعودي موثق واحد دون أن ينزل نطاقك');
    expect(marginNote(2).ar).toBe('يمكن أن يغادر سعوديان موثقان دون أن ينزل نطاقك');
    expect(marginNote(4).ar).toBe('يمكن أن يغادر 4 سعوديين موثقين دون أن ينزل نطاقك');
    expect(marginNote(4).en).toBe('Up to 4 documented Saudis can leave before your band drops');
  });
});
