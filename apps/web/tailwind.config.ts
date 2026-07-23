import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // MASAR 34 — technical, Saudi, futuristic palette
        masar: {
          50: '#eef7f2',
          100: '#d3ebe0',
          300: '#7ec9a8',
          500: '#0f7a52', // primary green
          600: '#0b6444',
          700: '#084d34',
          900: '#03271b',
        },
        risk: {
          safe: '#16a34a',
          watch: '#eab308',
          busy: '#f97316',
          danger: '#dc2626',
          critical: '#7c3aed',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
