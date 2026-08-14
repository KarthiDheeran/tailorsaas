import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: token("--app-bg"),
        surface: token("--surface"),
        "surface-muted": token("--surface-muted"),
        primary: {
          DEFAULT: token("--primary"),
          dark: token("--primary-hover"),
          hover: token("--primary-hover"),
          active: token("--primary-active"),
          tint: token("--primary-soft"),
          soft: token("--primary-soft"),
          border: token("--primary-border"),
        },
        secondary: {
          DEFAULT: token("--secondary"),
          hover: token("--secondary-hover"),
          soft: token("--secondary-soft"),
          border: token("--secondary-border"),
        },
        success: {
          DEFAULT: token("--success"),
          soft: token("--success-soft"),
          border: token("--success-border"),
        },
        warning: {
          DEFAULT: token("--warning"),
          soft: token("--warning-soft"),
          border: token("--warning-border"),
        },
        danger: {
          DEFAULT: token("--danger"),
          soft: token("--danger-soft"),
          border: token("--danger-border"),
        },
        info: {
          DEFAULT: token("--info"),
          soft: token("--info-soft"),
        },
        "input-fill": token("--surface"),
        "disabled-background": token("--disabled-background"),
        border: {
          DEFAULT: token("--border"),
          soft: token("--border"),
          strong: token("--border-strong"),
        },
        ink: {
          DEFAULT: token("--text-primary"),
          muted: token("--text-secondary"),
          faint: token("--text-muted"),
        },
        "text-primary": token("--text-primary"),
        "text-secondary": token("--text-secondary"),
        "text-muted": token("--text-muted"),
        "chip-peach": token("--warning-soft"),
        "chip-peach-fg": token("--warning"),
        "chip-mint": token("--success-soft"),
        "chip-mint-fg": token("--success"),
        "chip-red": token("--danger-soft"),
        "chip-red-fg": token("--danger"),
        "chip-info": token("--surface-muted"),
        "chip-info-fg": token("--text-secondary"),
        "chip-blue": token("--info-soft"),
        "chip-blue-fg": token("--info"),
        "chip-purple": token("--info-soft"),
        "chip-purple-fg": token("--info"),
      },
      boxShadow: {
        soft: "0 1px 2px rgba(17, 24, 39, 0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
