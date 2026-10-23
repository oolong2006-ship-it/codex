import type { Config } from 'tailwindcss';

// Taqam design tokens — see docs/PRODUCT.md (الهوية البصرية)
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#0F3D3E', 600: '#145A5C', 500: '#1F7A7C', 100: '#DCEBEA', 50: '#EEF6F5' },
        accent: { DEFAULT: '#F2A541', 600: '#D98B23', 100: '#FDEBD0', 50: '#FEF6EA' },
        sand: { DEFAULT: '#FAF6EF', 200: '#F1E9DB', 300: '#E6DAC5' },
        ink: { DEFAULT: '#1B2421', muted: '#5C6B66', soft: '#8A9893' },
        success: { DEFAULT: '#2E8B57', 50: '#E8F5EE' },
        warning: { DEFAULT: '#E0A800', 50: '#FDF6DD' },
        danger: { DEFAULT: '#C8553D', 50: '#FBECE8' },
        info: { DEFAULT: '#3B7EA1', 50: '#E7F1F7' },
        line: '#E7E1D6',
      },
      fontFamily: { sans: ['var(--font-plex)', 'system-ui', 'sans-serif'] },
      borderRadius: { xl: '14px', '2xl': '20px' },
      boxShadow: {
        soft: '0 1px 2px rgba(15,61,62,0.04), 0 4px 16px rgba(15,61,62,0.06)',
        lift: '0 8px 30px rgba(15,61,62,0.12)',
      },
    },
  },
  plugins: [],
};
export default config;
