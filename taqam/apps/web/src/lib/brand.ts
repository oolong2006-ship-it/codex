// Taqam visual identity — single source of truth (see taqam/brand/brand-book.html).
// Raw Oasis (#0E8C7A) is for the logo, large type and fills; UI text and buttons use oasis600.
export const BRAND = {
  oasis: '#0E8C7A',
  oasis600: '#0B7A6B',
  oasis700: '#0A6457',
  oasis100: '#D6EFEA',
  oasis50: '#ECF7F4',
  night: '#0C1F24',
  night800: '#16313A',
  saffron: '#FFB547',
  saffron600: '#E89A22',
  saffron100: '#FFEBC9',
  saffron50: '#FFF6E6',
  dune: '#E9E1D2',
  mist: '#F4F7F5',
  mist200: '#E8EEEB',
  slate: '#50645F',
  soft: '#5E6E69',
  line: '#DCE4E0',
  white: '#FFFFFF',
  success: '#1B7F53',
  success50: '#E5F4EC',
  warning: '#A1640F',
  warning50: '#FDF3DC',
  danger: '#C2412D',
  danger50: '#FBEAE6',
  info: '#2F6F9F',
  info50: '#E6F0F8',
} as const;

/** Chart series in order; neighbours differ in lightness so they never rely on hue alone. */
export const CHART: readonly string[] = [BRAND.oasis600, BRAND.saffron, BRAND.night, '#8FD3C4'];

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
