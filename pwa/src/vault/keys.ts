/**
 * Vault crypto — key lifecycle.
 *
 * Key hierarchy:
 *
 *   passphrase ──PBKDF2-SHA256(salt, N)──▶ PK  (AES-GCM, non-extractable)
 *   random 256-bit VK  ──wrapped by PK, purpose "vk:passphrase"──▶ wrappedByPassphrase ┐ persisted
 *   random 256-bit VK  ──wrapped by RK, purpose "vk:recovery"──▶ wrappedByRecoveryKey   ┘ (P4)
 *   per document: random 256-bit DEK
 *     content    = AES-256-GCM(DEK, fileBytes)  purpose "content"
 *     wrappedDEK = AES-256-GCM(VK, DEK)         purpose "dek"
 *     metadata   = AES-256-GCM(VK, JSON)        purpose "meta"
 *
 * PK and RK wrap the *same* VK as two independent operations: each draws its
 * own random IV and uses a distinct AAD context. A blob wrapped for one purpose
 * is never accepted for another — every unwrap validates the purpose first.
 *
 * The crypto here never touches storage. In particular the recovery kit is only
 * ever *returned*; persisting or downloading it is an explicit P6 user action.
 */

import {
  b64decodeStrict,
  b64encode,
  createAesKey,
  decodeUtf8,
  decryptBytes,
  deriveKeyFromPassphrase,
  encryptBytes,
  randomBytes,
  SALT_BYTES,
  KEY_BYTES,
  utf8,
  validateEncryptedBlob,
  validateKdfParams,
  zeroize,
} from "./crypto";
import { assertWebCrypto, isVaultCryptoError, VaultCryptoError } from "./errors";
import type {
  CryptoProvider,
  EncryptedBlob,
  KdfParams,
  RecoveryKit,
  VaultMaterial,
  WrappedKeyBlob,
} from "./types";

export {
  MAX_PBKDF2_ITERATIONS,
  MIN_PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS,
} from "./crypto";

import { PBKDF2_ITERATIONS } from "./crypto";

export type CreateVaultResult = {
  /** The usable vault key (non-extractable). */
  vk: CryptoKey;
  /** The raw recovery key. Keep it only long enough to hand the kit to the user. */
  recoveryKeyRaw: Uint8Array<ArrayBuffer>;
  /** Everything that should be persisted; contains no usable key material. */
  material: VaultMaterial;
  /** A self-contained recovery kit (see `VaultMaterial`/`RecoveryKit` notes). */
  kit: RecoveryKit;
};

/** Fresh KDF parameters with a random 16-byte salt and the current iteration count. */
export function newKdfParams(provider?: CryptoProvider): KdfParams {
  assertWebCrypto(provider);
  const salt = randomBytes(SALT_BYTES, provider);
  return {
    name: "PBKDF2-SHA256",
    hash: "SHA-256",
    iterations: PBKDF2_ITERATIONS,
    salt: b64encode(salt),
  };
}

/**
 * Create a brand-new vault.
 *
 * Derives PK from the passphrase, generates a random VK and a random recovery
 * key (RK), then wraps the VK twice — once under PK, once under RK — with
 * independent IVs and distinct AAD. Returns the usable VK, the raw RK, the
 * persistent material and the self-contained recovery kit.
 */
export async function createVault(
  passphrase: string,
  provider?: CryptoProvider,
): Promise<CreateVaultResult> {
  assertWebCrypto(provider);
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    throw new VaultCryptoError("INVALID_ARGUMENT", "passphrase must be a non-empty string");
  }

  const kdf = newKdfParams(provider);
  const createdAt = new Date().toISOString();

  const pk = await deriveKeyFromPassphrase(passphrase, kdf, provider);
  const vkRaw = randomBytes(KEY_BYTES, provider);
  const rkRaw = randomBytes(KEY_BYTES, provider);

  const rk = await createAesKey(rkRaw, { extractable: false, usages: ["encrypt", "decrypt"] }, provider);

  const wrappedByPassphrase = await encryptBytes(pk, vkRaw, { purpose: "vk:passphrase" }, provider);
  const wrappedByRecoveryKey = await encryptBytes(rk, vkRaw, { purpose: "vk:recovery" }, provider);

  const vk = await createAesKey(vkRaw, { extractable: false, usages: ["encrypt", "decrypt"] }, provider);
  zeroize(vkRaw);

  const material: VaultMaterial = {
    kdf,
    createdAt,
    wrappedByPassphrase,
    wrappedByRecoveryKey,
  };

  const kit: RecoveryKit = {
    format: "fvault-recovery-kit",
    version: 1,
    createdAt,
    recoveryKey: b64encode(rkRaw),
    wrappedByRecoveryKey,
    kdf,
  };

  return { vk, recoveryKeyRaw: rkRaw, material, kit };
}

/**
 * Unlock a vault with its passphrase.
 *
 * Requires a blob with purpose `"vk:passphrase"`; the derived PK is the only
 * thing that can open it. Returns the VK as a non-extractable `CryptoKey`.
 */
export async function unlockWithPassphrase(
  passphrase: string,
  wrappedByPassphrase: unknown,
  material: VaultMaterial,
  provider?: CryptoProvider,
): Promise<CryptoKey> {
  assertWebCrypto(provider);
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    throw new VaultCryptoError("INVALID_ARGUMENT", "passphrase must be a non-empty string");
  }
  if (!material || typeof material !== "object") {
    throw new VaultCryptoError("INVALID_ARGUMENT", "vault material is required");
  }

  const blob = validateEncryptedBlob(wrappedByPassphrase, { purpose: "vk:passphrase" });
  const pk = await deriveKeyFromPassphrase(passphrase, material.kdf, provider);
  const vkRaw = await decryptBytes(pk, blob, { purpose: "vk:passphrase" }, provider);
  const vk = await createAesKey(vkRaw, { extractable: false, usages: ["encrypt", "decrypt"] }, provider);
  zeroize(vkRaw);
  return vk;
}

/**
 * Validate a recovery kit's *structure* without decrypting anything.
 *
 * Honesty: only `wrappedByRecoveryKey` is GCM-authenticated. The surrounding
 * fields are checked here (format, version, ISO timestamp, 32-byte recovery
 * key, wrapped-blob shape, KDF bounds) but they are not cryptographically
 * bound to the ciphertext — no whole-kit MAC exists in this version.
 */
export function validateRecoveryKit(kit: unknown): RecoveryKit {
  const fail = (message: string) => new VaultCryptoError("MALFORMED_BLOB", message);
  if (!kit || typeof kit !== "object") throw fail("recovery kit must be an object");
  const record = kit as Record<string, unknown>;

  if (record.format !== "fvault-recovery-kit") throw fail("unrecognised recovery kit format");
  if (record.version !== 1) {
    throw new VaultCryptoError("UNSUPPORTED_VERSION", `unsupported recovery kit version: ${String(record.version)}`);
  }
  if (typeof record.createdAt !== "string" || Number.isNaN(Date.parse(record.createdAt))) {
    throw fail("createdAt must be an ISO-8601 timestamp");
  }
  if (typeof record.recoveryKey !== "string") throw fail("recoveryKey must be a base64 string");
  b64decodeStrict(record.recoveryKey, KEY_BYTES);

  const wrappedByRecoveryKey = validateEncryptedBlob(record.wrappedByRecoveryKey, {
    purpose: "vk:recovery",
  });
  const kdf = validateKdfParams(record.kdf, "MALFORMED_BLOB");

  return {
    format: "fvault-recovery-kit",
    version: 1,
    createdAt: record.createdAt,
    recoveryKey: record.recoveryKey,
    wrappedByRecoveryKey,
    kdf,
  };
}

/**
 * Rebuild a recovery kit from existing material and a recovery key.
 *
 * This only *serializes* material that already exists — it never generates or
 * re-wraps a key. Before returning, it **verifies** that `recoveryKeyRaw`
 * actually opens `material.wrappedByRecoveryKey`; a mismatched key throws
 * `INVALID_ARGUMENT` rather than emitting a kit that cannot restore the vault.
 *
 * The returned kit is never persisted here — the caller (P6) decides that.
 */
export async function buildRecoveryKit(
  material: VaultMaterial,
  recoveryKeyRaw: Uint8Array<ArrayBuffer>,
  provider?: CryptoProvider,
): Promise<RecoveryKit> {
  assertWebCrypto(provider);
  if (!material || typeof material !== "object") {
    throw new VaultCryptoError("INVALID_ARGUMENT", "vault material is required");
  }
  if (!(recoveryKeyRaw instanceof Uint8Array) || recoveryKeyRaw.length !== KEY_BYTES) {
    throw new VaultCryptoError("INVALID_ARGUMENT", `recovery key must be ${KEY_BYTES} bytes`);
  }

  const rk = await createAesKey(recoveryKeyRaw, { extractable: false, usages: ["encrypt", "decrypt"] }, provider);
  let vkRaw: Uint8Array;
  try {
    vkRaw = await decryptBytes(rk, material.wrappedByRecoveryKey, { purpose: "vk:recovery" }, provider);
  } catch (error) {
    if (isVaultCryptoError(error) && (error.code === "AUTH_FAILED" || error.code === "MALFORMED_BLOB")) {
      throw new VaultCryptoError("INVALID_ARGUMENT", "recovery key does not match this vault");
    }
    throw error;
  }
  zeroize(vkRaw);

  return {
    format: "fvault-recovery-kit",
    version: 1,
    createdAt: material.createdAt,
    recoveryKey: b64encode(recoveryKeyRaw),
    wrappedByRecoveryKey: material.wrappedByRecoveryKey,
    kdf: material.kdf,
  };
}

/**
 * Restore the vault key from a recovery kit **alone** — no passphrase needed.
 *
 * Validates the kit structure first, then unwraps the VK with the embedded
 * recovery key (purpose `"vk:recovery"`). Returns a non-extractable VK.
 */
export async function restoreFromRecoveryKit(
  kit: unknown,
  provider?: CryptoProvider,
): Promise<CryptoKey> {
  assertWebCrypto(provider);
  const validated = validateRecoveryKit(kit);
  const rkRaw = b64decodeStrict(validated.recoveryKey, KEY_BYTES);
  try {
    const rk = await createAesKey(rkRaw, { extractable: false, usages: ["encrypt", "decrypt"] }, provider);
    const vkRaw = await decryptBytes(rk, validated.wrappedByRecoveryKey, { purpose: "vk:recovery" }, provider);
    const vk = await createAesKey(vkRaw, { extractable: false, usages: ["encrypt", "decrypt"] }, provider);
    zeroize(vkRaw);
    return vk;
  } finally {
    zeroize(rkRaw);
  }
}

export type RewrapResult = {
  /** The same vault key as before — only its passphrase wrapping was replaced. */
  vk: CryptoKey;
  /** Material to persist: a new passphrase wrap plus the original recovery path. */
  material: VaultMaterial;
};

/**
 * Re-wrap the vault key under a **new** passphrase, using a recovery kit.
 *
 * This is the "I forgot my passphrase" path: the kit's recovery key unwraps the
 * *same* VK — so every existing document stays readable — and a fresh salt plus
 * the new passphrase wrap it again. The raw VK is generated and consumed inside
 * this function and is never returned.
 *
 * The old passphrase stops working as soon as the caller persists the returned
 * material; there is no period where both open the vault.
 */
export async function rewrapVaultKeyWithPassphrase(
  kit: unknown,
  newPassphrase: string,
  provider?: CryptoProvider,
): Promise<RewrapResult> {
  assertWebCrypto(provider);
  if (typeof newPassphrase !== "string" || newPassphrase.length === 0) {
    throw new VaultCryptoError("INVALID_ARGUMENT", "passphrase must be a non-empty string");
  }

  const validated = validateRecoveryKit(kit);
  const rkRaw = b64decodeStrict(validated.recoveryKey, KEY_BYTES);
  let vkRaw: Uint8Array<ArrayBuffer>;
  try {
    const rk = await createAesKey(rkRaw, { extractable: false, usages: ["encrypt", "decrypt"] }, provider);
    try {
      vkRaw = await decryptBytes(rk, validated.wrappedByRecoveryKey, { purpose: "vk:recovery" }, provider);
    } catch (error) {
      if (isVaultCryptoError(error) && (error.code === "AUTH_FAILED" || error.code === "MALFORMED_BLOB")) {
        throw new VaultCryptoError("INVALID_ARGUMENT", "recovery key does not match this vault");
      }
      throw error;
    }
  } finally {
    zeroize(rkRaw);
  }

  try {
    const kdf = newKdfParams(provider);
    const pk = await deriveKeyFromPassphrase(newPassphrase, kdf, provider);
    const wrappedByPassphrase = await encryptBytes(pk, vkRaw, { purpose: "vk:passphrase" }, provider);
    const vk = await createAesKey(vkRaw, { extractable: false, usages: ["encrypt", "decrypt"] }, provider);
    return {
      vk,
      material: {
        kdf,
        createdAt: validated.createdAt,
        wrappedByPassphrase,
        wrappedByRecoveryKey: validated.wrappedByRecoveryKey,
      },
    };
  } finally {
    zeroize(vkRaw);
  }
}

// --- per-document keys -----------------------------------------------------

/** Generate a fresh random data-encryption key (DEK). */
export async function generateDek(provider?: CryptoProvider): Promise<CryptoKey> {
  assertWebCrypto(provider);
  return provider.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/** Wrap a DEK under the vault key (purpose `"dek"`). */
export async function wrapDek(
  vk: CryptoKey,
  dek: CryptoKey,
  provider?: CryptoProvider,
): Promise<WrappedKeyBlob> {
  assertWebCrypto(provider);
  const raw = new Uint8Array(await provider.subtle.exportKey("raw", dek));
  try {
    return await encryptBytes(vk, raw, { purpose: "dek" }, provider);
  } finally {
    zeroize(raw);
  }
}

/** Unwrap a DEK with the vault key. Requires a `"dek"` blob. */
export async function unwrapDek(
  vk: CryptoKey,
  wrapped: unknown,
  provider?: CryptoProvider,
): Promise<CryptoKey> {
  assertWebCrypto(provider);
  const raw = await decryptBytes(vk, wrapped, { purpose: "dek" }, provider);
  try {
    return await createAesKey(raw, { extractable: true, usages: ["encrypt", "decrypt"] }, provider);
  } finally {
    zeroize(raw);
  }
}

// --- metadata --------------------------------------------------------------

/** Encrypt a JSON-serialisable value under the vault key (purpose `"meta"`). */
export async function encryptMetadata(
  vk: CryptoKey,
  value: unknown,
  provider?: CryptoProvider,
): Promise<EncryptedBlob> {
  assertWebCrypto(provider);
  const bytes = utf8(JSON.stringify(value));
  return encryptBytes(vk, bytes, { purpose: "meta" }, provider);
}

/** Decrypt a metadata blob back into a JSON value. Requires a `"meta"` blob. */
export async function decryptMetadata<T = unknown>(
  vk: CryptoKey,
  blob: unknown,
  provider?: CryptoProvider,
): Promise<T> {
  assertWebCrypto(provider);
  const bytes = await decryptBytes(vk, blob, { purpose: "meta" }, provider);
  return JSON.parse(decodeUtf8(bytes)) as T;
}
