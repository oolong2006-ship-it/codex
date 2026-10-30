import type { Config } from 'tailwindcss';

/**
 * Tokens are defined as CSS custom properties in globals.css (three themes).
 * Tailwind colors reference those vars so utilities stay theme-aware.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-elevated': 'var(--bg-elevated)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        text: 'var(--text)',
        'text-dim': 'var(--text-dim)',
        'text-faint': 'var(--text-faint)',
        accent: 'var(--accent)',
        'accent-2': 'var(--accent-2)',
        'accent-contrast': 'var(--accent-contrast)',
        'accent-soft': 'var(--accent-soft)',
        safe: 'var(--safe)',
        watch: 'var(--watch)',
        busy: 'var(--busy)',
        danger: 'var(--danger)',
        critical: 'var(--critical)',
        info: 'var(--info)',
      },
      borderColor: { DEFAULT: 'var(--border)' },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-sm)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
      },
      fontSize: {
        xs: 'var(--fs-xs)',
        sm: 'var(--fs-sm)',
        base: 'var(--fs-base)',
        md: 'var(--fs-md)',
        lg: 'var(--fs-lg)',
        xl: 'var(--fs-xl)',
        '2xl': 'var(--fs-2xl)',
        '3xl': 'var(--fs-3xl)',
      },
      fontFamily: { sans: 'var(--font-sans)' },
    },
  },
  plugins: [],
};

export default config;
