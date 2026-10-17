/**
 * Private documents — browser-side sealing and opening (Phase 1, Day 2 Stage C).
 *
 * Every step here uses the reviewed P3/P4 primitives; nothing new is invented:
 *
 *   generateDek      → one fresh AES-256 key per document
 *   encryptBytes     → AES-256-GCM(content) under that DEK, purpose "content"
 *   wrapDek          → the DEK wrapped under the vault key, purpose "dek"
 *   encryptMetadata  → the file name and descriptor under the vault key, purpose "meta"
 *   decryptBytes / unwrapDek / decryptMetadata → the read path, same purposes
 *
 * `encryptBytes` draws a fresh random IV for every call, so two uploads of the
 * same file produce different ciphertext, and each document's DEK is used for
 * exactly one encryption. The AAD is fixed per purpose, so a "dek" blob can
 * never be replayed as a "content" blob for another document.
 *
 * The plaintext file bytes exist only in this tab's memory: they are handed
 * straight to Web Crypto and never logged, never placed in a request, and never
 * sent to OCR, a summariser or any third party.
 */

import { defaultCrypto, decryptBytes, encryptBytes } from "@vault/crypto";
import { isVaultStoreError } from "@vault/errors";
import {
  decryptMetadata,
  encryptMetadata,
  generateDek,
  unwrapDek,
  wrapDek,
} from "@vault/keys";
import { newDocumentId } from "@vault/store";
import type { DocumentRecord } from "@vault/types";

import { parseDocumentRecord } from "./contract";
import {
  fetchVaultDocument,
  listVaultDocuments,
  removeVaultDocument,
  storeVaultDocument,
} from "./client";
import { requireVaultKey } from "./session";
import { vaultStore } from "./storage";

/**
 * What travels with a private document. Deliberately small, and encrypted:
 * the server stores the ciphertext of this object, never its contents.
 */
export type PrivateDocumentMeta = {
  /** Original file name as the user knows it. Cleartext only inside the encrypted metadata blob. */
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Optional human label, e.g. "Nani's passport". */
  label?: string;
  /** Optional family member this document belongs to. */
  person?: string;
};

export type PrivateDocumentListing = {
  id: string;
  updatedAt: string;
  /** Reported by the account; absent for a document that only exists on this device. */
  sizeBytes?: number;
  /**
   * Decrypted name and label. Only available for records this device already
   * holds — listing the account never fetches and decrypts every document.
   */
  meta?: PrivateDocumentMeta;
  onThisDevice: boolean;
  onAccount: boolean;
};

/** Encrypts bytes in this tab and keeps the record in IndexedDB. Returns the opaque record. */
export async function sealBytes(
  bytes: Uint8Array<ArrayBuffer>,
  meta: PrivateDocumentMeta,
): Promise<DocumentRecord> {
  const provider = defaultCrypto();
  const vk = requireVaultKey();

  const dek = await generateDek(provider);
  const content = await encryptBytes(dek, bytes, { purpose: "content" }, provider);
  const wrappedDek = await wrapDek(vk, dek, provider);
  const metadata = await encryptMetadata(vk, meta, provider);

  const now = new Date().toISOString();
  const record = parseDocumentRecord({
    id: newDocumentId(provider),
    createdAt: now,
    updatedAt: now,
    content,
    wrappedDek,
    metadata,
  });

  await (await vaultStore()).putDocument(record);
  return record;
}

export async function sealFile(file: File): Promise<DocumentRecord> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return sealBytes(bytes, {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });
}

/** Uploads one already-encrypted record to the account. */
export async function syncPrivateDocument(record: DocumentRecord): Promise<{ id: string; sizeBytes: number }> {
  return storeVaultDocument(record);
}

/**
 * One row per document id, merging what the account reports with what this
 * device holds. Sizes and write times come from the account's structural
 * inventory; a decrypted name is only ever shown for a record this device
 * already has, so a listing never fetches and decrypts the whole vault.
 */
export async function listPrivateDocuments(): Promise<PrivateDocumentListing[]> {
  const [items, local] = await Promise.all([listVaultDocuments(), (await vaultStore()).listDocuments()]);

  const byId = new Map<string, PrivateDocumentListing>();
  for (const entry of items) {
    byId.set(entry.id, {
      id: entry.id,
      updatedAt: entry.updatedAt,
      sizeBytes: entry.sizeBytes,
      onThisDevice: false,
      onAccount: true,
    });
  }

  for (const record of local) {
    const existing = byId.get(record.id);
    const meta = isUnlocked() ? await readMeta(record) : undefined;
    byId.set(record.id, {
      ...existing,
      id: record.id,
      updatedAt: existing?.updatedAt ?? record.updatedAt,
      onThisDevice: true,
      onAccount: Boolean(existing),
      ...(meta ? { meta } : {}),
    });
  }

  return [...byId.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function isUnlocked(): boolean {
  try {
    requireVaultKey();
    return true;
  } catch {
    return false;
  }
}

async function readMeta(record: DocumentRecord): Promise<PrivateDocumentMeta | undefined> {
  try {
    return await decryptMetadata<PrivateDocumentMeta>(
      requireVaultKey(),
      record.metadata,
      defaultCrypto(),
    );
  } catch {
    return undefined;
  }
}

/**
 * Fetches the account copy (so a second device works), falling back to this
 * device's copy, then decrypts it here. Tampered ciphertext fails
 * authentication in `decryptBytes`; it never returns partial bytes.
 */
export async function openPrivateDocument(id: string): Promise<{ bytes: Uint8Array; meta: PrivateDocumentMeta }> {
  let record: DocumentRecord;
  try {
    record = await fetchVaultDocument(id);
  } catch {
    const local = await (await vaultStore()).getDocument(id);
    if (!local) throw new Error("That private document could not be found.");
    record = parseDocumentRecord(local);
  }

  const vk = requireVaultKey();
  const provider = defaultCrypto();
  const dek = await unwrapDek(vk, record.wrappedDek, provider);
  const bytes = await decryptBytes(dek, record.content, { purpose: "content" }, provider);
  const meta = await decryptMetadata<PrivateDocumentMeta>(vk, record.metadata, provider);

  return { bytes, meta };
}

/**
 * Removes a private document from this device *and* from the account. A document
 * this device only ever saw on the account has no local row, so that one absence
 * is not an error — the account copy still has to go.
 */
export async function deletePrivateDocument(id: string): Promise<void> {
  try {
    await (await vaultStore()).deleteDocument(id);
  } catch (error) {
    if (!(isVaultStoreError(error) && error.code === "NOT_FOUND")) throw error;
  }
  await removeVaultDocument(id);
}
