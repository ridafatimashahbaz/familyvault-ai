/**
 * Encrypted, on-device storage for the offline snapshot.
 *
 * The snapshot is the only user data that ever rests on the device, so it is
 * encrypted with AES-256-GCM under a key generated locally and stored as a
 * *non-extractable* WebCrypto key. It cannot be read back out of the browser,
 * only used to decrypt in place. If the browser lacks any of this, we silently
 * do nothing rather than fall back to plaintext.
 *
 * Client-only: every entry point checks for the browser APIs first.
 */

import { buildSnapshot, isSnapshot, type OfflineSnapshot } from "./snapshot";

const DB_NAME = "fv-offline";
const DB_VERSION = 1;
const STORE = "kv";
const KEY_ID = "device-key";
const SNAPSHOT_ID = "snapshot";

const HORIZON_DAYS = 365;

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof indexedDB !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined"
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

async function getDeviceKey(): Promise<CryptoKey> {
  const existing = await tx<CryptoKey | undefined>("readonly", (store) => store.get(KEY_ID));
  if (existing) return existing;

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await tx("readwrite", (store) => store.put(key, KEY_ID));
  return key;
}

type Sealed = { iv: ArrayBuffer; data: ArrayBuffer };

async function seal(snapshot: OfflineSnapshot): Promise<Sealed> {
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(snapshot));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { iv: iv.buffer, data };
}

async function unseal(sealed: Sealed): Promise<unknown> {
  const key = await getDeviceKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(sealed.iv) },
    key,
    sealed.data,
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

/** True when a snapshot is currently stored on this device. */
export async function hasSnapshot(): Promise<boolean> {
  if (!supported()) return false;
  try {
    const sealed = await tx<Sealed | undefined>("readonly", (store) => store.get(SNAPSHOT_ID));
    return Boolean(sealed);
  } catch {
    return false;
  }
}

/** Encrypts and persists a snapshot. Returns false when storage is unavailable. */
export async function saveSnapshot(snapshot: OfflineSnapshot): Promise<boolean> {
  if (!supported()) return false;
  try {
    const sealed = await seal(snapshot);
    await tx("readwrite", (store) => store.put(sealed, SNAPSHOT_ID));
    return true;
  } catch {
    return false;
  }
}

/** Reads and decrypts the stored snapshot, or null when there isn't a valid one. */
export async function loadSnapshot(): Promise<OfflineSnapshot | null> {
  if (!supported()) return null;
  try {
    const sealed = await tx<Sealed | undefined>("readonly", (store) => store.get(SNAPSHOT_ID));
    if (!sealed) return null;
    const value = await unseal(sealed);
    return isSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

/** Removes the snapshot and its key — used on sign-out and when the user opts out. */
export async function clearSnapshot(): Promise<void> {
  if (!supported()) return;
  try {
    await tx("readwrite", (store) => {
      store.delete(SNAPSHOT_ID);
      return store.delete(KEY_ID);
    });
  } catch {
    // Nothing to do — storage was already unavailable.
  }
}

/**
 * Fetches the reminder window and stores a fresh encrypted snapshot. Used while
 * online, at sign-in and when the tab comes back to the network. Never throws.
 */
export async function refreshSnapshot(): Promise<boolean> {
  if (!supported()) return false;
  try {
    const response = await fetch(`/api/reminders?days=${HORIZON_DAYS}`, {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) return false;

    const payload = (await response.json()) as {
      data?: { expired?: unknown[]; upcoming?: unknown[] };
    };
    const rows = [
      ...(payload.data?.expired ?? []),
      ...(payload.data?.upcoming ?? []),
    ] as Parameters<typeof buildSnapshot>[0];

    return await saveSnapshot(buildSnapshot(rows, { horizonDays: HORIZON_DAYS }));
  } catch {
    return false;
  }
}
