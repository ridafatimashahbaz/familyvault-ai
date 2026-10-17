/**
 * Private document service (Phase 1, Day 2 Stage C).
 *
 * This is deliberately *not* the document workflow in `services/documents.ts`.
 * That pipeline decrypts uploads with a server key and runs OCR, classification
 * and summarising over the plaintext, so the server can read it. Files stored
 * here are already encrypted in the browser under a per-document key: the server
 * holds ciphertext it cannot open, and this module never touches a plaintext
 * buffer, an OCR engine or an AI prompt.
 *
 * Storage is a directory of opaque objects — `<storage>/vault-documents/<userId>/<id>.fvault`
 * — because that needs no schema change. The one-row-per-document `Document`
 * table (with its plaintext `title`/`notes`/`ocrText` columns) is left alone:
 * putting ciphertext in those columns would be a fake, not a vault.
 *
 * What the server can still see, and cannot be made to forget: that a user has N
 * objects, their opaque ids, their byte sizes and their write times. What it
 * cannot see: file names, contents, titles, document types, dates, family
 * members, tags or which object belongs to which person.
 */

import { mkdir, readFile, readdir, stat, unlink, writeFile } from "fs/promises";
import path from "node:path";

import { ApiRequestError } from "@/lib/api";
import { maxUploadBytes } from "@/lib/security/upload";
import { storageRoot } from "@/lib/security/storage";
import { parseDocumentRecord, type VaultInventoryEntry } from "@/lib/vault/contract";
import type { DocumentRecord } from "@vault/types";

/** Ids come from the session or from the opaque-id contract; both are pattern-checked. */
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const FILE_SUFFIX = ".fvault";

/**
 * A private document is uploaded as one JSON record whose ciphertext is base64
 * (≈1.37× the original file), so the body is bounded at 1.5× the ordinary upload
 * limit rather than at the raw file size.
 */
export function vaultMaxBodyBytes(): number {
  return Math.ceil(maxUploadBytes() * 1.5);
}

/** Objects per account, so one account cannot fill the disk. */
export const MAX_DOCUMENTS_PER_USER = 1000;

export function vaultDocumentsDir(): string {
  return path.join(storageRoot(), "vault-documents");
}

function resolveWithinStore(userId: string, ...segments: string[]): string {
  if (!USER_ID_PATTERN.test(userId)) {
    throw new ApiRequestError(400, "Refusing to use an unsafe account id");
  }

  const root = path.resolve(vaultDocumentsDir());
  const resolved = path.resolve(root, userId, ...segments);
  if (!resolved.startsWith(root + path.sep)) {
    throw new ApiRequestError(400, "Document path escapes the private store");
  }
  return resolved;
}

function documentPath(userId: string, id: string): string {
  assertSafeDocumentId(id);
  return resolveWithinStore(userId, `${id}${FILE_SUFFIX}`);
}

function assertSafeDocumentId(id: string): void {
  if (!DOCUMENT_ID_PATTERN.test(id)) {
    throw new ApiRequestError(400, "Refusing to use an unsafe document id");
  }
}

export type StoredVaultDocument = { id: string; sizeBytes: number };

/**
 * Validates the record with the browser's own contract rules, then stores the
 * *re-serialised* result. Re-serialising from the parsed value is what keeps a
 * caller from smuggling extra fields into the file on disk.
 */
export async function writeVaultDocument(
  userId: string,
  raw: unknown,
  pathId: string,
): Promise<StoredVaultDocument> {
  let record: DocumentRecord;
  try {
    record = parseDocumentRecord(raw);
  } catch {
    // Constant message: no field name, no parser detail, nothing about the caller's data.
    throw new ApiRequestError(422, "Invalid private document");
  }

  // Checked before writing: an object stored under an id its owner never asked for
  // would be unreachable, and the caller would have been told the save failed.
  if (record.id !== pathId) {
    throw new ApiRequestError(422, "Document id does not match the saved record");
  }

  const bytes = Buffer.from(JSON.stringify(record), "utf8");
  if (bytes.length > vaultMaxBodyBytes()) {
    throw new ApiRequestError(413, "Private document is too large");
  }

  const target = documentPath(userId, record.id);
  const existing = await objectNames(userId);
  if (existing.length >= MAX_DOCUMENTS_PER_USER && !existing.includes(`${record.id}${FILE_SUFFIX}`)) {
    throw new ApiRequestError(507, "Private storage is full");
  }

  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { mode: 0o600 });

  return { id: record.id, sizeBytes: bytes.length };
}

/**
 * Returns the stored object as parsed JSON *without* re-checking the ciphertext.
 * The bytes are opaque here by design; the browser re-validates the record
 * through the same contract before it uses it, and only the browser can decrypt.
 */
export async function readVaultDocument(userId: string, id: string): Promise<unknown> {
  const target = documentPath(userId, id);

  let text: string;
  try {
    text = await readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ApiRequestError(404, "Private document not found");
    }
    throw new ApiRequestError(500, "Private document could not be read");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiRequestError(500, "Stored private document is unreadable");
  }
}

/** Structural inventory only — ids, sizes, write times. No content, no names. */
export async function listVaultDocuments(userId: string): Promise<VaultInventoryEntry[]> {
  const dir = resolveWithinStore(userId);
  const names = await objectNames(userId);

  const items: VaultInventoryEntry[] = [];
  for (const name of names) {
    const id = name.slice(0, -FILE_SUFFIX.length);
    if (!DOCUMENT_ID_PATTERN.test(id)) continue;

    try {
      const info = await stat(path.join(dir, name));
      if (!info.isFile()) continue;
      items.push({
        id,
        sizeBytes: info.size,
        updatedAt: new Date(info.mtimeMs).toISOString(),
      });
    } catch {
      continue;
    }
  }

  return items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function deleteVaultDocument(userId: string, id: string): Promise<void> {
  const target = documentPath(userId, id);
  try {
    await unlink(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ApiRequestError(404, "Private document not found");
    }
    throw new ApiRequestError(500, "Private document could not be deleted");
  }
}

async function objectNames(userId: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(resolveWithinStore(userId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new ApiRequestError(500, "Private storage could not be listed");
  }
  return names.filter((name) => name.endsWith(FILE_SUFFIX));
}
