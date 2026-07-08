export type Locale = "en" | "ta";

export const LOCALES: Locale[] = ["en", "ta"];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ta: "தமிழ்",
};

// localStorage key the selected language is persisted under (read only
// post-mount, same hydration-safety convention as current-user-provider's
// mock-user persistence).
export const LOCALE_STORAGE_KEY = "tailorsaas.locale";
