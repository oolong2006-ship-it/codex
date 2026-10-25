// Shuoon visual identity (logo v2: three connected people) — single source of truth.
// Navy #0F2747 is the base, teal #14D1C3 the accent, sky blue #0284C7 the secondary (logo gradient).
// UI text and buttons use oasis600 (deep cyan) so they meet WCAG AA on white and on the neutral background.
// Token names are kept from v1 so components don't change: oasis = teal/cyan, night = navy, saffron = bright teal accent.
export const BRAND = {
  oasis: '#14D1C3',
  oasis600: '#0E7490',
  oasis700: '#155E75',
  oasis100: '#CCF5F1',
  oasis50: '#E6FAF8',
  sky: '#0284C7',
  night: '#0F2747',
  night800: '#1B3A63',
  saffron: '#14D1C3',
  saffron600: '#0F766E',
  saffron100: '#CCF5F1',
  saffron50: '#E6FAF8',
  dune: '#E9EEF5',
  mist: '#F6F8FB',
  mist200: '#EDF1F6',
  slate: '#475569',
  soft: '#5B6B80',
  neutral: '#94A3B8',
  line: '#DDE3EC',
  white: '#FFFFFF',
  success: '#1B7F53',
  success50: '#E5F4EC',
  warning: '#94590C',
  warning50: '#FDF3DC',
  danger: '#C2412D',
  danger50: '#FBEAE6',
  info: '#0369A1',
  info50: '#E0F2FE',
} as const;

/** Chart series in order; neighbours differ in lightness so they never rely on hue alone. */
export const CHART: readonly string[] = [BRAND.oasis600, BRAND.saffron, BRAND.night, '#7DD3FC'];

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, rounded to 2 decimals. */
export function contrastRatio(fg: string, bg: string): number {
  const [hi, lo] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
