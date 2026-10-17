/**
 * Vault crypto — low-level primitives.
 *
 * Pure WebCrypto helpers with no I/O, no globals read implicitly and no Node
 * built-ins. Everything is fail-closed: inputs are validated *before* any key
 * is derived or any byte is decrypted.
 *
 * Honesty notes:
 *  - `zeroize` is best-effort only. It overwrites a specific buffer; it cannot
 *    prove that garbage-collected or engine-internal copies are erased.
 *  - AES-GCM cannot cryptographically distinguish a wrong key from tampered
 *    ciphertext — both surface as a tag failure (`AUTH_FAILED`). Format and
 *    purpose are validated first, so a well-formed failure means "wrong key or
 *    damaged data".
 */

import { assertWebCrypto, VaultCryptoError, type VaultErrorCode } from "./errors";
import type { CryptoProvider, EncryptedBlob, KdfParams, WrapPurpose } from "./types";

export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const SALT_BYTES = 16;
export const KEY_BYTES = 32;

/**
 * Upper bound, in decoded bytes, on the ciphertext of a *key-wrapping* blob.
 *
 * Such a blob wraps a single 32-byte key, so a well-formed `ct` is exactly 48
 * bytes (32-byte key + 16-byte GCM tag); 256 leaves generous headroom for a
 * future larger wrap format while still bounding what a caller can store.
 * `content` (a whole file) and `meta` (arbitrary metadata) are variable-length
 * and are deliberately **not** capped here.
 */
export const MAX_KEY_WRAP_CT_BYTES = 256;

/** Max decoded `ct` length per purpose; an absent entry means unbounded. */
const MAX_CT_BYTES_BY_PURPOSE: Partial<Record<WrapPurpose, number>> = {
  "vk:passphrase": MAX_KEY_WRAP_CT_BYTES,
  "vk:recovery": MAX_KEY_WRAP_CT_BYTES,
  dek: MAX_KEY_WRAP_CT_BYTES,
};

/**
 * PBKDF2 policy: a hard floor that is never lowered, and a ceiling that stops
 * an imported kit from demanding absurd work. The active count may be raised
 * after benchmarking but is **never** set below the floor.
 */
export const MIN_PBKDF2_ITERATIONS = 600_000;
export const MAX_PBKDF2_ITERATIONS = 10_000_000;
/**
 * Active iteration count. Benchmarked at ~238 ms median on this machine
 * (600k ≈ 141 ms, so it was raised toward the ~250 ms usability guideline);
 * the floor of 600k is never lowered.
 */
export const PBKDF2_ITERATIONS = 1_000_000;

/** Fixed AAD strings — one per purpose, so contexts can never be confused. */
export const AAD_BY_PURPOSE: Record<WrapPurpose, string> = {
  "vk:passphrase": "fvault:v1:vk:passphrase",
  "vk:recovery": "fvault:v1:vk:recovery",
  dek: "fvault:v1:dek",
  content: "fvault:v1:content",
  meta: "fvault:v1:meta",
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * UTF-8 encode into an `ArrayBuffer`-backed view. `TextEncoder.encode` is typed
 * as `ArrayBufferLike`-backed, which Web Crypto's `BufferSource` rejects, so we
 * copy into a plain `Uint8Array<ArrayBuffer>`.
 */
export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(textEncoder.encode(text));
}

export function decodeUtf8(bytes: Uint8Array<ArrayBuffer>): string {
  return textDecoder.decode(bytes);
}

function aadFor(purpose: WrapPurpose): Uint8Array<ArrayBuffer> {
  return utf8(AAD_BY_PURPOSE[purpose]);
}

/**
 * The ambient Web Crypto provider, as a `CryptoProvider`.
 *
 * Exported for convenience so real callers can opt in explicitly. The vault
 * primitives themselves never reach for the global implicitly — that keeps the
 * "no Web Crypto" path honest and testable.
 */
export function defaultCrypto(): CryptoProvider {
  return typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
}

function malformed(message: string): VaultCryptoError {
  return new VaultCryptoError("MALFORMED_BLOB", message);
}

// --- base64 (strict, no Buffer) -------------------------------------------

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i += 1) table[B64_ALPHABET.charCodeAt(i)] = i;
  return table;
})();

export function b64encode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1]! : 0;
    const b2 = has2 ? bytes[i + 2]! : 0;
    out += B64_ALPHABET[b0 >> 2]!;
    out += B64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)]!;
    out += has1 ? B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)]! : "=";
    out += has2 ? B64_ALPHABET[b2 & 0x3f]! : "=";
  }
  return out;
}

function b64Char(input: string, index: number): number {
  const code = input.charCodeAt(index);
  const value = code < 256 ? B64_LOOKUP[code]! : -1;
  if (value < 0) throw malformed("invalid base64 character");
  return value;
}

/**
 * Strict base64 decode. Rejects invalid characters, bad length/padding, and —
 * when `expectedLength` is given — any wrong decoded length. This is the single
 * gate all binary fields pass through, so a truncated or padded blob can never
 * reach the crypto layer.
 */
export function b64decodeStrict(input: string, expectedLength?: number): Uint8Array<ArrayBuffer> {
  if (typeof input !== "string") throw malformed("base64 value must be a string");
  const length = input.length;
  if (length % 4 !== 0) throw malformed("base64 length must be a multiple of 4");

  if (length === 0) {
    if (expectedLength !== undefined && expectedLength !== 0) {
      throw malformed(`expected ${expectedLength} bytes, got 0`);
    }
    return new Uint8Array(0);
  }

  let padding = 0;
  if (input.charCodeAt(length - 1) === 0x3d) padding += 1;
  if (input.charCodeAt(length - 2) === 0x3d) padding += 1;
  if (padding > 2) throw malformed("too much base64 padding");

  const outLength = (length / 4) * 3 - padding;
  const out = new Uint8Array(outLength);
  let cursor = 0;

  for (let i = 0; i < length; i += 4) {
    const isPadC = input.charCodeAt(i + 2) === 0x3d;
    const isPadD = input.charCodeAt(i + 3) === 0x3d;
    const a = b64Char(input, i);
    const b = b64Char(input, i + 1);
    const c = isPadC ? 0 : b64Char(input, i + 2);
    const d = isPadD ? 0 : b64Char(input, i + 3);

    if (isPadC && !isPadD) throw malformed("invalid base64 padding");
    if ((isPadC || isPadD) && i + 4 !== length) throw malformed("base64 padding must be final");

    out[cursor] = (a << 2) | (b >> 4);
    cursor += 1;
    if (!isPadC) {
      out[cursor] = ((b & 0x0f) << 4) | (c >> 2);
      cursor += 1;
    }
    if (!isPadD) {
      out[cursor] = ((c & 0x03) << 6) | d;
      cursor += 1;
    }
  }

  if (cursor !== outLength) throw malformed("base64 decoded to an unexpected length");
  if (expectedLength !== undefined && outLength !== expectedLength) {
    throw malformed(`expected ${expectedLength} bytes, got ${outLength}`);
  }
  return out;
}

// --- randomness & keys -----------------------------------------------------

/** Web Crypto's `getRandomValues` rejects requests larger than this per call. */
const RANDOM_CHUNK = 65_536;

export function randomBytes(length: number, provider?: CryptoProvider): Uint8Array<ArrayBuffer> {
  assertWebCrypto(provider);
  if (!Number.isInteger(length) || length < 0) {
    throw new VaultCryptoError("INVALID_ARGUMENT", "byte length must be a non-negative integer");
  }
  const out = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += RANDOM_CHUNK) {
    provider.getRandomValues(out.subarray(offset, Math.min(offset + RANDOM_CHUNK, length)));
  }
  return out;
}

export async function createAesKey(
  raw: Uint8Array<ArrayBuffer>,
  options: { extractable?: boolean; usages?: KeyUsage[] },
  provider?: CryptoProvider,
): Promise<CryptoKey> {
  assertWebCrypto(provider);
  if (raw.length !== KEY_BYTES) {
    throw new VaultCryptoError("INVALID_ARGUMENT", `AES-256 key must be ${KEY_BYTES} bytes`);
  }
  return provider.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    options.extractable ?? false,
    options.usages ?? ["encrypt", "decrypt"],
  );
}

/**
 * Strictly validate PBKDF2 parameters. `code` selects whether this is user
 * input (`INVALID_ARGUMENT`) or imported material (`MALFORMED_BLOB`).
 */
export function validateKdfParams(
  kdf: unknown,
  code: Extract<VaultErrorCode, "INVALID_ARGUMENT" | "MALFORMED_BLOB"> = "INVALID_ARGUMENT",
): KdfParams {
  const fail = (message: string) => new VaultCryptoError(code, message);
  if (!kdf || typeof kdf !== "object") throw fail("KDF parameters must be an object");
  const record = kdf as Record<string, unknown>;
  if (record.name !== "PBKDF2-SHA256") throw fail("unsupported KDF name");
  if (record.hash !== "SHA-256") throw fail("unsupported KDF hash");
  if (typeof record.iterations !== "number" || !Number.isInteger(record.iterations)) {
    throw fail("iterations must be an integer");
  }
  if (record.iterations < MIN_PBKDF2_ITERATIONS || record.iterations > MAX_PBKDF2_ITERATIONS) {
    throw fail(`iterations must be between ${MIN_PBKDF2_ITERATIONS} and ${MAX_PBKDF2_ITERATIONS}`);
  }
  if (typeof record.salt !== "string") throw fail("salt must be a base64 string");
  try {
    b64decodeStrict(record.salt, SALT_BYTES);
  } catch {
    throw fail(`salt must decode to exactly ${SALT_BYTES} bytes`);
  }
  return {
    name: "PBKDF2-SHA256",
    hash: "SHA-256",
    iterations: record.iterations,
    salt: record.salt,
  };
}

/** Derive the non-extractable passphrase key (PK) from a passphrase. */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  kdf: unknown,
  provider?: CryptoProvider,
): Promise<CryptoKey> {
  assertWebCrypto(provider);
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    throw new VaultCryptoError("INVALID_ARGUMENT", "passphrase must be a non-empty string");
  }
  const params = validateKdfParams(kdf, "INVALID_ARGUMENT");
  const salt = b64decodeStrict(params.salt, SALT_BYTES);
  const base = await provider.subtle.importKey(
    "raw",
    utf8(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return provider.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: params.iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// --- authenticated encryption ---------------------------------------------

export async function encryptBytes(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  options: { purpose: WrapPurpose },
  provider?: CryptoProvider,
): Promise<EncryptedBlob> {
  assertWebCrypto(provider);
  const iv = randomBytes(IV_BYTES, provider);
  const ciphertext = new Uint8Array(
    await provider.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aadFor(options.purpose) },
      key,
      plaintext,
    ),
  );
  return {
    v: 1,
    alg: "AES-256-GCM",
    purpose: options.purpose,
    iv: b64encode(iv),
    ct: b64encode(ciphertext),
  };
}

/**
 * Validate an encrypted blob's structure *before* decryption. Order matters:
 * version → algorithm → purpose → IV length → ciphertext length. A blob that
 * fails any check never reaches `SubtleCrypto.decrypt`.
 */
export function validateEncryptedBlob(
  blob: unknown,
  expected: { purpose: WrapPurpose },
): EncryptedBlob {
  if (!blob || typeof blob !== "object") throw malformed("encrypted blob must be an object");
  const record = blob as Record<string, unknown>;

  if (record.v !== 1) {
    throw new VaultCryptoError("UNSUPPORTED_VERSION", `unsupported blob version: ${String(record.v)}`);
  }
  if (record.alg !== "AES-256-GCM") throw malformed("unsupported blob algorithm");
  if (record.purpose !== expected.purpose) {
    throw malformed(`expected a "${expected.purpose}" blob`);
  }
  if (typeof record.iv !== "string") throw malformed("iv must be a base64 string");
  if (typeof record.ct !== "string") throw malformed("ct must be a base64 string");

  // Bounded key-wrapping blobs: reject a grossly oversized base64 string before
  // decoding it, then confirm on the *decoded* bytes below. `content`/`meta`
  // have no entry here and stay unbounded.
  const maxCt = MAX_CT_BYTES_BY_PURPOSE[expected.purpose];
  if (maxCt !== undefined && record.ct.length > Math.ceil(maxCt / 3) * 4) {
    throw malformed(`ciphertext must be at most ${maxCt} bytes for a "${expected.purpose}" blob`);
  }

  b64decodeStrict(record.iv, IV_BYTES);
  const ct = b64decodeStrict(record.ct);
  if (ct.length < TAG_BYTES) throw malformed("ciphertext is shorter than the authentication tag");
  if (maxCt !== undefined && ct.length > maxCt) {
    throw malformed(`ciphertext must be at most ${maxCt} bytes for a "${expected.purpose}" blob`);
  }

  return { v: 1, alg: "AES-256-GCM", purpose: expected.purpose, iv: record.iv, ct: record.ct };
}

export async function decryptBytes(
  key: CryptoKey,
  blob: unknown,
  expected: { purpose: WrapPurpose },
  provider?: CryptoProvider,
): Promise<Uint8Array<ArrayBuffer>> {
  assertWebCrypto(provider);
  const validated = validateEncryptedBlob(blob, expected);
  const iv = b64decodeStrict(validated.iv, IV_BYTES);
  const ct = b64decodeStrict(validated.ct);
  try {
    const plaintext = await provider.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aadFor(expected.purpose) },
      key,
      ct,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new VaultCryptoError(
      "AUTH_FAILED",
      "Decryption failed: wrong key or damaged data.",
    );
  }
}

/** Best-effort overwrite. **Not** a guarantee of secure erasure — see file header. */
export function zeroize(bytes: Uint8Array): void {
  if (bytes && bytes.length > 0) bytes.fill(0);
}
