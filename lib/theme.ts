export const THEMES = ["modern", "classic", "classic-dark"] as const;

export type DisplayTheme = (typeof THEMES)[number];

export const DEFAULT_THEME: DisplayTheme = "modern";

export const THEME_COOKIE_NAME = "tailorsaas-theme";

export function isDisplayTheme(value: unknown): value is DisplayTheme {
  return value === "modern" || value === "classic" || value === "classic-dark";
}
