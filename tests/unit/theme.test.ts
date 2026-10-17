import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  THEME_CHOICES,
  browserChrome,
  isThemeChoice,
  metaThemeColors,
  parseThemeChoice,
  resolveTheme,
  themeClassFor,
} from "@/lib/theme";

describe("theme choice parsing", () => {
  test("accepts the three known choices", () => {
    for (const choice of THEME_CHOICES) assert.equal(isThemeChoice(choice), true);
  });

  test("rejects junk and falls back to system", () => {
    assert.equal(isThemeChoice("sepia"), false);
    assert.equal(isThemeChoice(null), false);
    assert.equal(parseThemeChoice(undefined), "system");
    assert.equal(parseThemeChoice("neon"), "system");
    assert.equal(parseThemeChoice("dark"), "dark");
  });
});

describe("theme resolution", () => {
  test("explicit choices ignore the OS preference", () => {
    assert.equal(resolveTheme("light", true), "light");
    assert.equal(resolveTheme("dark", false), "dark");
  });

  test("system follows the OS preference", () => {
    assert.equal(resolveTheme("system", true), "dark");
    assert.equal(resolveTheme("system", false), "light");
  });
});

describe("server-rendered class", () => {
  test("only dark yields a class, and it is exactly `.dark`", () => {
    assert.equal(themeClassFor("dark"), "dark");
    assert.equal(themeClassFor("light"), "");
    assert.equal(themeClassFor("system"), "");
  });
});

describe("browser chrome colours", () => {
  test("each resolved theme has a colour", () => {
    assert.match(browserChrome("light"), /^#[0-9a-f]{6}$/);
    assert.match(browserChrome("dark"), /^#[0-9a-f]{6}$/);
    assert.notEqual(browserChrome("light"), browserChrome("dark"));
  });

  test("both media preferences are advertised to the browser", () => {
    const colors = metaThemeColors();
    assert.equal(colors.length, 2);
    assert.deepEqual(
      colors.map((c) => c.media),
      ["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"],
    );
  });
});
