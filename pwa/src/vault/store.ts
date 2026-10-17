/**
 * Vault storage — browser-side IndexedDB persistence (P4).
 *
 * This module persists **encrypted material only**: the vault material (wrapped
 * key blobs) and per-document records (ciphertext, wrapped DEK, encrypted
 * metadata) plus cleartext structural fields (opaque ids and ISO timestamps).
 *
 * It never persists — and never accepts — usable key material:
 *  - the passphrase, the vault key (VK), the passphrase-derived key (PK), the
 *    recovery key (RK) and unwrapped DEKs are all rejected before any write;
 *  - `assertNoKeyMaterial` walks records *recursively* and rejects a `CryptoKey`
 *    or a raw byte view anywhere inside them.
 *
 * That guard is a **defensive check, not a security boundary**: it cannot prove
 * that an arbitrary string or opaque value contains no *encoded* secret. The
 * primary protection is the narrow schema below — only two object stores, only
 * the allowlisted fields, and every write reconstructs the stored value from
 * those fields rather than writing the caller's object wholesale.
 *
 * IndexedDB is not a security boundary either: anyone with access to the browser
 * profile, or malicious same-origin JS, can read the stored ciphertext.
 * Confidentiality rests solely on the keys never being stored.
 *
 * Resolution of every mutation is driven by `transaction.oncomplete`, so a
 * failure rolls the whole transaction back — there are no partial writes. No
 * plaintext is ever decrypted here, and there is no network access.
 */

import {
  b64encode,
  randomBytes,
  validateEncryptedBlob,
  validateKdfParams,
} from "./crypto";
import { isVaultStoreError, VaultStoreError, type VaultStoreErrorCode } from "./errors";
import type {
  CryptoProvider,
  DocumentRecord,
  EncryptedBlob,
  KdfParams,
  VaultMaterial,
  WrapPurpose,
} from "./types";

export type { DocumentRecord, VaultExport } from "./types";

const DB_NAME = "fv-vault";
const DB_VERSION = 1;
const MATERIAL_KEY = "vault-material";
const META_STORE = "meta";
const DOCS_STORE = "documents";
const CREATED_AT_INDEX = "createdAt";

/** Opaque ids only: 16–64 base64url characters, so no plaintext can leak. */
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

function storeError(code: VaultStoreErrorCode, message: string): VaultStoreError {
  return new VaultStoreError(code, message);
}

// --- validation (fail-closed, before any write) ----------------------------

/** Recursively reject any usable key material (`CryptoKey`) or raw byte view. */
function assertNoKeyMaterial(value: unknown, path = "record"): void {
  if (value === null) return;
  const kind = typeof value;
  if (kind === "string" || kind === "number" || kind === "boolean" || kind === "undefined") {
    return;
  }
  if (kind === "function") throw storeError("INVALID_RECORD", `unexpected value at ${path}`);
  if (typeof CryptoKey !== "undefined" && value instanceof CryptoKey) {
    throw storeError("INVALID_RECORD", `usable key material is not allowed at ${path}`);
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    throw storeError("INVALID_RECORD", `raw bytes are not allowed at ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoKeyMaterial(item, `${path}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    assertNoKeyMaterial(nested, `${path}.${key}`);
  }
}

function assertIsoTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw storeError("INVALID_RECORD", `${field} must be an ISO-8601 timestamp`);
  }
  return value;
}

function kdfOrInvalid(value: unknown): KdfParams {
  try {
    return validateKdfParams(value);
  } catch {
    throw storeError("INVALID_RECORD", "invalid KDF parameters");
  }
}

function blobOrInvalid(value: unknown, purpose: WrapPurpose): EncryptedBlob {
  try {
    const blob = validateEncryptedBlob(value, { purpose });
    return { v: 1, alg: "AES-256-GCM", purpose, iv: blob.iv, ct: blob.ct };
  } catch {
    throw storeError("INVALID_RECORD", `invalid or wrong-purpose blob (expected "${purpose}")`);
  }
}

/** Validate material and return a reconstructed allowlisted value (extra keys dropped). */
function prepareMaterial(material: unknown): VaultMaterial {
  if (!material || typeof material !== "object" || Array.isArray(material)) {
    throw storeError("INVALID_RECORD", "vault material must be an object");
  }
  assertNoKeyMaterial(material, "material");
  const record = material as Record<string, unknown>;
  return {
    kdf: kdfOrInvalid(record.kdf),
    createdAt: assertIsoTimestamp(record.createdAt, "material.createdAt"),
    wrappedByPassphrase: blobOrInvalid(record.wrappedByPassphrase, "vk:passphrase"),
    wrappedByRecoveryKey: blobOrInvalid(record.wrappedByRecoveryKey, "vk:recovery"),
  };
}

/** Validate a document and return a reconstructed allowlisted value (extra keys dropped). */
function prepareDocument(document: unknown): DocumentRecord {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw storeError("INVALID_RECORD", "document must be an object");
  }
  assertNoKeyMaterial(document, "document");
  const record = document as Record<string, unknown>;
  if (typeof record.id !== "string" || !DOCUMENT_ID_PATTERN.test(record.id)) {
    throw storeError("INVALID_RECORD", "document id must be 16–64 base64url characters");
  }
  return {
    id: record.id,
    createdAt: assertIsoTimestamp(record.createdAt, "document.createdAt"),
    updatedAt: assertIsoTimestamp(record.updatedAt, "document.updatedAt"),
    content: blobOrInvalid(record.content, "content"),
    wrappedDek: blobOrInvalid(record.wrappedDek, "dek"),
    metadata: blobOrInvalid(record.metadata, "meta"),
  };
}

// --- IndexedDB plumbing ----------------------------------------------------

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const unavailable = () =>
      storeError("STORAGE_UNAVAILABLE", "Failed to open the vault database.");
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch {
      reject(unavailable());
      return;
    }

    request.onupgradeneeded = (event) => {
      // Unknown/future schema versions fail closed rather than guessing.
      if ((event.newVersion ?? DB_VERSION) !== DB_VERSION) {
        request.transaction?.abort();
        return;
      }
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
      if (!db.objectStoreNames.contains(DOCS_STORE)) {
        const documents = db.createObjectStore(DOCS_STORE, { keyPath: "id" });
        documents.createIndex(CREATED_AT_INDEX, "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(unavailable());
    request.onblocked = () =>
      reject(storeError("STORAGE_UNAVAILABLE", "The vault database is blocked by another connection."));
  });
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function awaitTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function mapWriteError(error: unknown): VaultStoreError {
  if (isVaultStoreError(error)) return error;
  const name = (error as { name?: string } | null)?.name;
  if (name === "QuotaExceededError") {
    return storeError("QUOTA_EXCEEDED", "The browser storage quota was exceeded.");
  }
  return storeError("STORAGE_UNAVAILABLE", "The vault write could not be completed.");
}

// --- public store ----------------------------------------------------------

export interface VaultStore {
  getMaterial(): Promise<VaultMaterial | null>;
  putMaterial(material: VaultMaterial): Promise<void>;
  getDocument(id: string): Promise<DocumentRecord | null>;
  listDocuments(): Promise<DocumentRecord[]>;
  putDocument(record: DocumentRecord): Promise<void>;
  /** Atomic metadata-only CAS. False means changed or deleted; retry crypto outside IDB. */
  compareAndSwapDocumentMetadata(
    id: string,
    previous: { metadata: Pick<EncryptedBlob, "ct" | "iv">; updatedAt: string },
    replacement: { metadata: EncryptedBlob; updatedAt: string },
  ): Promise<boolean>;
  deleteDocument(id: string): Promise<void>;
  countDocuments(): Promise<number>;
  clear(): Promise<void>;
  /**
   * Atomic, all-or-nothing restore used by `export.ts`. Validates, rejects a
   * non-empty vault (`VAULT_NOT_EMPTY`) and writes material + every document in
   * a single transaction spanning both stores.
   */
  importAll(material: VaultMaterial, documents: DocumentRecord[]): Promise<void>;
  close(): void;
}

function createStore(db: IDBDatabase): VaultStore {
  return {
    async getMaterial() {
      const transaction = db.transaction(META_STORE, "readonly");
      const value = await promisifyRequest(transaction.objectStore(META_STORE).get(MATERIAL_KEY));
      return (value as VaultMaterial | undefined) ?? null;
    },

    async putMaterial(material) {
      const value = prepareMaterial(material);
      const transaction = db.transaction(META_STORE, "readwrite");
      try {
        transaction.objectStore(META_STORE).put(value, MATERIAL_KEY);
        await awaitTransaction(transaction);
      } catch (error) {
        throw mapWriteError(error);
      }
    },

    async getDocument(id) {
      const transaction = db.transaction(DOCS_STORE, "readonly");
      const value = await promisifyRequest(transaction.objectStore(DOCS_STORE).get(id));
      return (value as DocumentRecord | undefined) ?? null;
    },

    async listDocuments() {
      const transaction = db.transaction(DOCS_STORE, "readonly");
      const index = transaction.objectStore(DOCS_STORE).index(CREATED_AT_INDEX);
      const values = await promisifyRequest(index.getAll());
      return values as DocumentRecord[];
    },

    async putDocument(record) {
      const value = prepareDocument(record);
      const transaction = db.transaction(DOCS_STORE, "readwrite");
      try {
        transaction.objectStore(DOCS_STORE).put(value);
        await awaitTransaction(transaction);
      } catch (error) {
        throw mapWriteError(error);
      }
    },

    async compareAndSwapDocumentMetadata(id, previous, replacement) {
      // All preparation is synchronous and happens before opening a transaction.
      assertNoKeyMaterial(replacement);
      const metadata = blobOrInvalid(replacement.metadata, "meta");
      const updatedAt = assertIsoTimestamp(replacement.updatedAt, "document.updatedAt");
      if (!DOCUMENT_ID_PATTERN.test(id)) {
        throw storeError("INVALID_RECORD", "invalid document id");
      }
      try {
        return await new Promise<boolean>((resolve, reject) => {
          let written = false;
          const transaction = db.transaction(DOCS_STORE, "readwrite");
          const documents = transaction.objectStore(DOCS_STORE);
          const request = documents.get(id);
          request.onsuccess = () => {
            const current = request.result as DocumentRecord | undefined;
            if (!current || current.updatedAt !== previous.updatedAt ||
                current.metadata.ct !== previous.metadata.ct || current.metadata.iv !== previous.metadata.iv) return;
            // Never replace the identity, content or wrapped DEK supplied by another writer.
            documents.put({
              id: current.id, createdAt: current.createdAt, updatedAt,
              content: current.content, wrappedDek: current.wrappedDek, metadata,
            });
            written = true;
          };
          transaction.oncomplete = () => resolve(written);
          transaction.onabort = () => reject(transaction.error);
          transaction.onerror = () => reject(transaction.error);
        });
      } catch (error) {
        throw mapWriteError(error);
      }
    },

    deleteDocument(id) {
      if (typeof id !== "string" || id.length === 0) {
        return Promise.reject(storeError("INVALID_RECORD", "document id is required"));
      }
      return new Promise<void>((resolve, reject) => {
        let missing = false;
        const transaction = db.transaction(DOCS_STORE, "readwrite");
        const store = transaction.objectStore(DOCS_STORE);
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result == null) {
            missing = true;
            transaction.abort();
            return;
          }
          store.delete(id);
        };
        request.onerror = () => transaction.abort();
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => {
          if (missing) reject(storeError("NOT_FOUND", `no document with id "${id}"`));
          else reject(mapWriteError(transaction.error));
        };
      });
    },

    async countDocuments() {
      const transaction = db.transaction(DOCS_STORE, "readonly");
      return promisifyRequest(transaction.objectStore(DOCS_STORE).count());
    },

    async clear() {
      const transaction = db.transaction([META_STORE, DOCS_STORE], "readwrite");
      try {
        transaction.objectStore(META_STORE).clear();
        transaction.objectStore(DOCS_STORE).clear();
        await awaitTransaction(transaction);
      } catch (error) {
        throw mapWriteError(error);
      }
    },

    importAll(material, documents) {
      const value = prepareMaterial(material);
      if (!Array.isArray(documents)) {
        return Promise.reject(storeError("INVALID_RECORD", "documents must be an array"));
      }
      const values = documents.map(prepareDocument);

      return new Promise<void>((resolve, reject) => {
        let notEmpty = false;
        const transaction = db.transaction([META_STORE, DOCS_STORE], "readwrite");
        const meta = transaction.objectStore(META_STORE);
        const docs = transaction.objectStore(DOCS_STORE);

        // Emptiness check and the writes share one transaction, so there is no
        // check-then-write race. Any failure aborts the whole transaction.
        const countRequest = docs.count();
        countRequest.onsuccess = () => {
          if (countRequest.result > 0) {
            notEmpty = true;
            transaction.abort();
            return;
          }
          const materialRequest = meta.get(MATERIAL_KEY);
          materialRequest.onsuccess = () => {
            if (materialRequest.result != null) {
              notEmpty = true;
              transaction.abort();
              return;
            }
            meta.put(value, MATERIAL_KEY);
            for (const document of values) docs.put(document);
          };
          materialRequest.onerror = () => transaction.abort();
        };
        countRequest.onerror = () => transaction.abort();

        transaction.oncomplete = () => resolve();
        transaction.onabort = () => {
          if (notEmpty) {
            reject(
              storeError("VAULT_NOT_EMPTY", "the vault already contains data; refusing to import"),
            );
          } else {
            reject(mapWriteError(transaction.error));
          }
        };
      });
    },

    close() {
      db.close();
    },
  };
}

export async function openVaultStore(options: {
  factory?: IDBFactory;
  storage?: StorageManager;
} = {}): Promise<VaultStore> {
  const factory =
    options.factory ??
    (typeof globalThis !== "undefined" ? globalThis.indexedDB : undefined);
  if (!factory) {
    throw storeError("STORAGE_UNAVAILABLE", "IndexedDB is unavailable in this environment.");
  }
  const db = await openDatabase(factory);
  return createStore(db);
}

// --- eviction & identity ---------------------------------------------------

/** Best-effort persistent-storage request. Never throws; unsupported ⇒ `false`. */
export async function requestPersistence(storage?: StorageManager): Promise<boolean> {
  const manager =
    storage ?? (typeof navigator !== "undefined" ? navigator.storage : undefined);
  if (!manager || typeof manager.persist !== "function") return false;
  try {
    return await manager.persist();
  } catch {
    return false;
  }
}

/** Best-effort quota estimate. Never throws; unsupported ⇒ `null`. */
export async function estimateStorage(
  storage?: StorageManager,
): Promise<{ usage?: number; quota?: number } | null> {
  const manager =
    storage ?? (typeof navigator !== "undefined" ? navigator.storage : undefined);
  if (!manager || typeof manager.estimate !== "function") return null;
  try {
    const estimate = await manager.estimate();
    return { usage: estimate.usage, quota: estimate.quota };
  } catch {
    return null;
  }
}

/**
 * A fresh opaque document id: 16 CSPRNG bytes as unpadded base64url (22 chars),
 * so it always satisfies the store's id pattern. Fails closed without Web Crypto.
 */
export function newDocumentId(provider?: CryptoProvider): string {
  const bytes = randomBytes(16, provider);
  return b64encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
