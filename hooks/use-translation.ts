"use client";

// Thin convenience wrapper around useLanguage so components only need one
// import for the common case (t() + current locale). Use useLanguage
// directly when a component also needs setLocale (e.g. the language
// switcher itself).
import { useLanguage } from "@/components/i18n/language-provider";

export function useTranslation() {
  const { t, locale } = useLanguage();
  return { t, locale };
}
