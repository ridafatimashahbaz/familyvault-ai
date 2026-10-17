import { ApiRequestError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { validateEncryptedBlob, validateKdfParams } from "@vault/crypto";
import type { VaultMaterial } from "@vault/types";

/**
 * Vault material service (Day 1, Phase 1).
 *
 * The server is a *blind* store for the browser-side end-to-end vault: it
 * persists the wrapped key blobs and the public KDF parameters, and nothing
 * else. It never derives a key, never unwraps a blob and never sees a
 * passphrase, recovery key, vault key or per-document key.
 *
 * Two security properties are enforced here, deliberately at the service
 * boundary so every caller inherits them:
 *
 *   1. Strict shape. Input is validated with the *same* primitives the vault
 *      uses (`validateKdfParams` / `validateEncryptedBlob`) and then rebuilt
 *      from an explicit allowlist, so unknown or extra fields — including any
 *      smuggled key material — are rejected rather than persisted.
 *   2. User scoping. Every read and write is keyed on the caller's `userId`.
 *      Rows are unique per user (`VaultMaterial.userId` is `@unique`), so one
 *      account can never read or overwrite another's material.
 *
 * Format details intentionally live in pwa/src/vault (types + validators) so
 * the server and the client cannot drift apart.
 */

/** The columns the server persists; mirrors the `VaultMaterial` type. */
export interface VaultMaterialRow {
  kdfName: string;
  kdfHash: string;
  kdfIterations: number;
  kdfSalt: string;
  materialCreatedAt: Date;
  wrappedByPassphrase: string;
  wrappedByRecoveryKey: string;
}

/**
 * Narrow data-access seam. The default implementation is backed by Prisma; a
 * test can pass an in-memory fake without a database.
 */
export interface VaultMaterialClient {
  findMaterial(userId: string): Promise<VaultMaterialRow | null>;
  upsertMaterial(userId: string, row: VaultMaterialRow): Promise<void>;
}

const MATERIAL_KEYS = ["kdf", "createdAt", "wrappedByPassphrase", "wrappedByRecoveryKey"] as const;

/** Single, non-echoing error message: never reflect the submitted value back. */
function invalid(): ApiRequestError {
  return new ApiRequestError(422, "Invalid vault material");
}

/**
 * Reject raw key material anywhere in the object graph — `CryptoKey`s,
 * `ArrayBuffer`s and typed-array views. This is defense in depth: the real
 * guarantee is the strict allowlist below plus JSON-only transport, but a
 * caller that hands us a live key object should fail loudly, not store it.
 */
function assertNoKeyMaterial(value: unknown, path = "material"): void {
  const seen = new WeakSet<object>();

  const visit = (node: unknown, where: string): void => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (typeof CryptoKey !== "undefined" && node instanceof CryptoKey) {
      throw invalid();
    }
    if (node instanceof ArrayBuffer) throw invalid();
    if (ArrayBuffer.isView(node)) throw invalid();

    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${where}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      visit(child, `${where}.${key}`);
    }
  };

  visit(value, path);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireIsoTimestamp(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw invalid();
  return value;
}

/**
 * Validate and canonicalise untrusted input into a `VaultMaterial`.
 *
 * The result is rebuilt field by field from the allowlist, so the object we
 * persist (and later return) contains exactly four keys and nothing an attacker
 * could have appended.
 */
export function parseVaultMaterial(input: unknown): VaultMaterial {
  assertNoKeyMaterial(input);

  if (!isPlainObject(input)) throw invalid();

  const keys = Object.keys(input);
  if (keys.length !== MATERIAL_KEYS.length || !MATERIAL_KEYS.every((key) => key in input)) {
    throw invalid();
  }

  let kdf;
  let wrappedByPassphrase;
  let wrappedByRecoveryKey;
  try {
    kdf = validateKdfParams(input.kdf, "MALFORMED_BLOB");
    wrappedByPassphrase = validateEncryptedBlob(input.wrappedByPassphrase, {
      purpose: "vk:passphrase",
    });
    wrappedByRecoveryKey = validateEncryptedBlob(input.wrappedByRecoveryKey, {
      purpose: "vk:recovery",
    });
  } catch {
    throw invalid();
  }

  return {
    kdf,
    createdAt: requireIsoTimestamp(input.createdAt),
    wrappedByPassphrase,
    wrappedByRecoveryKey,
  };
}

function rowToMaterial(row: VaultMaterialRow): VaultMaterial {
  try {
    return parseVaultMaterial({
      kdf: {
        name: row.kdfName,
        hash: row.kdfHash,
        iterations: row.kdfIterations,
        salt: row.kdfSalt,
      },
      createdAt: row.materialCreatedAt.toISOString(),
      wrappedByPassphrase: JSON.parse(row.wrappedByPassphrase),
      wrappedByRecoveryKey: JSON.parse(row.wrappedByRecoveryKey),
    });
  } catch {
    // A stored row that no longer validates means the material is unusable —
    // fail closed rather than hand a client something it cannot trust.
    throw new ApiRequestError(500, "Stored vault material is unreadable");
  }
}

function materialToRow(material: VaultMaterial): VaultMaterialRow {
  return {
    kdfName: material.kdf.name,
    kdfHash: material.kdf.hash,
    kdfIterations: material.kdf.iterations,
    kdfSalt: material.kdf.salt,
    materialCreatedAt: new Date(material.createdAt),
    wrappedByPassphrase: JSON.stringify(material.wrappedByPassphrase),
    wrappedByRecoveryKey: JSON.stringify(material.wrappedByRecoveryKey),
  };
}

function defaultClient(): VaultMaterialClient {
  return {
    findMaterial: (userId) => prisma.vaultMaterial.findUnique({ where: { userId } }),
    upsertMaterial: async (userId, row) => {
      await prisma.vaultMaterial.upsert({
        where: { userId },
        create: { userId, ...row },
        update: row,
      });
    },
  };
}

/** Returns the caller's vault material, or `null` if they have not created a vault yet. */
export async function getVaultMaterial(
  userId: string,
  client: VaultMaterialClient = defaultClient(),
): Promise<VaultMaterial | null> {
  const row = await client.findMaterial(userId);
  return row ? rowToMaterial(row) : null;
}

/**
 * Validate and persist the caller's vault material (create or replace).
 *
 * The raw `input` is accepted as `unknown` on purpose: validation must happen
 * here, not at the call site, so no route can accidentally write an unvalidated
 * shape. Only the caller's own row is ever touched.
 */
export async function putVaultMaterial(
  userId: string,
  input: unknown,
  client: VaultMaterialClient = defaultClient(),
): Promise<VaultMaterial> {
  const material = parseVaultMaterial(input);
  await client.upsertMaterial(userId, materialToRow(material));
  return material;
}
