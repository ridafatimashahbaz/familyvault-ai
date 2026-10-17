import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { NextRequest } from "next/server";

import { ApiRequestError } from "@/lib/api";
import {
  getVaultMaterial,
  parseVaultMaterial,
  putVaultMaterial,
  type VaultMaterialClient,
  type VaultMaterialRow,
} from "@/lib/services/vault";
import { PUT } from "@/app/api/vault/material/route";

/**
 * Focused security tests for the vault-material API (Day 1, Phase 1).
 *
 * These run with no database: persistence goes through an in-memory fake that
 * mirrors the two operations the server performs. The point is to pin down the
 * security contract — strict shape, no key material in or out, purpose binding,
 * and per-user scoping — independently of Prisma.
 */

const b64 = (bytes: number) => Buffer.from(new Uint8Array(bytes)).toString("base64");

/** A structurally-valid material. No real cryptography is implied. */
function validMaterial() {
  return {
    kdf: {
      name: "PBKDF2-SHA256",
      hash: "SHA-256",
      iterations: 600_000,
      salt: b64(16),
    },
    createdAt: "2026-10-13T10:00:00.000Z",
    wrappedByPassphrase: {
      v: 1,
      alg: "AES-256-GCM",
      purpose: "vk:passphrase",
      iv: b64(12),
      ct: b64(48),
    },
    wrappedByRecoveryKey: {
      v: 1,
      alg: "AES-256-GCM",
      purpose: "vk:recovery",
      iv: b64(12),
      ct: b64(48),
    },
  };
}

function memoryClient() {
  const rows = new Map<string, VaultMaterialRow>();
  const client: VaultMaterialClient & { rows: Map<string, VaultMaterialRow> } = {
    rows,
    findMaterial: async (userId) => rows.get(userId) ?? null,
    upsertMaterial: async (userId, row) => {
      rows.set(userId, row);
    },
  };
  return client;
}

async function expectInvalid(run: () => Promise<unknown> | unknown) {
  await assert.rejects(
    async () => {
      await run();
    },
    (error: unknown) => {
      assert.ok(error instanceof ApiRequestError, "must be an ApiRequestError");
      assert.equal(error.status, 422);
      // The message is constant and never reflects the submitted value.
      assert.equal(error.message, "Invalid vault material");
      return true;
    },
  );
}

// --- 1. valid material is accepted and round-trips --------------------------

describe("vault material: valid input", () => {
  test("accepts valid material and persists only the allowlisted shape", async () => {
    const client = memoryClient();
    const material = validMaterial();

    const stored = await putVaultMaterial("user-1", material, client);
    assert.deepEqual(stored, material);

    const row = client.rows.get("user-1");
    assert.ok(row, "a row should be written for the caller");
    // The row carries wrapped blobs only; no raw key field exists.
    assert.ok(!("passphrase" in row));
    assert.ok(!("recoveryKey" in row));

    const read = await getVaultMaterial("user-1", client);
    assert.deepEqual(read, material);
    assert.deepEqual(Object.keys(read ?? {}).sort(), [
      "createdAt",
      "kdf",
      "wrappedByPassphrase",
      "wrappedByRecoveryKey",
    ]);
  });

  test("returns null when the caller has no vault yet", async () => {
    const client = memoryClient();
    assert.equal(await getVaultMaterial("nobody", client), null);
  });
});

// --- 2. raw key material is rejected ----------------------------------------

describe("vault material: no key material", () => {
  test("rejects a CryptoKey hidden inside an allowed field", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const material = validMaterial();
    await expectInvalid(() =>
      putVaultMaterial("user-1", { ...material, wrappedByPassphrase: key }, memoryClient()),
    );
  });

  test("rejects an ArrayBuffer and typed-array views", async () => {
    const material = validMaterial();
    await expectInvalid(() =>
      putVaultMaterial("user-1", { ...material, kdf: new ArrayBuffer(16) }, memoryClient()),
    );
    await expectInvalid(() =>
      putVaultMaterial("user-1", { ...material, createdAt: new Uint8Array(32) }, memoryClient()),
    );
  });

  test("rejects nested key material without echoing it", async () => {
    const material = validMaterial();
    const nested = { ...material, kdf: { ...material.kdf, salt: { raw: new ArrayBuffer(8) } } };
    await expectInvalid(() => parseVaultMaterial(nested));
  });
});

// --- 3. purpose binding -----------------------------------------------------

describe("vault material: purpose binding", () => {
  test("rejects a passphrase blob carrying the recovery purpose", async () => {
    const material = validMaterial();
    material.wrappedByPassphrase.purpose = "vk:recovery";
    await expectInvalid(() => parseVaultMaterial(material));
  });

  test("rejects a recovery blob carrying the passphrase purpose", async () => {
    const material = validMaterial();
    material.wrappedByRecoveryKey.purpose = "vk:passphrase";
    await expectInvalid(() => parseVaultMaterial(material));
  });

  test("rejects an unrelated (dek/content/meta) purpose", async () => {
    const material = validMaterial();
    material.wrappedByPassphrase.purpose = "dek";
    await expectInvalid(() => parseVaultMaterial(material));
  });
});

// --- 4. extra / unknown fields are rejected ---------------------------------

describe("vault material: allowlist", () => {
  test("rejects extra fields such as passphrase, vk or recovery key", async () => {
    const material = validMaterial();
    await expectInvalid(() => parseVaultMaterial({ ...material, passphrase: "hunter2" }));
    await expectInvalid(() => parseVaultMaterial({ ...material, vk: b64(32) }));
    await expectInvalid(() => parseVaultMaterial({ ...material, recoveryKey: b64(32) }));
  });

  test("rejects a substituted key (four keys, one missing)", async () => {
    const { kdf, ...rest } = validMaterial();
    void kdf;
    await expectInvalid(() => parseVaultMaterial({ ...rest, secret: "x" }));
  });

  test("does not persist anything when validation fails", async () => {
    const client = memoryClient();
    const material = validMaterial();
    await expectInvalid(() =>
      putVaultMaterial("user-1", { ...material, passphrase: "hunter2" }, client),
    );
    assert.equal(client.rows.size, 0, "no row should be written on rejection");
  });
});

// --- 5. malformed shapes ----------------------------------------------------

describe("vault material: malformed shapes", () => {
  test("rejects non-objects and arrays", async () => {
    await expectInvalid(() => parseVaultMaterial(null));
    await expectInvalid(() => parseVaultMaterial("material"));
    await expectInvalid(() => parseVaultMaterial([validMaterial()]));
  });

  test("rejects a wrong-length IV, salt or short ciphertext", async () => {
    const iv = validMaterial();
    iv.wrappedByPassphrase.iv = b64(11);
    await expectInvalid(() => parseVaultMaterial(iv));

    const salt = validMaterial();
    salt.kdf.salt = b64(15);
    await expectInvalid(() => parseVaultMaterial(salt));

    const shortCt = validMaterial();
    shortCt.wrappedByRecoveryKey.ct = b64(8); // shorter than the 16-byte GCM tag
    await expectInvalid(() => parseVaultMaterial(shortCt));
  });

  test("rejects a bad version, algorithm, kdf name or iteration count", async () => {
    const version = validMaterial();
    (version.wrappedByPassphrase as { v: number }).v = 2;
    await expectInvalid(() => parseVaultMaterial(version));

    const alg = validMaterial();
    (alg.wrappedByPassphrase as { alg: string }).alg = "AES-CBC";
    await expectInvalid(() => parseVaultMaterial(alg));

    const kdf = validMaterial();
    (kdf.kdf as { name: string }).name = "scrypt";
    await expectInvalid(() => parseVaultMaterial(kdf));

    const low = validMaterial();
    low.kdf.iterations = 1_000;
    await expectInvalid(() => parseVaultMaterial(low));

    const high = validMaterial();
    high.kdf.iterations = 999_999_999;
    await expectInvalid(() => parseVaultMaterial(high));
  });

  test("rejects a non-ISO createdAt", async () => {
    const material = validMaterial();
    material.createdAt = "yesterday";
    await expectInvalid(() => parseVaultMaterial(material));
  });

  test("rejects an oversized wrapped-key ciphertext before persisting anything", async () => {
    const client = memoryClient();
    const material = validMaterial();
    // 1024 decoded bytes — well past the 256-byte key-wrap cap.
    material.wrappedByPassphrase.ct = b64(1024);
    await expectInvalid(() => putVaultMaterial("user-1", material, client));
    assert.equal(client.rows.size, 0, "no row should be written on rejection");
  });
});

// --- 6. per-user scoping ----------------------------------------------------

describe("vault material: user scoping", () => {
  test("keeps each user's material isolated and never crosses accounts", async () => {
    const client = memoryClient();
    const a = validMaterial();
    const b = validMaterial();
    b.createdAt = "2026-10-13T11:00:00.000Z";

    await putVaultMaterial("user-a", a, client);
    await putVaultMaterial("user-b", b, client);

    assert.deepEqual(await getVaultMaterial("user-a", client), a);
    assert.deepEqual(await getVaultMaterial("user-b", client), b);
    assert.equal(await getVaultMaterial("user-c", client), null);
  });

  test("replaces only the caller's own row", async () => {
    const client = memoryClient();
    const a1 = validMaterial();
    const a2 = validMaterial();
    a2.createdAt = "2026-10-13T12:00:00.000Z";
    const b = validMaterial();

    await putVaultMaterial("user-a", a1, client);
    await putVaultMaterial("user-b", b, client);
    await putVaultMaterial("user-a", a2, client);

    assert.deepEqual(await getVaultMaterial("user-a", client), a2);
    assert.deepEqual(await getVaultMaterial("user-b", client), b);
    assert.equal(client.rows.size, 2);
  });
});

// --- 7. route-level guards --------------------------------------------------

describe("vault material route", () => {
  test("rejects a cross-origin PUT before any auth or storage work", async () => {
    const request = new NextRequest("http://localhost/api/vault/material", {
      method: "PUT",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ material: validMaterial() }),
    });

    const response = await PUT(request);
    assert.equal(response.status, 403);

    const raw = (await response.text()).toLowerCase();
    assert.ok(!raw.includes("passphrase"));
    assert.ok(!raw.includes("recovery"));
  });
});
