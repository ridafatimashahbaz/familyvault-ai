import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { encryptBytes, utf8 } from "@vault/crypto";
import { createVault, encryptMetadata, generateDek, wrapDek } from "@vault/keys";
import { isVaultCryptoError } from "@vault/errors";

import {
  parseDocumentRecord,
  parseMaterialEnvelope,
  parseVaultInventory,
  parseVaultMaterial,
} from "@/lib/vault/contract";

/**
 * Contract tests (Day 2 Stage A).
 *
 * These prove what the browser refuses to accept back from the server. The
 * threat model is a compromised or simply misbehaving storage layer: a payload
 * that adds a cleartext field, swaps a blob's purpose, weakens the KDF or uses a
 * non-opaque id must be rejected *before* it reaches Web Crypto.
 */

const C = globalThis.crypto as Crypto;
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const blobOf = (purpose: string, ctLength: number) => ({
  v: 1,
  alg: "AES-256-GCM",
  purpose,
  iv: b64(new Uint8Array(12).fill(7)),
  ct: b64(new Uint8Array(ctLength).fill(3)),
});

function materialOf(overrides: Record<string, unknown> = {}) {
  return {
    kdf: { name: "PBKDF2-SHA256", hash: "SHA-256", iterations: 600_000, salt: b64(new Uint8Array(16).fill(1)) },
    createdAt: "2026-10-14T09:00:00.000Z",
    wrappedByPassphrase: blobOf("vk:passphrase", 48),
    wrappedByRecoveryKey: blobOf("vk:recovery", 48),
    ...overrides,
  };
}

async function recordOf(): Promise<{ record: Record<string, unknown>; vk: CryptoKey }> {
  const { vk } = await createVault("contract test passphrase", C);
  const dek = await generateDek(C);
  const now = new Date().toISOString();
  return {
    vk,
    record: {
      id: "abcdefghij0123456789",
      createdAt: now,
      updatedAt: now,
      content: await encryptBytes(dek, utf8("body"), { purpose: "content" }, C),
      wrappedDek: await wrapDek(vk, dek, C),
      metadata: await encryptMetadata(vk, { name: "a.pdf" }, C),
    },
  };
}

function assertRejected(promise: Promise<unknown> | (() => unknown), match?: string): void {
  const run = typeof promise === "function" ? promise : () => promise;
  assert.throws(
    () => {
      const value = run();
      if (value instanceof Promise) throw new Error("expected a synchronous rejection path");
    },
    (error: unknown) => {
      assert.ok(isVaultCryptoError(error), `expected VaultCryptoError, got ${String(error)}`);
      if (match) assert.ok(error.message.includes(match), `expected "${match}" in "${error.message}"`);
      return true;
    },
  );
}

describe("vault material contract", () => {
  test("real material produced by createVault passes", async () => {
    const { material } = await createVault("a fine passphrase", C);
    assert.deepEqual(parseVaultMaterial(material), material);
  });

  test("an extra cleartext field is refused", () => {
    assertRejected(
      () => parseVaultMaterial(materialOf({ email: "nani@example.test" })),
      "exactly these fields",
    );
  });

  test("a missing field is refused", () => {
    const partial: Record<string, unknown> = materialOf();
    delete partial.wrappedByRecoveryKey;
    assertRejected(() => parseVaultMaterial(partial));
  });

  test("a recovery blob in the passphrase slot is refused", () => {
    assertRejected(
      () => parseVaultMaterial(materialOf({ wrappedByPassphrase: blobOf("vk:recovery", 48) })),
      'expected a "vk:passphrase" blob',
    );
  });

  test("a wrapped key larger than the policy is refused", () => {
    assertRejected(
      () => parseVaultMaterial(materialOf({ wrappedByPassphrase: blobOf("vk:passphrase", 4096) })),
      "at most",
    );
  });

  test("a weakened KDF is refused", () => {
    assertRejected(
      () =>
        parseVaultMaterial(
          materialOf({ kdf: { name: "PBKDF2-SHA256", hash: "SHA-256", iterations: 1000, salt: b64(new Uint8Array(16)) } }),
        ),
      "iterations",
    );
    assertRejected(
      () =>
        parseVaultMaterial(
          materialOf({ kdf: { name: "SHA-1", hash: "SHA-1", iterations: 600_000, salt: b64(new Uint8Array(16)) } }),
        ),
      "unsupported KDF",
    );
  });

  test("a short salt or a non-UTC timestamp is refused", () => {
    assertRejected(
      () =>
        parseVaultMaterial(
          materialOf({ kdf: { name: "PBKDF2-SHA256", hash: "SHA-256", iterations: 600_000, salt: b64(new Uint8Array(8)) } }),
        ),
      "salt",
    );
    assertRejected(() => parseVaultMaterial(materialOf({ createdAt: "14/10/2026" })), "ISO-8601");
  });

  test("an empty account is a null, not an error", () => {
    assert.equal(parseMaterialEnvelope(null), null);
    assert.equal(parseMaterialEnvelope(undefined), null);
  });
});

describe("private document record contract", () => {
  test("a genuine record passes untouched", async () => {
    const { record } = await recordOf();
    assert.deepEqual(parseDocumentRecord(record), record);
  });

  test("a plaintext title smuggled into the record is refused", async () => {
    const { record } = await recordOf();
    assertRejected(() => parseDocumentRecord({ ...record, title: "Nani passport" }), "exactly these fields");
  });

  test("a file-name id is refused", async () => {
    const { record } = await recordOf();
    assertRejected(() => parseDocumentRecord({ ...record, id: "nani-passport.pdf" }), "opaque");
    assertRejected(() => parseDocumentRecord({ ...record, id: "../../etc/passwd" }), "opaque");
    assertRejected(() => parseDocumentRecord({ ...record, id: "short" }), "opaque");
  });

  test("a content blob cannot be replayed as a key blob", async () => {
    const { record } = await recordOf();
    assertRejected(() => parseDocumentRecord({ ...record, wrappedDek: record.content }), 'expected a "dek" blob');
    assertRejected(() => parseDocumentRecord({ ...record, metadata: record.content }), 'expected a "meta" blob');
  });

  test("a oversized wrapped key is refused by the same policy the server uses", async () => {
    const { record } = await recordOf();
    assertRejected(
      () => parseDocumentRecord({ ...record, wrappedDek: blobOf("dek", 4096) }),
      "at most",
    );
  });

  test("variable-size content is not capped, but a bad iv still is", async () => {
    const { record } = await recordOf();
    const large = { ...record, content: blobOf("content", 100_000) };
    assert.equal((parseDocumentRecord(large).content.ct.length % 4), 0);

    const badIv = {
      ...record,
      content: {
        ...blobOf("content", 48),
        iv: b64(new Uint8Array(8).fill(7)),
      },
    };
    assertRejected(() => parseDocumentRecord(badIv), "expected 12 bytes");
  });
});

describe("inventory contract", () => {
  test("structural entries pass", () => {
    const items = parseVaultInventory([
      { id: "abcdefghij0123456789", sizeBytes: 1234, updatedAt: "2026-10-14T09:00:00.000Z" },
    ]);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.sizeBytes, 1234);
  });

  test("an entry naming the document is refused", () => {
    assertRejected(
      () => parseVaultInventory([{ id: "abcdefghij0123456789", sizeBytes: 1, updatedAt: "2026-10-14T09:00:00.000Z", name: "passport" }]),
      "exactly these fields",
    );
  });

  test("a non-opaque id, a negative size or a loose timestamp is refused", () => {
    assertRejected(() => parseVaultInventory([{ id: "passport.pdf", sizeBytes: 1, updatedAt: "2026-10-14T09:00:00.000Z" }]));
    assertRejected(() => parseVaultInventory([{ id: "abcdefghij0123456789", sizeBytes: -1, updatedAt: "2026-10-14T09:00:00.000Z" }]));
    assertRejected(() => parseVaultInventory([{ id: "abcdefghij0123456789", sizeBytes: 1, updatedAt: "last tuesday" }]));
    assertRejected(() => parseVaultInventory({ id: "abcdefghij0123456789" }), "must be an array");
  });
});
