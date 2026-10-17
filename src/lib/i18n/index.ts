import { getDictionary, parseLocale } from "./dictionary";
import type { Direction, Locale } from "./dictionary";

export * from "./dictionary";

export const LOCALE_COOKIE = "fv-locale";

/**
 * Tiny message formatter: `{name}` substitution plus the one ICU plural form
 * this app uses, `{count, plural, one {…} other {…}}`. Keeping it here means the
 * dictionary needs no dependency and the behaviour is unit-testable.
 */
export function format(template: string, values: Record<string, string | number> = {}): string {
  const withPlurals = template.replace(
    /\{(\w+),\s*plural,\s*one\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}\}/g,
    (_match, key: string, one: string, other: string) =>
      Number(values[key] ?? 0) === 1 ? one : other,
  );

  return withPlurals.replace(/\{(\w+)\}/g, (_match, key: string) =>
    values[key] === undefined ? "" : String(values[key]),
  );
}

export function directionFor(locale: Locale): Direction {
  return getDictionary(locale).meta.dir;
}

export function htmlLangFor(locale: Locale): string {
  return getDictionary(locale).meta.htmlLang;
}

export { parseLocale, getDictionary };
