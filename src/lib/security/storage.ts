import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import { decryptBuffer, encryptBuffer } from "./crypto";

/** Absolute path of the encrypted document store. Always outside ./public. */
export function storageRoot(): string {
  const dir = env().STORAGE_DIR;
  return path.isAbsolute(dir) ? dir : path.resolve(/*turbopackIgnore: true*/ process.cwd(), dir);
}

export function documentsDir(): string {
  return path.join(storageRoot(), "documents");
}

export function ocrLangDir(): string {
  const dir = env().OCR_LANG_PATH;
  return path.isAbsolute(dir) ? dir : path.resolve(/*turbopackIgnore: true*/ process.cwd(), dir);
}

/**
 * Storage keys are `<userId>/<uuid>.<ext>`. Restricting the character set is
 * what makes path traversal impossible even if a key reaches us from a client.
 */
const STORAGE_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}\/[A-Za-z0-9_-]{8,64}\.[A-Za-z0-9]{1,8}$/;

export function assertSafeStorageKey(key: string): void {
  if (!STORAGE_KEY_PATTERN.test(key)) {
    throw new Error(`Refusing to use unsafe storage key: "${key}"`);
  }
}

export function makeStorageKey(userId: string, extension: string): string {
  const id = randomUUID().replace(/-/g, "");
  return `${userId}/${id}.${extension}`;
}

function resolvePath(key: string): string {
  assertSafeStorageKey(key);
  const resolved = path.resolve(documentsDir(), key);

  // Defence in depth: the resolved path must still sit inside the store.
  if (!resolved.startsWith(path.resolve(documentsDir()) + path.sep)) {
    throw new Error("Storage key escapes the document store");
  }
  return resolved;
}

export async function saveDocumentFile(
  key: string,
  buffer: Buffer,
): Promise<{ encrypted: boolean }> {
  const target = resolvePath(key);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });

  const { blob, status } = encryptBuffer(buffer);
  await writeFile(target, blob, { mode: 0o600 });

  return { encrypted: status !== "plaintext" };
}

export async function readDocumentFile(key: string): Promise<Buffer> {
  const target = resolvePath(key);
  const blob = await readFile(target);
  return decryptBuffer(blob);
}

export async function deleteDocumentFile(key: string): Promise<void> {
  try {
    await unlink(resolvePath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    const info = await stat(resolvePath(key));
    return info.isFile();
  } catch {
    return false;
  }
}
