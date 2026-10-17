/**
 * Theme selection rules, kept pure so they can be unit-tested without a DOM.
 *
 * The user picks Light, Dark or System; a cookie carries the *choice* so the
 * server can render the right class on the very first paint, and localStorage
 * mirrors it so the inline bootstrap script can reconcile before hydration.
 */

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_COOKIE = "fv-theme";
export const THEME_STORAGE_KEY = "fv-theme";
export const THEME_CHOICES: ThemeChoice[] = ["light", "dark", "system"];

const UA_THEME: Record<ResolvedTheme, string> = {
  light: "#f7f8fa",
  dark: "#0f1116",
};

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/** Normalises anything (cookie value, localStorage, junk) to a valid choice. */
export function parseThemeChoice(value: string | null | undefined): ThemeChoice {
  return isThemeChoice(value) ? value : "system";
}

/** The class the server should place on <html> for a stored choice. */
export function themeClassFor(choice: ThemeChoice): string {
  return choice === "dark" ? "dark" : "";
}

/** Turns the stored choice plus the OS preference into a concrete theme. */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === "system") return systemPrefersDark ? "dark" : "light";
  return choice;
}

/** Browser chrome colour, so the address bar matches the page in both themes. */
export function browserChrome(theme: ResolvedTheme): string {
  return UA_THEME[theme];
}

/** The three meta theme-colors handed to Next, keyed by the OS preference. */
export function metaThemeColors(): { media: string; color: string }[] {
  return [
    { media: "(prefers-color-scheme: light)", color: UA_THEME.light },
    { media: "(prefers-color-scheme: dark)", color: UA_THEME.dark },
  ];
}
