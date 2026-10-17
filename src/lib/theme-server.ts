import { cookies } from "next/headers";

import { parseThemeChoice, themeClassFor, type ThemeChoice } from "./theme";

/**
 * Reads the persisted theme choice on the server, so the very first HTML byte
 * already carries the correct class on <html>. No flash, no hydration patch for
 * the common case.
 */
export async function getThemeChoice(): Promise<ThemeChoice> {
  const store = await cookies();
  return parseThemeChoice(store.get("fv-theme")?.value);
}

export async function getThemeClass(): Promise<string> {
  return themeClassFor(await getThemeChoice());
}
