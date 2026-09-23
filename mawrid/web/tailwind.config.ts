import type { Config } from "tailwindcss";

// الألوان من متغيرات CSS في globals.css — نفس هوية النموذج الأولي، مع وضع داكن تلقائي
const v = (name: string) => `var(--${name})`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), surface: v("surface"), ink: v("ink"), muted: v("muted"), line: v("line"),
        brand: v("brand"), "brand-ink": v("brand-ink"),
        accent: v("accent"), "accent-soft": v("accent-soft"),
        ok: v("ok"), "ok-soft": v("ok-soft"), warn: v("warn"), "warn-soft": v("warn-soft"),
        danger: v("danger"),
      },
      fontFamily: {
        sans: ["var(--font-plex)", "Tahoma", "Segoe UI", "sans-serif"],
        display: ["var(--font-kufi)", "var(--font-plex)", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
