// Shuoon visual identity (SHUOON Brand Kit v1.0) — single source of truth.
// Navy #172C46 is the base; teal #16B8A6 / #19C7B4 is for the logo, highlights and fills.
// UI text and buttons use oasis600 (deep teal) so they meet WCAG AA on white and on the neutral background.
// Token names are kept from v1 so components don't change: oasis = teal, night = navy, saffron = bright teal accent.
export const BRAND = {
  oasis: '#16B8A6',
  oasis600: '#0E776D',
  oasis700: '#0B5F57',
  oasis100: '#CDEFEA',
  oasis50: '#E8F7F4',
  night: '#172C46',
  night800: '#213A5A',
  saffron: '#19C7B4',
  saffron600: '#0B6A62',
  saffron100: '#CDEFEA',
  saffron50: '#E8F7F4',
  dune: '#E9EEF5',
  mist: '#F6F8FB',
  mist200: '#EDF1F6',
  slate: '#4A5B70',
  soft: '#5B6B80',
  line: '#DDE3EC',
  white: '#FFFFFF',
  success: '#1B7F53',
  success50: '#E5F4EC',
  warning: '#94590C',
  warning50: '#FDF3DC',
  danger: '#C2412D',
  danger50: '#FBEAE6',
  info: '#2F6F9F',
  info50: '#E6F0F8',
} as const;

/** Chart series in order; neighbours differ in lightness so they never rely on hue alone. */
export const CHART: readonly string[] = [BRAND.oasis600, BRAND.saffron, BRAND.night, '#A9DFD7'];

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
