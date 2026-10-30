import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#eef4fb", 100: "#d6e4f4", 500: "#2f6db3", 600: "#1f5a9c", 700: "#1f3a5f", 900: "#132538" },
        accent: { 500: "#0f9d8a", 600: "#0b8273" },
      },
      fontFamily: { sans: ['"IBM Plex Sans Arabic"', "Tahoma", "Segoe UI", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
