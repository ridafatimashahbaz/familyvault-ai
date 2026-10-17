"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { LOCALE_COOKIE, format } from "@/lib/i18n";
import { getDictionary, type Dictionary, type Direction, type Locale } from "@/lib/i18n/dictionary";

/**
 * Holds the language for client components and switches it instantly: the
 * cookie is written, <html lang dir> is updated in place, and the server tree
 * is refreshed so server-rendered copy follows.
 */

type LocaleContextValue = {
  locale: Locale;
  dir: Direction;
  t: Dictionary;
  translate: (template: string, values?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      // Keep the document in sync immediately, then let the server re-render.
      document.documentElement.lang = next;
      document.documentElement.dir = next === "ur" ? "rtl" : "ltr";
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    },
    [router],
  );

  const value = useMemo<LocaleContextValue>(() => {
    const t = getDictionary(locale);
    return {
      locale,
      dir: t.meta.dir,
      t,
      translate: format,
      setLocale,
    };
  }, [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside <LocaleProvider>.");
  return context;
}
