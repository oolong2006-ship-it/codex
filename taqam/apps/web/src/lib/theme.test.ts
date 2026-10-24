import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config';
import { BRAND, contrastRatio } from './brand';

type Shades = Record<string, string>;
const colors = (config.theme?.extend?.colors ?? {}) as Record<string, Shades | string>;

describe('tailwind text tokens stay readable', () => {
  // text-primary-500 is used for small links and captions across the app (51 uses)
  it('text-primary-500 meets AA on white and mist', () => {
    const c = (colors.primary as Shades)['500'];
    expect(contrastRatio(c, BRAND.white)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c, BRAND.mist)).toBeGreaterThanOrEqual(4.5);
  });
});
