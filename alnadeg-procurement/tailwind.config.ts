import type { Config } from "tailwindcss";

// الهوية البصرية: أخضر داكن، ذهبي هادئ، أبيض، رمادي فاتح
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6f1", 100: "#d4e8dc", 200: "#a9d1ba",
          300: "#7bb795", 400: "#4e9c71", 500: "#2f7f55",
          600: "#1f6543", 700: "#184e34", 800: "#123a27", 900: "#0c2619",
        },
        gold: {
          50: "#fbf7ec", 100: "#f4ead0", 200: "#e8d4a1",
          300: "#dabd6f", 400: "#c9a44a", 500: "#b08d3a",
          600: "#8d6f2d", 700: "#6a5322", 800: "#473717", 900: "#2b210e",
        },
      },
      fontFamily: {
        sans: ["var(--font-arabic)", "Tahoma", "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
