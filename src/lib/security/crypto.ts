import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";

import { env, isProduction } from "@/lib/env";

/**
 * Documents are encrypted at rest with AES-256-GCM.
 *
 * On-disk layout of an encrypted file:
 *   bytes 0-3    magic "FVLT"
 *   byte  4      format version
 *   bytes 5-16   IV (12 bytes, GCM standard)
 *   bytes 17-32  auth tag (16 bytes)
 *   bytes 33+    ciphertext
 *
 * The auth tag means any tampering with the file makes decryption fail
 * instead of returning corrupted plaintext.
 */

const MAGIC = Buffer.from("FVLT", "ascii");
const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1 + IV_LENGTH + TAG_LENGTH;
const SCRYPT_SALT = "familyvault-ai::document-key::v1";

let cachedKey: Buffer | null = null;
let cachedSource = "";

export type EncryptionStatus = "encrypted" | "derived" | "plaintext";

/**
 * Thrown when a stored blob cannot be turned back into plaintext. The messages
 * are written for end users, so a route handler can return them as-is.
 */
export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}

function resolvePassphrase(): { passphrase: string; source: string } | null {
  const e = env();

  if (e.DOCUMENT_ENCRYPTION_KEY) {
    return { passphrase: e.DOCUMENT_ENCRYPTION_KEY, source: "DOCUMENT_ENCRYPTION_KEY" };
  }
  if (e.AUTH_SECRET) {
    // Development convenience only: better than storing files in the clear,
    // but the key is not independent of the session secret.
    return { passphrase: e.AUTH_SECRET, source: "AUTH_SECRET" };
  }
  return null;
}

function getKey(): { key: Buffer; status: EncryptionStatus } {
  const resolved = resolvePassphrase();

  if (!resolved) {
    if (isProduction()) {
      throw new Error(
        "DOCUMENT_ENCRYPTION_KEY is required in production: refusing to store documents unencrypted.",
      );
    }
    return { key: Buffer.alloc(0), status: "plaintext" };
  }

  const status: EncryptionStatus = resolved.source === "AUTH_SECRET" ? "derived" : "encrypted";

  if (cachedKey && cachedSource === resolved.source) {
    return { key: cachedKey, status };
  }

  cachedKey = scryptSync(resolved.passphrase, SCRYPT_SALT, 32);
  cachedSource = resolved.source;

  if (status === "derived") {
    console.warn(
      "[security] DOCUMENT_ENCRYPTION_KEY is not set; deriving the document key from AUTH_SECRET. " +
        "Set a dedicated DOCUMENT_ENCRYPTION_KEY before handling real documents.",
    );
  }

  return { key: cachedKey, status };
}

export function encryptionStatus(): EncryptionStatus {
  return getKey().status;
}

export function encryptBuffer(plaintext: Buffer): { blob: Buffer; status: EncryptionStatus } {
  const { key, status } = getKey();
  if (status === "plaintext") return { blob: plaintext, status };

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return { blob: Buffer.concat([MAGIC, Buffer.from([VERSION]), iv, tag, ciphertext]), status };
}

export function decryptBuffer(blob: Buffer): Buffer {
  if (!isEncryptedBlob(blob)) {
    // File was stored before encryption was configured.
    return blob;
  }

  const { key, status } = getKey();
  if (status === "plaintext") {
    throw new DecryptionError(
      "This document is encrypted but no encryption key is configured. " +
        "Restore DOCUMENT_ENCRYPTION_KEY to read it.",
    );
  }

  const version = blob[MAGIC.length];
  if (version !== VERSION) {
    throw new DecryptionError(`Unsupported document encryption version: ${version}`);
  }

  const iv = blob.subarray(HEADER_LENGTH - TAG_LENGTH - IV_LENGTH, HEADER_LENGTH - TAG_LENGTH);
  const tag = blob.subarray(HEADER_LENGTH - TAG_LENGTH, HEADER_LENGTH);
  const ciphertext = blob.subarray(HEADER_LENGTH);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new DecryptionError(
      "Decryption failed: the file has been modified or the encryption key does not match.",
    );
  }
}

export function isEncryptedBlob(blob: Buffer): boolean {
  return (
    blob.length >= HEADER_LENGTH &&
    blob.subarray(0, MAGIC.length).equals(MAGIC) &&
    blob[MAGIC.length] === VERSION
  );
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Length-safe comparison for any secret material. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
