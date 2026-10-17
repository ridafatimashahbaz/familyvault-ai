import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { DICTIONARIES, getDictionary, parseLocale } from "@/lib/i18n/dictionary";
import { format } from "@/lib/i18n";

type UnknownRecord = Record<string, unknown>;

/** Every leaf path in a dictionary, so a missing Urdu key fails loudly. */
function leafPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => leafPaths(entry, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as UnknownRecord).flatMap(([key, child]) =>
      leafPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

/** The `{token}` and `{count, plural, ...}` placeholders inside a string. */
function placeholders(text: string): string[] {
  // Collapse plural blocks to their key first, so the words inside the
  // one/other branches are not mistaken for placeholders.
  const flat = text.replace(
    /\{(\w+),\s*plural,\s*one\s*\{[^{}]*\}\s*other\s*\{[^{}]*\}\}/g,
    "{$1}",
  );
  const names = new Set<string>();
  for (const match of flat.matchAll(/\{(\w+)\}/g)) names.add(match[1]);
  return [...names].sort();
}

function strings(value: unknown, prefix = ""): [string, string][] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => strings(entry, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as UnknownRecord).flatMap(([key, child]) =>
      strings(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return typeof value === "string" ? [[prefix, value]] : [];
}

describe("dictionary", () => {
  test("English and Urdu expose exactly the same keys", () => {
    const en = leafPaths(DICTIONARIES.en).sort();
    const ur = leafPaths(DICTIONARIES.ur).sort();
    assert.deepEqual(ur, en);
  });

  test("no Urdu string is left as untranslated English", () => {
    const en = new Map(strings(DICTIONARIES.en));
    const ur = strings(DICTIONARIES.ur);
    // Values that are literals rather than prose, so they are the same by design.
    const literal = new Set(["meta.label", "auth.emailPlaceholder"]);

    for (const [path, value] of ur) {
      assert.ok(value.trim().length > 0, `${path} is empty`);
      if (literal.has(path)) continue;
      assert.notEqual(value, en.get(path), `${path} still holds the English copy`);
    }
  });

  test("placeholders match between languages", () => {
    const en = new Map(strings(DICTIONARIES.en));

    for (const [path, value] of strings(DICTIONARIES.ur)) {
      assert.deepEqual(
        placeholders(value),
        placeholders(en.get(path) ?? ""),
        `${path} placeholder set differs`,
      );
    }
  });

  test("direction and html language follow the locale", () => {
    assert.equal(getDictionary("en").meta.dir, "ltr");
    assert.equal(getDictionary("ur").meta.dir, "rtl");
    assert.equal(getDictionary("ur").meta.htmlLang, "ur");
  });

  test("parseLocale falls back to English", () => {
    assert.equal(parseLocale("ur"), "ur");
    assert.equal(parseLocale("en"), "en");
    assert.equal(parseLocale("fr"), "en");
    assert.equal(parseLocale(null), "en");
  });
});

describe("format", () => {
  test("substitutes a named value", () => {
    assert.equal(format("Welcome back, {name}", { name: "Ayesha" }), "Welcome back, Ayesha");
  });

  test("resolves the one/other plural forms", () => {
    const template = "{count} {count, plural, one {document} other {documents}}";
    assert.equal(format(template, { count: 1 }), "1 document");
    assert.equal(format(template, { count: 4 }), "4 documents");
  });

  test("drops a placeholder with no value instead of leaving braces", () => {
    assert.equal(format("Hi {name}!", {}), "Hi !");
  });
});
