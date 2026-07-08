"use client";

// Simple frontend-only i18n system — no backend/database, just a React
// context holding the selected locale plus the flat translations dictionary
// from lib/i18n/translations.ts. Mirrors current-user-provider.tsx's
// localStorage-persistence pattern: the stored locale is only read after
// mount so the first client render always matches the server render (always
// DEFAULT_LOCALE) and React never hydrates with mismatched text.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { translations, type TranslationKey } from "@/lib/i18n/translations";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  LOCALES,
  type Locale,
} from "@/lib/i18n/types";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && LOCALES.includes(stored as Locale)) {
        setLocaleState(stored as Locale);
      }
    } catch {
      // localStorage unavailable (e.g. private browsing) — stay on default.
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Selection just won't survive a refresh — not worth failing over.
    }
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const dict = translations[locale];
    const fallbackDict = translations[DEFAULT_LOCALE];
    return {
      locale,
      setLocale,
      // Missing Tamil entries fall back to English rather than showing a
      // raw key or blank text.
      t: (key) => dict[key] ?? fallbackDict[key] ?? key,
    };
  }, [locale, setLocale]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
