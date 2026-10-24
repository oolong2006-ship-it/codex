import { describe, expect, it } from 'vitest';
import { BRAND, CHART, contrastRatio, relativeLuminance } from './brand';

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBe(21);
    expect(contrastRatio('#ffffff', '#FFFFFF')).toBe(1);
  });
  it('is symmetric and matches a hand-checked pair', () => {
    // #767676 on white is the classic 4.54:1 AA threshold grey
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#FFFFFF', '#767676')).toBeCloseTo(4.54, 2);
  });
});

describe('brand palette is readable where the UI uses it', () => {
  const AA = 4.5;
  const pairs: [string, string, string][] = [
    ['button text on primary', BRAND.white, BRAND.oasis600],
    ['text on saffron action', BRAND.night, BRAND.saffron],
    ['body text on mist', BRAND.night, BRAND.mist],
    ['secondary text on mist', BRAND.slate, BRAND.mist],
    ['secondary text on white', BRAND.slate, BRAND.white],
    ['caption text on white', BRAND.soft, BRAND.white],
    ['caption text on mist', BRAND.soft, BRAND.mist],
    ['link text on mist', BRAND.oasis600, BRAND.mist],
    ['text on night surfaces', BRAND.white, BRAND.night],
    ['danger text on white', BRAND.danger, BRAND.white],
    ['warning text on white', BRAND.warning, BRAND.white],
    ['success text on white', BRAND.success, BRAND.white],
  ];
  it.each(pairs)('%s meets AA', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
  });
});

describe('chart series', () => {
  it('neighbouring series differ in lightness, not hue alone', () => {
    for (let i = 1; i < CHART.length; i++) {
      expect(Math.abs(relativeLuminance(CHART[i]) - relativeLuminance(CHART[i - 1]))).toBeGreaterThanOrEqual(0.08);
    }
  });
});
