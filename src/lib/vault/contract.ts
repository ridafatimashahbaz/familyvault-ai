/**
 * Vault data contract — the browser's acceptance rules (Phase 1, Day 2 Stage A).
 *
 * The server is treated as *untrusted storage*. Every payload read back from it
 * is validated here, in the browser, before anything is handed to Web Crypto, so
 * a malformed or purpose-mismatched blob never reaches `SubtleCrypto`, and a
 * record that smuggles in cleartext document fields is rejected even though those
 * fields would only be ignored.
 *
 * The rules are deliberately the same ones `src/lib/services/vault.ts` applies on
 * the way in — the client does not assume the server enforced them.
 */

import { validateEncryptedBlob, validateKdfParams } from "@vault/crypto";
import { VaultCryptoError } from "@vault/errors";
import type { DocumentRecord, VaultMaterial } from "@vault/types";

const fail = (message: string) => new VaultCryptoError("MALFORMED_BLOB", message);

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw fail(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function allowlist(record: Record<string, unknown>, allowed: string[], what: string): void {
  const keys = Object.keys(record);
  if (keys.length !== allowed.length || !allowed.every((key) => keys.includes(key))) {
    throw fail(`${what} must contain exactly these fields: ${allowed.join(", ")}`);
  }
}

/**
 * Document ids are opaque by contract. Same rule as the IndexedDB store
 * (`store.ts`) and the `.fvault` export parser (`export.ts`), so a server-supplied
 * id can never carry a filename, a title or a path segment.
 */
const OPAQUE_ID = /^[A-Za-z0-9_-]{16,64}$/;

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isoTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) {
    throw fail(`${field} must be an ISO-8601 UTC timestamp`);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw fail(`${field} is not a real date`);
  return new Date(parsed).toISOString();
}

const MATERIAL_FIELDS = ["kdf", "createdAt", "wrappedByPassphrase", "wrappedByRecoveryKey"];

/** Validates the four-field `VaultMaterial` shape returned by `GET /api/vault/material`. */
export function parseVaultMaterial(raw: unknown): VaultMaterial {
  const record = asRecord(raw, "vault material");
  allowlist(record, MATERIAL_FIELDS, "vault material");

  return {
    kdf: validateKdfParams(record.kdf, "MALFORMED_BLOB"),
    createdAt: isoTimestamp(record.createdAt, "material.createdAt"),
    wrappedByPassphrase: validateEncryptedBlob(record.wrappedByPassphrase, {
      purpose: "vk:passphrase",
    }),
    wrappedByRecoveryKey: validateEncryptedBlob(record.wrappedByRecoveryKey, {
      purpose: "vk:recovery",
    }),
  };
}

const RECORD_FIELDS = ["id", "createdAt", "updatedAt", "content", "wrappedDek", "metadata"];

/** Validates one `DocumentRecord` as it arrives from the server or from disk. */
export function parseDocumentRecord(raw: unknown): DocumentRecord {
  const record = asRecord(raw, "document record");
  allowlist(record, RECORD_FIELDS, "document record");

  if (typeof record.id !== "string" || !OPAQUE_ID.test(record.id)) {
    throw fail("document id must be an opaque 16-64 character token");
  }

  return {
    id: record.id,
    createdAt: isoTimestamp(record.createdAt, "record.createdAt"),
    updatedAt: isoTimestamp(record.updatedAt, "record.updatedAt"),
    content: validateEncryptedBlob(record.content, { purpose: "content" }),
    wrappedDek: validateEncryptedBlob(record.wrappedDek, { purpose: "dek" }),
    metadata: validateEncryptedBlob(record.metadata, { purpose: "meta" }),
  };
}

/**
 * The structural inventory the server is able to publish: opaque ids, byte sizes
 * and timestamps. It is the *only* cleartext the browser accepts about a private
 * document, and it is exactly what the server can already see on its own disk.
 */
export type VaultInventoryEntry = {
  id: string;
  sizeBytes: number;
  updatedAt: string;
};

const INVENTORY_FIELDS = ["id", "sizeBytes", "updatedAt"];

export function parseVaultInventory(raw: unknown): VaultInventoryEntry[] {
  if (!Array.isArray(raw)) throw fail("inventory must be an array");

  return raw.map((entry) => {
    const record = asRecord(entry, "inventory entry");
    allowlist(record, INVENTORY_FIELDS, "inventory entry");

    if (typeof record.id !== "string" || !OPAQUE_ID.test(record.id)) {
      throw fail("inventory id must be an opaque 16-64 character token");
    }
    if (typeof record.sizeBytes !== "number" || !Number.isInteger(record.sizeBytes) || record.sizeBytes < 0) {
      throw fail("sizeBytes must be a non-negative integer");
    }

    return {
      id: record.id,
      sizeBytes: record.sizeBytes,
      updatedAt: isoTimestamp(record.updatedAt, "entry.updatedAt"),
    };
  });
}

/** Envelope of `GET /api/vault/material`; `null` means "this account has no vault yet". */
export function parseMaterialEnvelope(raw: unknown): VaultMaterial | null {
  if (raw === null || raw === undefined) return null;
  return parseVaultMaterial(raw);
}
