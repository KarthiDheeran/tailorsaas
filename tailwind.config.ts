import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1F6B57",
          dark: "#185344",
          tint: "#E5F0EC",
        },
        surface: "#F7F8F5",
        "input-fill": "#F8FAFC",
        border: {
          DEFAULT: "#D1D5DB",
          soft: "#E5E7EB",
        },
        ink: {
          DEFAULT: "#111827",
          muted: "#4B5563",
          faint: "#6B7280",
        },
        "chip-peach": "#FFEDD5",
        "chip-peach-fg": "#9A3412",
        "chip-mint": "#DCFCE7",
        "chip-mint-fg": "#166534",
        "chip-red": "#FEE2E2",
        "chip-red-fg": "#B91C1C",
        "chip-info": "#E2E8F0",
        "chip-info-fg": "#334155",
        "chip-blue": "#DBEAFE",
        "chip-blue-fg": "#1D4ED8",
        "chip-purple": "#EDE9FE",
        "chip-purple-fg": "#6D28D9",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(17, 24, 39, 0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
