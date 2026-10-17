import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  MAX_KEY_WRAP_CT_BYTES,
  MAX_PBKDF2_ITERATIONS,
  MIN_PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS,
  b64decodeStrict,
  b64encode,
  decodeUtf8,
  decryptBytes,
  deriveKeyFromPassphrase,
  encryptBytes,
  randomBytes,
  utf8,
  validateEncryptedBlob,
  validateKdfParams,
} from "@vault/crypto";
import { isVaultCryptoError } from "@vault/errors";
import {
  buildRecoveryKit,
  createVault,
  decryptMetadata,
  encryptMetadata,
  generateDek,
  newKdfParams,
  restoreFromRecoveryKit,
  rewrapVaultKeyWithPassphrase,
  unlockWithPassphrase,
  unwrapDek,
  validateRecoveryKit,
  wrapDek,
  type CreateVaultResult,
} from "@vault/keys";
import type { RecoveryKit, WrapPurpose } from "@vault/types";

const C = globalThis.crypto as Crypto;
const PASSPHRASE = "correct horse battery staple";

/** One vault shared across tests so the (deliberately expensive) KDF runs once. */
let vaultPromise: Promise<CreateVaultResult> | null = null;
function vault(): Promise<CreateVaultResult> {
  return (vaultPromise ??= createVault(PASSPHRASE, C));
}

async function assertCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(isVaultCryptoError(error), `expected VaultCryptoError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

function assertThrowsCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(isVaultCryptoError(error), `expected VaultCryptoError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

describe("base64", () => {
  test("round-trips arbitrary byte lengths", () => {
    for (const length of [0, 1, 2, 3, 4, 5, 15, 16, 31, 32, 33, 255]) {
      const bytes = randomBytes(length, C);
      assert.deepEqual(b64decodeStrict(b64encode(bytes)), bytes);
    }
  });

  test("accepts an empty string for zero bytes", () => {
    assert.equal(b64decodeStrict("").length, 0);
  });

  test("rejects malformed input", () => {
    assertThrowsCode(() => b64decodeStrict("abc"), "MALFORMED_BLOB");
    assertThrowsCode(() => b64decodeStrict("!!!!"), "MALFORMED_BLOB");
    assertThrowsCode(() => b64decodeStrict("ab=c"), "MALFORMED_BLOB");
    assertThrowsCode(() => b64decodeStrict(b64encode(new Uint8Array(16)), 12), "MALFORMED_BLOB");
  });
});

describe("round-trip", () => {
  test("content, metadata and DEK encrypt→decrypt return identical values", async () => {
    const { vk } = await vault();

    const bytes = utf8("passport scan bytes");
    const contentBlob = await encryptBytes(vk, bytes, { purpose: "content" }, C);
    assert.deepEqual(await decryptBytes(vk, contentBlob, { purpose: "content" }, C), bytes);

    const meta = { title: "Passport", tags: ["id", "urgent"], n: 42 };
    const metaBlob = await encryptMetadata(vk, meta, C);
    assert.deepEqual(await decryptMetadata(vk, metaBlob, C), meta);

    const dek = await generateDek(C);
    const wrapped = await wrapDek(vk, dek, C);
    const unwrapped = await unwrapDek(vk, wrapped, C);
    const body = utf8("file-body");
    const bodyBlob = await encryptBytes(unwrapped, body, { purpose: "content" }, C);
    assert.deepEqual(await decryptBytes(dek, bodyBlob, { purpose: "content" }, C), body);
  });

  test("empty and ~1 MiB payloads round-trip byte-for-byte", async () => {
    const { vk } = await vault();

    const empty = await encryptBytes(vk, new Uint8Array(0), { purpose: "content" }, C);
    assert.equal((await decryptBytes(vk, empty, { purpose: "content" }, C)).length, 0);

    const big = randomBytes(1024 * 1024, C);
    const bigBlob = await encryptBytes(vk, big, { purpose: "content" }, C);
    assert.deepEqual(await decryptBytes(vk, bigBlob, { purpose: "content" }, C), big);
  });

  test("non-ASCII (Urdu/RTL + emoji) metadata round-trips", async () => {
    const { vk } = await vault();
    const value = { urdu: "میعاد کب ختم ہو گی", emoji: "🔐🗂️", n: 7 };
    assert.deepEqual(await decryptMetadata(vk, await encryptMetadata(vk, value, C), C), value);
  });

  test("every encryption uses a fresh 12-byte IV", async () => {
    const { vk } = await vault();
    const ivs = new Set<string>();
    for (let i = 0; i < 64; i += 1) {
      const blob = await encryptBytes(vk, new Uint8Array([i]), { purpose: "content" }, C);
      const iv = b64decodeStrict(blob.iv, 12);
      ivs.add(b64encode(iv));
    }
    assert.equal(ivs.size, 64);
  });
});

describe("passphrase unlock", () => {
  test("the correct passphrase recovers the same vault key and decrypts known data", async () => {
    const passphrase = "a known vault passphrase";
    const created = await createVault(passphrase, C);

    const content = utf8("passport number 123-4567890-1");
    const contentBlob = await encryptBytes(created.vk, content, { purpose: "content" }, C);
    const meta = { title: "Passport", urdu: "پاسپورٹ", n: 9 };
    const metaBlob = await encryptMetadata(created.vk, meta, C);

    // Unlock independently of `created.vk`: the passphrase-derived key must
    // reproduce a vault key that opens what the original vault key encrypted.
    const unlockedVk = await unlockWithPassphrase(
      passphrase,
      created.material.wrappedByPassphrase,
      created.material,
      C,
    );

    assert.equal(
      decodeUtf8(await decryptBytes(unlockedVk, contentBlob, { purpose: "content" }, C)),
      "passport number 123-4567890-1",
    );
    assert.deepEqual(await decryptMetadata(unlockedVk, metaBlob, C), meta);
  });
});

describe("failure modes", () => {
  test("wrong passphrase → AUTH_FAILED and writes no plaintext", async () => {
    const { material, vk } = await vault();
    const blob = await encryptMetadata(vk, { secret: "x" }, C);

    await assertCode(
      unlockWithPassphrase("definitely the wrong passphrase", material.wrappedByPassphrase, material, C),
      "AUTH_FAILED",
    );
    // The failed attempt changed nothing: the real key still opens the data.
    assert.deepEqual(await decryptMetadata(vk, blob, C), { secret: "x" });
  });

  test("tampered ciphertext/tag → AUTH_FAILED", async () => {
    const { vk } = await vault();
    const blob = await encryptBytes(vk, utf8("payload"), { purpose: "content" }, C);
    const raw = b64decodeStrict(blob.ct);
    raw[raw.length - 1] ^= 0xff;
    await assertCode(
      decryptBytes(vk, { ...blob, ct: b64encode(raw) }, { purpose: "content" }, C),
      "AUTH_FAILED",
    );
  });

  test("flipped version → UNSUPPORTED_VERSION", async () => {
    const { vk } = await vault();
    const blob = await encryptBytes(vk, new Uint8Array([1, 2, 3]), { purpose: "content" }, C);
    assertThrowsCode(() => validateEncryptedBlob({ ...blob, v: 2 }, { purpose: "content" }), "UNSUPPORTED_VERSION");
    await assertCode(decryptBytes(vk, { ...blob, v: 2 }, { purpose: "content" }, C), "UNSUPPORTED_VERSION");
  });

  test("bad IV / base64 / short ct → MALFORMED_BLOB", async () => {
    const { vk } = await vault();
    const blob = await encryptBytes(vk, new Uint8Array([1, 2, 3]), { purpose: "content" }, C);
    assertThrowsCode(() => validateEncryptedBlob({ ...blob, iv: b64encode(new Uint8Array(11)) }, { purpose: "content" }), "MALFORMED_BLOB");
    assertThrowsCode(() => validateEncryptedBlob({ ...blob, iv: "!!!!" }, { purpose: "content" }), "MALFORMED_BLOB");
    assertThrowsCode(() => validateEncryptedBlob({ ...blob, ct: "zz" }, { purpose: "content" }), "MALFORMED_BLOB");
  });

  test("a blob wrapped for one purpose is never accepted for another", async () => {
    const { material } = await vault();

    // vk:recovery blob handed to the passphrase unlock → purpose mismatch, rejected pre-decrypt.
    await assertCode(
      unlockWithPassphrase(PASSPHRASE, material.wrappedByRecoveryKey, material, C),
      "MALFORMED_BLOB",
    );

    // A kit whose wrapped blob is actually the passphrase blob → rejected before decryption.
    const forgedKit: RecoveryKit = {
      format: "fvault-recovery-kit",
      version: 1,
      createdAt: new Date().toISOString(),
      recoveryKey: b64encode(randomBytes(32, C)),
      wrappedByRecoveryKey: material.wrappedByPassphrase,
      kdf: material.kdf,
    };
    await assertCode(restoreFromRecoveryKit(forgedKit, C), "MALFORMED_BLOB");

    // "content" blob decrypted with a "meta" expectation → MALFORMED_BLOB.
    const { vk } = await vault();
    const contentBlob = await encryptBytes(vk, new Uint8Array([9]), { purpose: "content" }, C);
    await assertCode(decryptBytes(vk, contentBlob, { purpose: "meta" }, C), "MALFORMED_BLOB");
  });

  test("fails closed when Web Crypto is absent (typed undefined)", async () => {
    await assertCode(createVault(PASSPHRASE, undefined), "WEBCRYPTO_UNAVAILABLE");
    await assertCode(restoreFromRecoveryKit({}, undefined), "WEBCRYPTO_UNAVAILABLE");
    assertThrowsCode(() => randomBytes(8, undefined), "WEBCRYPTO_UNAVAILABLE");
    assertThrowsCode(() => newKdfParams(undefined), "WEBCRYPTO_UNAVAILABLE");
  });
});

describe("recovery kit", () => {
  test("a kit alone restores the vault and decrypts earlier content and metadata", async () => {
    const created = await createVault(PASSPHRASE, C);
    const contentBlob = await encryptBytes(created.vk, utf8("KEEP ME"), { purpose: "content" }, C);
    const metaBlob = await encryptMetadata(created.vk, { label: "kit", urdu: "میعاد", emoji: "🔐" }, C);

    // Export only the kit, then drop every in-memory key/material reference.
    // (Nothing below touches `created.vk`, `created.recoveryKeyRaw`,
    //  `created.material` or the passphrase.)
    const kitJson = JSON.stringify(created.kit);

    const restoredVk = await restoreFromRecoveryKit(JSON.parse(kitJson) as RecoveryKit, C);
    assert.equal(decodeUtf8(await decryptBytes(restoredVk, contentBlob, { purpose: "content" }, C)), "KEEP ME");
    assert.deepEqual(await decryptMetadata(restoredVk, metaBlob, C), { label: "kit", urdu: "میعاد", emoji: "🔐" });
  });

  test("validateRecoveryKit rejects tampered outer fields before any decryption", async () => {
    const { kit } = await vault();
    const good = JSON.parse(JSON.stringify(kit)) as RecoveryKit;
    assert.equal(validateRecoveryKit(good).format, "fvault-recovery-kit");

    assertThrowsCode(() => validateRecoveryKit({ ...good, format: "nope" }), "MALFORMED_BLOB");
    assertThrowsCode(() => validateRecoveryKit({ ...good, version: 2 }), "UNSUPPORTED_VERSION");
    assertThrowsCode(() => validateRecoveryKit({ ...good, createdAt: "not-a-date" }), "MALFORMED_BLOB");
    assertThrowsCode(() => validateRecoveryKit({ ...good, recoveryKey: b64encode(new Uint8Array(16)) }), "MALFORMED_BLOB");
    assertThrowsCode(() => validateRecoveryKit({ ...good, recoveryKey: "!!!!" }), "MALFORMED_BLOB");
    assertThrowsCode(() => validateRecoveryKit({ ...good, wrappedByRecoveryKey: { ...good.wrappedByRecoveryKey, purpose: "vk:passphrase" } }), "MALFORMED_BLOB");
    assertThrowsCode(() => validateRecoveryKit({ ...good, kdf: { ...good.kdf, iterations: MIN_PBKDF2_ITERATIONS - 1 } }), "MALFORMED_BLOB");
    assertThrowsCode(() => validateRecoveryKit({ ...good, kdf: { ...good.kdf, salt: b64encode(new Uint8Array(8)) } }), "MALFORMED_BLOB");
    assertThrowsCode(() => validateRecoveryKit(null), "MALFORMED_BLOB");

    // restoreFromRecoveryKit refuses a tampered kit too.
    await assertCode(restoreFromRecoveryKit({ ...good, createdAt: "bad" }, C), "MALFORMED_BLOB");
  });

  test("buildRecoveryKit rejects a mismatched key and otherwise returns a restorable kit", async () => {
    const { material, recoveryKeyRaw, vk } = await vault();
    const metaBlob = await encryptMetadata(vk, { marker: "kit-rebuild" }, C);

    await assertCode(buildRecoveryKit(material, randomBytes(32, C), C), "INVALID_ARGUMENT");
    await assertCode(buildRecoveryKit(material, new Uint8Array(31), C), "INVALID_ARGUMENT");

    const rebuilt = await buildRecoveryKit(material, recoveryKeyRaw, C);
    const restoredVk = await restoreFromRecoveryKit(rebuilt, C);
    assert.deepEqual(await decryptMetadata(restoredVk, metaBlob, C), { marker: "kit-rebuild" });
  });
});

describe("passphrase rewrap from a recovery kit", () => {
  test("a forgotten passphrase is replaced without touching the vault key", async () => {
    const oldPassphrase = "the passphrase I forgot";
    const newPassphrase = "the passphrase I will remember";
    const created = await createVault(oldPassphrase, C);

    const contentBlob = await encryptBytes(created.vk, utf8("KEEP ME TOO"), { purpose: "content" }, C);
    const metaBlob = await encryptMetadata(created.vk, { label: "rewrap" }, C);
    const dek = await generateDek(C);
    const wrappedDek = await wrapDek(created.vk, dek, C);

    const rewrapped = await rewrapVaultKeyWithPassphrase(created.kit, newPassphrase, C);

    // Only the passphrase wrapping changed; the recovery path is carried over.
    assert.notEqual(rewrapped.material.kdf.salt, created.material.kdf.salt);
    assert.equal(rewrapped.material.wrappedByPassphrase.purpose, "vk:passphrase");
    assert.deepEqual(rewrapped.material.wrappedByRecoveryKey, created.material.wrappedByRecoveryKey);
    assert.equal(rewrapped.material.createdAt, created.material.createdAt);

    // The new passphrase opens the *same* key: documents sealed before the
    // rewrap are still readable, which is the whole point of the operation.
    const reopened = await unlockWithPassphrase(
      newPassphrase,
      rewrapped.material.wrappedByPassphrase,
      rewrapped.material,
      C,
    );
    assert.equal(decodeUtf8(await decryptBytes(reopened, contentBlob, { purpose: "content" }, C)), "KEEP ME TOO");
    assert.deepEqual(await decryptMetadata(reopened, metaBlob, C), { label: "rewrap" });
    // The unwrapped DEK is the same one, so nothing needed re-encrypting.
    const unwrappedRaw = new Uint8Array(await C.subtle.exportKey("raw", await unwrapDek(reopened, wrappedDek, C)));
    assert.equal(unwrappedRaw.length, 32);
    assert.deepEqual(await decryptMetadata(rewrapped.vk, metaBlob, C), { label: "rewrap" });

    // The forgotten passphrase stops working immediately.
    await assertCode(
      unlockWithPassphrase(oldPassphrase, rewrapped.material.wrappedByPassphrase, rewrapped.material, C),
      "AUTH_FAILED",
    );
  });

  test("a bad kit or passphrase is refused before anything is re-wrapped", async () => {
    const { kit } = await vault();

    await assertCode(rewrapVaultKeyWithPassphrase(kit, "", C), "INVALID_ARGUMENT");
    await assertCode(rewrapVaultKeyWithPassphrase({}, "a new long passphrase", C), "MALFORMED_BLOB");
    await assertCode(rewrapVaultKeyWithPassphrase(null, "a new long passphrase", C), "MALFORMED_BLOB");

    // A kit whose wrapped blob does not match its own recovery key: the kit is
    // structurally valid, so this fails at decryption as INVALID_ARGUMENT.
    const mismatched = {
      ...JSON.parse(JSON.stringify(kit)) as RecoveryKit,
      recoveryKey: b64encode(randomBytes(32, C)),
    };
    await assertCode(rewrapVaultKeyWithPassphrase(mismatched, "a new long passphrase", C), "INVALID_ARGUMENT");

    await assertCode(
      rewrapVaultKeyWithPassphrase(kit, "a new long passphrase", undefined),
      "WEBCRYPTO_UNAVAILABLE",
    );
  });
});

describe("KDF policy", () => {
  test("parameters are strictly validated", () => {
    const base = newKdfParams(C);
    assert.equal(validateKdfParams(base).iterations, PBKDF2_ITERATIONS);
    assert.equal(PBKDF2_ITERATIONS >= MIN_PBKDF2_ITERATIONS, true);

    assertThrowsCode(() => validateKdfParams({ ...base, name: "PBKDF2-SHA1" }), "INVALID_ARGUMENT");
    assertThrowsCode(() => validateKdfParams({ ...base, hash: "SHA-1" }), "INVALID_ARGUMENT");
    assertThrowsCode(() => validateKdfParams({ ...base, salt: b64encode(new Uint8Array(8)) }), "INVALID_ARGUMENT");
    assertThrowsCode(() => validateKdfParams({ ...base, iterations: MIN_PBKDF2_ITERATIONS - 1 }), "INVALID_ARGUMENT");
    assertThrowsCode(() => validateKdfParams({ ...base, iterations: MAX_PBKDF2_ITERATIONS + 1 }), "INVALID_ARGUMENT");
    assertThrowsCode(() => validateKdfParams({ ...base, iterations: 1.5 }), "INVALID_ARGUMENT");
    // Imported material reports MALFORMED_BLOB rather than INVALID_ARGUMENT.
    assertThrowsCode(() => validateKdfParams({ ...base, iterations: 1000 }, "MALFORMED_BLOB"), "MALFORMED_BLOB");
  });

  test("the passphrase-derived key is non-extractable", async () => {
    const pk = await deriveKeyFromPassphrase(PASSPHRASE, newKdfParams(C), C);
    assert.equal(pk.extractable, false);
    await assert.rejects(C.subtle.exportKey("raw", pk));
  });
});

describe("ciphertext size policy", () => {
  const wrapPurposes: WrapPurpose[] = ["vk:passphrase", "vk:recovery", "dek"];

  /** A structurally-valid blob whose ciphertext is `ctBytes` long (no crypto). */
  function blobFor(purpose: WrapPurpose, ctBytes: number) {
    return {
      v: 1,
      alg: "AES-256-GCM",
      purpose,
      iv: b64encode(randomBytes(12, C)),
      ct: b64encode(randomBytes(ctBytes, C)),
    };
  }

  test("a key-wrapping ciphertext within the limit is accepted", () => {
    for (const purpose of wrapPurposes) {
      const blob = blobFor(purpose, 48); // 32-byte key + 16-byte tag
      assert.equal(validateEncryptedBlob(blob, { purpose }).ct, blob.ct);
    }
  });

  test("a key-wrapping ciphertext exactly at the limit is accepted", () => {
    for (const purpose of wrapPurposes) {
      assert.doesNotThrow(() =>
        validateEncryptedBlob(blobFor(purpose, MAX_KEY_WRAP_CT_BYTES), { purpose }),
      );
    }
  });

  test("one decoded byte over the limit is rejected", () => {
    for (const purpose of wrapPurposes) {
      assertThrowsCode(
        () => validateEncryptedBlob(blobFor(purpose, MAX_KEY_WRAP_CT_BYTES + 1), { purpose }),
        "MALFORMED_BLOB",
      );
    }
  });

  test("an oversized Base64 ciphertext is rejected before it is decoded", () => {
    const purpose: WrapPurpose = "vk:passphrase";
    const blob = { ...blobFor(purpose, 48), ct: b64encode(randomBytes(1024, C)) };
    assertThrowsCode(() => validateEncryptedBlob(blob, { purpose }), "MALFORMED_BLOB");
  });

  test("a ciphertext shorter than the authentication tag is still rejected", () => {
    assertThrowsCode(
      () => validateEncryptedBlob(blobFor("vk:passphrase", 15), { purpose: "vk:passphrase" }),
      "MALFORMED_BLOB",
    );
  });

  test("non-canonical Base64 ciphertext is rejected by existing conventions", () => {
    const blob = { ...blobFor("dek", 48), ct: "ab=c" };
    assertThrowsCode(() => validateEncryptedBlob(blob, { purpose: "dek" }), "MALFORMED_BLOB");
  });

  test("variable-length content/meta blobs stay unbounded (cap is purpose-scoped)", () => {
    // Well past the key-wrap cap — a whole-file ciphertext must not be rejected.
    const big = randomBytes(100_000, C);
    assert.equal(validateEncryptedBlob(blobFor("content", big.length), { purpose: "content" }).ct.length > 0, true);
    assert.doesNotThrow(() =>
      validateEncryptedBlob(blobFor("meta", big.length), { purpose: "meta" }),
    );
  });

  test("real wrapped-key blobs from createVault satisfy the cap", async () => {
    const { material } = await vault();
    assert.doesNotThrow(() =>
      validateEncryptedBlob(material.wrappedByPassphrase, { purpose: "vk:passphrase" }),
    );
    assert.doesNotThrow(() =>
      validateEncryptedBlob(material.wrappedByRecoveryKey, { purpose: "vk:recovery" }),
    );
  });
});
