import { cookies } from "next/headers";

import { getDictionary, parseLocale, type Dictionary, type Locale } from "./dictionary";

/**
 * Reads the persisted language on the server, so <html lang dir> is correct in
 * the first byte of HTML and server components can translate directly.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return parseLocale(store.get("fv-locale")?.value);
}

export async function getI18n(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
