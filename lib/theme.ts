export const THEMES = ["modern", "classic", "classic-dark"] as const;

export type DisplayTheme = (typeof THEMES)[number];

export const DEFAULT_THEME: DisplayTheme = "modern";

export const THEME_COOKIE_NAME = "tailorsaas-theme";

export const TEXT_SIZES = ["default", "17", "18", "19", "20"] as const;

export type AppTextSize = (typeof TEXT_SIZES)[number];

export const DEFAULT_TEXT_SIZE: AppTextSize = "default";

export const TEXT_SIZE_COOKIE_NAME = "tailorsaas-text-size";

export function isDisplayTheme(value: unknown): value is DisplayTheme {
  return value === "modern" || value === "classic" || value === "classic-dark";
}

export function isAppTextSize(value: unknown): value is AppTextSize {
  return value === "default" || value === "17" || value === "18" || value === "19" || value === "20";
}
