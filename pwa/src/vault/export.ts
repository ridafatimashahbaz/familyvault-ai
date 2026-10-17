/**
 * Vault export — the single-file encrypted backup (`.fvault`) (P4).
 *
 * The export is already-encrypted throughout: wrapped key blobs and ciphertext
 * only. It never contains the passphrase, the vault key, the passphrase-derived
 * key or the recovery key, so a `.fvault` alone cannot be decrypted without the
 * passphrase — or, independently, the recovery kit (the `vk:recovery` path).
 *
 * `parseExport` is strict: it rejects an unrecognised shape (missing *or* extra
 * fields), a wrong-purpose or malformed blob, an illegal id, out-of-bounds KDF
 * parameters and non-array documents — all with `CORRUPT_EXPORT`, before any
 * value is trusted.
 *
 * `importExport` validates the whole export *before* opening a transaction, then
 * delegates to `store.importAll`, which writes everything in a single IndexedDB
 * transaction and refuses a non-empty vault (`VAULT_NOT_EMPTY`) rather than
 * overwrite or mix.
 */

import { validateEncryptedBlob, validateKdfParams } from "./crypto";
import { VaultStoreError } from "./errors";
import type { VaultStore } from "./store";
import type {
  DocumentRecord,
  EncryptedBlob,
  KdfParams,
  VaultExport,
  VaultMaterial,
  WrapPurpose,
} from "./types";

export type { VaultExport } from "./types";

const EXPORT_FORMAT = "fvault-export" as const;
const EXPORT_VERSION = 1 as const;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

function corrupt(message: string): never {
  throw new VaultStoreError("CORRUPT_EXPORT", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(record: Record<string, unknown>, allowed: string[], path: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) corrupt(`${path} has an unexpected field "${key}"`);
  }
}

function parseIso(value: unknown, path: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    corrupt(`${path} must be an ISO-8601 timestamp`);
  }
  return value;
}

function parseKdf(value: unknown): KdfParams {
  if (!isRecord(value)) corrupt("kdf must be an object");
  assertExactKeys(value, ["name", "hash", "iterations", "salt"], "kdf");
  try {
    return validateKdfParams(value, "MALFORMED_BLOB");
  } catch {
    corrupt("kdf parameters are invalid");
  }
}

function parseBlob(value: unknown, purpose: WrapPurpose, path: string): EncryptedBlob {
  if (!isRecord(value)) corrupt(`${path} must be an encrypted blob`);
  assertExactKeys(value, ["v", "alg", "purpose", "iv", "ct"], path);
  try {
    const blob = validateEncryptedBlob(value, { purpose });
    return { v: 1, alg: "AES-256-GCM", purpose, iv: blob.iv, ct: blob.ct };
  } catch {
    corrupt(`${path} is not a valid "${purpose}" blob`);
  }
}

function parseMaterial(value: unknown): VaultMaterial {
  if (!isRecord(value)) corrupt("export.material must be an object");
  assertExactKeys(
    value,
    ["kdf", "createdAt", "wrappedByPassphrase", "wrappedByRecoveryKey"],
    "export.material",
  );
  return {
    kdf: parseKdf(value.kdf),
    createdAt: parseIso(value.createdAt, "export.material.createdAt"),
    wrappedByPassphrase: parseBlob(
      value.wrappedByPassphrase,
      "vk:passphrase",
      "export.material.wrappedByPassphrase",
    ),
    wrappedByRecoveryKey: parseBlob(
      value.wrappedByRecoveryKey,
      "vk:recovery",
      "export.material.wrappedByRecoveryKey",
    ),
  };
}

function parseDocument(value: unknown, path: string): DocumentRecord {
  if (!isRecord(value)) corrupt(`${path} must be an object`);
  assertExactKeys(
    value,
    ["id", "createdAt", "updatedAt", "content", "wrappedDek", "metadata"],
    path,
  );
  if (typeof value.id !== "string" || !DOCUMENT_ID_PATTERN.test(value.id)) {
    corrupt(`${path}.id must be 16–64 base64url characters`);
  }
  return {
    id: value.id,
    createdAt: parseIso(value.createdAt, `${path}.createdAt`),
    updatedAt: parseIso(value.updatedAt, `${path}.updatedAt`),
    content: parseBlob(value.content, "content", `${path}.content`),
    wrappedDek: parseBlob(value.wrappedDek, "dek", `${path}.wrappedDek`),
    metadata: parseBlob(value.metadata, "meta", `${path}.metadata`),
  };
}

/** Strictly validate and normalise any candidate export value. */
function parseExportValue(value: unknown): VaultExport {
  if (!isRecord(value)) corrupt("export must be an object");
  assertExactKeys(value, ["format", "version", "createdAt", "material", "documents"], "export");
  if (value.format !== EXPORT_FORMAT) corrupt("unrecognised export format");
  if (value.version !== EXPORT_VERSION) {
    corrupt(`unsupported export version: ${String(value.version)}`);
  }
  const createdAt = parseIso(value.createdAt, "export.createdAt");
  const material = parseMaterial(value.material);
  if (!Array.isArray(value.documents)) corrupt("export.documents must be an array");
  const documents = value.documents.map((document, index) =>
    parseDocument(document, `export.documents[${index}]`),
  );
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, createdAt, material, documents };
}

/**
 * Build an export from material and documents. Validates + normalises its input
 * so the returned value is always well-formed and round-trips through JSON.
 */
export function buildExport(
  material: VaultMaterial,
  documents: DocumentRecord[],
  now: Date = new Date(),
): VaultExport {
  return parseExportValue({
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    createdAt: now.toISOString(),
    material,
    documents,
  });
}

/** Deterministic JSON (fixed key order, no whitespace). */
export function serializeExport(exp: VaultExport): string {
  return JSON.stringify(parseExportValue(exp));
}

/** Strict parse of a `.fvault` file. Throws `CORRUPT_EXPORT` on any problem. */
export function parseExport(text: string): VaultExport {
  if (typeof text !== "string") corrupt("export text must be a string");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    corrupt("export is not valid JSON");
  }
  return parseExportValue(parsed);
}

/**
 * Restore an export into a store. Validates the whole export before any
 * transaction, then writes atomically. A non-empty vault is rejected.
 */
export async function importExport(store: VaultStore, exp: VaultExport): Promise<void> {
  const validated = parseExportValue(exp);
  await store.importAll(validated.material, validated.documents);
}

/** `familyvault-YYYY-MM-DD.fvault` (UTC). */
export function exportFilename(now: Date = new Date()): string {
  return `familyvault-${now.toISOString().slice(0, 10)}.fvault`;
}
