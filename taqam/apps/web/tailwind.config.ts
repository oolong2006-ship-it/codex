import type { Config } from 'tailwindcss';
import { BRAND } from './src/lib/brand';

// Taqam design tokens — mapped from src/lib/brand.ts (see taqam/brand/brand-book.html).
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: BRAND.oasis600, 600: BRAND.oasis700, 500: BRAND.oasis600, 100: BRAND.oasis100, 50: BRAND.oasis50 },
        night: { DEFAULT: BRAND.night, 800: BRAND.night800 },
        accent: { DEFAULT: BRAND.saffron, 600: BRAND.saffron600, 100: BRAND.saffron100, 50: BRAND.saffron50 },
        sand: { DEFAULT: BRAND.mist, 200: BRAND.mist200, 300: BRAND.dune },
        dune: BRAND.dune,
        ink: { DEFAULT: BRAND.night, muted: BRAND.slate, soft: BRAND.soft },
        success: { DEFAULT: BRAND.success, 50: BRAND.success50 },
        warning: { DEFAULT: BRAND.warning, 50: BRAND.warning50 },
        danger: { DEFAULT: BRAND.danger, 50: BRAND.danger50 },
        info: { DEFAULT: BRAND.info, 50: BRAND.info50 },
        line: BRAND.line,
      },
      fontFamily: {
        sans: ['var(--font-plex)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-plex)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl: '14px', '2xl': '20px', '3xl': '28px' },
      boxShadow: {
        soft: '0 1px 2px rgba(12,31,36,0.04), 0 6px 20px rgba(12,31,36,0.06)',
        lift: '0 12px 36px rgba(12,31,36,0.14)',
      },
    },
  },
  plugins: [],
};
export default config;
