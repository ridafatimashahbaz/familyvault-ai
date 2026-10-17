/**
 * Vault crypto — shared types.
 *
 * Pure type declarations only (no runtime imports), so every other vault
 * module and the test suite can depend on this file without pulling code in.
 *
 * Encodings are deliberately JSON/IndexedDB-friendly: all binary values are
 * base64 strings, so a blob can be stored or exported without `Buffer` or any
 * Node-specific helper.
 */

/** Domain-separation context for an encrypted blob. Never mix these up. */
export type WrapPurpose = "vk:passphrase" | "vk:recovery" | "dek" | "content" | "meta";

/**
 * PBKDF2 parameters. The salt is base64 of exactly 16 bytes; `iterations` is
 * bounded by the policy constants in `crypto.ts` and validated on import.
 */
export interface KdfParams {
  name: "PBKDF2-SHA256";
  hash: "SHA-256";
  iterations: number;
  /** base64, 16 bytes. */
  salt: string;
}

/**
 * An AES-256-GCM ciphertext with its metadata.
 *
 * `iv` is base64 of exactly 12 bytes. `ct` is base64 of `ciphertext || 16-byte
 * GCM tag` (i.e. exactly what `SubtleCrypto.encrypt` returns). `purpose` is
 * bound both as a stored field and as the AAD, so a blob wrapped for one
 * purpose is never accepted for another.
 */
export interface EncryptedBlob {
  v: 1;
  alg: "AES-256-GCM";
  purpose: WrapPurpose;
  /** base64, 12 bytes. */
  iv: string;
  /** base64, `ciphertext || 16-byte tag`. */
  ct: string;
}

/** A key wrapped for one purpose: `"vk:passphrase"`, `"vk:recovery"` or `"dek"`. */
export type WrappedKeyBlob = EncryptedBlob;

/**
 * Self-contained recovery kit.
 *
 * **Highly sensitive: anyone holding this file can recover the vault key.**
 *
 * Important honesty note: only `wrappedByRecoveryKey` is cryptographically
 * authenticated by AES-GCM. `format`, `version`, `createdAt`, `recoveryKey`
 * and `kdf` are plain fields — they are validated structurally (see
 * `validateRecoveryKit`) but they are *not* covered by a whole-kit MAC.
 */
export interface RecoveryKit {
  format: "fvault-recovery-kit";
  version: 1;
  /** ISO-8601 string. */
  createdAt: string;
  /** base64, 32 bytes — the raw recovery key. */
  recoveryKey: string;
  wrappedByRecoveryKey: WrappedKeyBlob;
  kdf: KdfParams;
}

/**
 * The persistent vault record: everything needed to unlock the vault, minus
 * any usable key material. The server/disk never sees the passphrase, the
 * recovery key or the vault key itself.
 */
export interface VaultMaterial {
  kdf: KdfParams;
  /** ISO-8601 creation time, carried into the recovery kit. */
  createdAt: string;
  /** VK wrapped under the passphrase-derived key. */
  wrappedByPassphrase: WrappedKeyBlob;
  /** VK wrapped under the recovery key. */
  wrappedByRecoveryKey: WrappedKeyBlob;
}

/**
 * Web Crypto provider. The type **explicitly admits absence** (`undefined`), so
 * the fail-closed path is a genuine, testable state rather than a type lie.
 * The vault primitives never read `globalThis.crypto` implicitly — callers pass
 * a provider (or `defaultCrypto()`), which is what makes the absent case real.
 */
export type CryptoProvider = Crypto | undefined;

/**
 * One persisted document.
 *
 * Only already-encrypted values are stored: `content` (file bytes), `metadata`
 * (a JSON descriptor) and `wrappedDek` (the per-document key, itself wrapped by
 * the vault key). `id`, `createdAt` and `updatedAt` are cleartext structural
 * metadata — deliberately opaque so no plaintext leaks through them.
 */
export interface DocumentRecord {
  /** Opaque; must match `/^[A-Za-z0-9_-]{16,64}$/` (no plaintext leakage). */
  id: string;
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601. */
  updatedAt: string;
  content: EncryptedBlob;
  wrappedDek: WrappedKeyBlob;
  metadata: EncryptedBlob;
}

/**
 * The single-file encrypted backup (`.fvault`).
 *
 * Already-encrypted throughout: it holds wrapped key blobs and ciphertext only,
 * never the passphrase, the vault key, the passphrase-derived key or the
 * recovery key. A `.fvault` alone cannot be decrypted without the passphrase —
 * or, independently, the recovery kit (which opens the `vk:recovery` path).
 */
export interface VaultExport {
  format: "fvault-export";
  version: 1;
  /** ISO-8601. */
  createdAt: string;
  material: VaultMaterial;
  documents: DocumentRecord[];
}
