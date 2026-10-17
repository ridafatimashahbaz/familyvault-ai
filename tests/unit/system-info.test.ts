import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { CATEGORY_KEYS, DOC_TYPES, RELATIONS } from "@/lib/constants";
import { publicSystemInfo } from "@/lib/system-info";

/**
 * The public system payload is the only instance configuration the interface
 * is allowed to read. These tests pin two things: the safe shape is present,
 * and no operational detail (encryption/OCR/AI internals, storage paths,
 * secret checks) can ever leak through it again.
 */
describe("publicSystemInfo", () => {
  const info = publicSystemInfo();
  const serialized = JSON.stringify(info).toLowerCase();

  test("exposes the app name and user-facing limits", () => {
    assert.equal(typeof info.appName, "string");
    assert.ok(info.appName.length > 0);
    assert.ok(Number.isFinite(info.limits.maxUploadMb));
    assert.ok(info.limits.maxUploadMb > 0);
    assert.ok(Number.isFinite(info.limits.expiryWarningDays));
    assert.ok(info.limits.expiryWarningDays > 0);
  });

  test("returns the full document taxonomy", () => {
    assert.equal(info.docTypes.length, DOC_TYPES.length);
    assert.equal(info.categories.length, CATEGORY_KEYS.length);
    assert.equal(info.relations.length, RELATIONS.length);

    for (const category of info.categories) {
      assert.ok(category.key && category.label && category.blurb);
    }
    for (const relation of info.relations) {
      assert.ok(relation.key && relation.label);
    }
  });

  test("carries no operational or security internals", () => {
    const forbidden = [
      "encryption",
      "encrypted",
      "plaintext",
      "aes",
      "scrypt",
      "cipher",
      "ocr",
      "tesseract",
      "storage",
      "dev.db",
      "database_url",
      "auth_secret",
      "configurationissues",
      "acceptedmimetypes",
      "maxuploadbytes",
      "apikey",
      "api_key",
      "openai",
      "anthropic",
      "gemini",
      "provider",
    ];

    for (const term of forbidden) {
      assert.ok(
        !serialized.includes(term),
        `public system info must not contain "${term}"`,
      );
    }

    assert.deepEqual(Object.keys(info).sort(), [
      "appName",
      "categories",
      "docTypes",
      "limits",
      "relations",
    ]);
    assert.deepEqual(Object.keys(info.limits).sort(), [
      "expiryWarningDays",
      "maxUploadMb",
    ]);
  });
});
