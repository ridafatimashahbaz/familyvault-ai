/**
 * Local vault documents — sealing, listing and opening when there is no server.
 *
 * Every step uses the reviewed primitives; nothing new is invented:
 *
 *   generateDek      → one fresh AES-256 key per document
 *   encryptBytes     → AES-256-GCM(content) under that DEK, purpose "content"
 *   wrapDek          → the DEK wrapped under the vault key, purpose "dek"
 *   encryptMetadata  → the title, category and expiry under the vault key, purpose "meta"
 *   decryptBytes / unwrapDek / decryptMetadata → the read path, same purposes
 *
 * `encryptBytes` draws a fresh random IV for every call, so two uploads of the
 * same file produce different ciphertext, and each document's DEK is used for
 * exactly one encryption. The AAD is fixed per purpose, so a "dek" blob can
 * never be replayed as a "content" blob for another document.
 *
 * The plaintext file bytes exist only in this tab's memory: they are handed
 * straight to Web Crypto and never logged and never sent anywhere.
 *
 * The stored descriptor is read back tolerantly: it was written by this same
 * code, so an unreadable field is treated as absent rather than fatal, and an
 * unknown category falls back to "Other" instead of refusing to show the row.
 */

import type { CategoryKey } from "@shared/constants";
import { CATEGORY_KEYS } from "@shared/constants";

import { decryptBytes, defaultCrypto, encryptBytes } from "./crypto";
import { isVaultStoreError } from "./errors";
import { buildExport, importExport, parseExport, serializeExport } from "./export";
import { decryptMetadata, encryptMetadata, generateDek, unwrapDek, wrapDek } from "./keys";
import {
  inspectLocalVault,
  isLocalVaultUnlocked,
  localVaultStore,
  requireLocalVaultKey,
} from "./session";
import { newDocumentId, type DocumentRecord } from "./store";

export type ExpiryReview = { source: "manual" | "recognition"; confirmed: boolean; evidence?: string };
export type DocumentRecognition = { text: string; engine: string; reviewed: boolean };

/**
 * What travels with a document. Deliberately small, and encrypted: it never
 * leaves this device in clear text, not even to a server (there is none).
 */
export type StoredDocumentMeta = {
  /** Title the user knows this document by. */
  name: string;
  mimeType: string;
  sizeBytes: number;
  category: CategoryKey;
  /** `YYYY-MM-DD`, or null when no expiry is tracked. */
  expiryDate: string | null;
  /** Optional: whose document it is, e.g. "Abba". */
  person?: string;
  expiryReview?: ExpiryReview;
  recognition?: DocumentRecognition;
  /** Additive encrypted extensions survive metadata-only updates. */
  [key: string]: unknown;
};

export type VaultDocumentSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Decrypted descriptor — only present while the vault is unlocked. */
  meta?: StoredDocumentMeta;
  /** True when the stored copy could not be opened (it may have been changed). */
  unreadable?: boolean;
};

export type NewDocumentDetails = {
  /** Defaults to the file's own name when left empty. */
  title?: string;
  category: CategoryKey;
  expiryDate?: string | null;
  person?: string;
  expiryReview?: ExpiryReview;
  recognition?: DocumentRecognition;
};

export type VaultDocumentDetailsPatch = {
  category?: CategoryKey;
  expiryDate?: string | null;
  expiryReview?: ExpiryReview;
  recognition?: DocumentRecognition | null;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Strict Gregorian date-only validation; JS date parsing alone rolls February 30 forward. */
export function isValidExpiryDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_ONLY.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeExpiry(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!isValidExpiryDate(value)) throw new Error("That expiry date could not be understood.");
  return value;
}

function objectMeta(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("That document's details could not be read.");
  }
  return value as Record<string, unknown>;
}

function validReview(value: unknown): value is ExpiryReview {
  if (!value || typeof value !== "object") return false;
  const review = value as ExpiryReview;
  return (review.source === "manual" || review.source === "recognition") &&
    typeof review.confirmed === "boolean" && (review.evidence === undefined || typeof review.evidence === "string");
}

function validRecognition(value: unknown): value is DocumentRecognition {
  if (!value || typeof value !== "object") return false;
  const recognition = value as DocumentRecognition;
  return typeof recognition.text === "string" && typeof recognition.engine === "string" &&
    typeof recognition.reviewed === "boolean";
}

function normalizeCategory(value: unknown): CategoryKey {
  return typeof value === "string" && (CATEGORY_KEYS as readonly string[]).includes(value)
    ? (value as CategoryKey)
    : "other";
}

/** Reads a decrypted descriptor without trusting its shape field by field. */
function normalizeMeta(value: unknown): StoredDocumentMeta {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    name: typeof record.name === "string" && record.name.trim() ? record.name : "Untitled document",
    mimeType:
      typeof record.mimeType === "string" && record.mimeType ? record.mimeType : "application/octet-stream",
    sizeBytes: typeof record.sizeBytes === "number" && Number.isFinite(record.sizeBytes) ? record.sizeBytes : 0,
    category: normalizeCategory(record.category),
    expiryDate: isValidExpiryDate(record.expiryDate) ? record.expiryDate : null,
    ...(typeof record.person === "string" && record.person.trim() ? { person: record.person } : {}),
    ...(validReview(record.expiryReview) ? { expiryReview: record.expiryReview } : {}),
    ...(validRecognition(record.recognition) ? { recognition: record.recognition } : {}),
  };
}

/**
 * The write-path counterpart of `normalizeMeta`: an unreadable descriptor is
 * repaired on the way out, but a bad one is refused on the way in, so nothing
 * invalid is ever encrypted into storage.
 */
function prepareMeta(meta: StoredDocumentMeta): StoredDocumentMeta {
  if (typeof meta.name !== "string" || !meta.name.trim()) {
    throw new Error("Give this document a title.");
  }
  if (typeof meta.sizeBytes !== "number" || !Number.isFinite(meta.sizeBytes) || meta.sizeBytes < 0) {
    throw new Error("That file could not be read.");
  }
  if (meta.expiryReview !== undefined && !validReview(meta.expiryReview)) {
    throw new Error("The expiry confirmation could not be saved.");
  }
  if (meta.recognition !== undefined && !validRecognition(meta.recognition)) {
    throw new Error("The reviewed text could not be saved.");
  }
  return {
    ...meta,
    name: meta.name.trim(),
    mimeType: typeof meta.mimeType === "string" && meta.mimeType ? meta.mimeType : "application/octet-stream",
    sizeBytes: meta.sizeBytes,
    category: normalizeCategory(meta.category),
    expiryDate: normalizeExpiry(meta.expiryDate),
    ...(typeof meta.person === "string" && meta.person.trim() ? { person: meta.person.trim() } : {}),
  };
}

/** Encrypts bytes in this tab and keeps the record in this device's storage. */
export async function sealDocumentBytes(
  bytes: Uint8Array<ArrayBuffer>,
  meta: StoredDocumentMeta,
): Promise<{ id: string }> {
  const provider = defaultCrypto();
  const vk = requireLocalVaultKey();
  const descriptor = prepareMeta(meta);

  const dek = await generateDek(provider);
  const content = await encryptBytes(dek, bytes, { purpose: "content" }, provider);
  const wrappedDek = await wrapDek(vk, dek, provider);
  const metadata = await encryptMetadata(vk, descriptor, provider);

  const now = new Date().toISOString();
  const record: DocumentRecord = {
    id: newDocumentId(provider),
    createdAt: now,
    updatedAt: now,
    content,
    wrappedDek,
    metadata,
  };

  await (await localVaultStore()).putDocument(record);
  return { id: record.id };
}

/** Encrypts a picked file; the title defaults to the file's own name. */
export async function sealDocumentFile(
  file: File,
  details: NewDocumentDetails,
): Promise<{ id: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return sealDocumentBytes(bytes, {
    name: details.title?.trim() || file.name || "Untitled document",
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    category: details.category,
    expiryDate: details.expiryDate ?? null,
    ...(details.person ? { person: details.person } : {}),
    ...(details.expiryReview ? { expiryReview: details.expiryReview } : {}),
    ...(details.recognition ? { recognition: details.recognition } : {}),
  });
}

export async function updateVaultDocumentDetails(id: string, patch: VaultDocumentDetailsPatch): Promise<void> {
  const vk = requireLocalVaultKey();
  const provider = defaultCrypto();
  const handle = await localVaultStore();
  for (let attempt = 0; attempt < 5; attempt++) {
    const record = await handle.getDocument(id);
    if (!record) throw new Error("That document is no longer in this vault.");
    const current = objectMeta(await decryptMetadata(vk, record.metadata, provider));
    const next = { ...current };
    if (patch.category !== undefined) next.category = normalizeCategory(patch.category);
    if (patch.expiryDate !== undefined) {
      next.expiryDate = normalizeExpiry(patch.expiryDate);
      if (next.expiryDate !== current.expiryDate) next.expiryReview = { source: "manual", confirmed: false };
    }
    if (patch.expiryReview !== undefined) next.expiryReview = patch.expiryReview;
    if (patch.recognition === null) delete next.recognition;
    else if (patch.recognition !== undefined) next.recognition = patch.recognition;
    const metadata = await encryptMetadata(vk, prepareMeta(next as StoredDocumentMeta), provider);
    if (requireLocalVaultKey() !== vk) throw new Error("Open your vault again before saving changes.");
    if (await handle.compareAndSwapDocumentMetadata(id, record, { metadata, updatedAt: new Date().toISOString() })) return;
  }
  throw new Error("This document changed in another tab. Try saving again.");
}

/**
 * One row per stored document. Titles are only decrypted while the vault is
 * unlocked; a row that cannot be opened is marked rather than silently dropped,
 * so damage is visible instead of looking like a deleted file.
 */
export async function listVaultDocuments(): Promise<VaultDocumentSummary[]> {
  const records = await (await localVaultStore()).listDocuments();
  const unlocked = isLocalVaultUnlocked();

  const summaries: VaultDocumentSummary[] = [];
  for (const record of records) {
    const summary: VaultDocumentSummary = {
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    if (unlocked) {
      try {
        const meta = await decryptMetadata<unknown>(
          requireLocalVaultKey(),
          record.metadata,
          defaultCrypto(),
        );
        summary.meta = normalizeMeta(meta);
      } catch {
        summary.unreadable = true;
      }
    }
    summaries.push(summary);
  }

  return summaries.sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Decrypts one document here. Tampered ciphertext fails authentication and
 * never returns partial bytes.
 */
export async function openVaultDocument(
  id: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; meta: StoredDocumentMeta }> {
  const record = await (await localVaultStore()).getDocument(id);
  if (!record) throw new Error("That document is no longer in this vault.");

  const vk = requireLocalVaultKey();
  const provider = defaultCrypto();
  const dek = await unwrapDek(vk, record.wrappedDek, provider);
  const bytes = await decryptBytes(dek, record.content, { purpose: "content" }, provider);
  const meta = normalizeMeta(await decryptMetadata<unknown>(vk, record.metadata, provider));

  return { bytes, meta };
}

export async function removeVaultDocument(id: string): Promise<void> {
  try {
    await (await localVaultStore()).deleteDocument(id);
  } catch (error) {
    if (isVaultStoreError(error) && error.code === "NOT_FOUND") {
      throw new Error("That document is no longer in this vault.");
    }
    throw error;
  }
}

/**
 * The whole vault as one encrypted file. Already-encrypted throughout, so no
 * passphrase is needed to *write* it — but without the passphrase (or the
 * recovery file) it can never be read back.
 */
export async function exportVaultText(): Promise<string> {
  const handle = await localVaultStore();
  const stored = await handle.getMaterial();
  if (!stored) throw new Error("There is no vault on this device to back up.");
  return serializeExport(buildExport(stored, await handle.listDocuments()));
}

/** Restores a backup into an empty device and re-reads the vault state. */
export async function importVaultText(text: string): Promise<number> {
  const parsed = parseExport(text);
  await importExport(await localVaultStore(), parsed);
  await inspectLocalVault();
  return parsed.documents.length;
}

/** True when this device already holds a vault or documents — restoring would refuse. */
export async function vaultHasData(): Promise<boolean> {
  const handle = await localVaultStore();
  if (await handle.getMaterial()) return true;
  return (await handle.countDocuments()) > 0;
}
