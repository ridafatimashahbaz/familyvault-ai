/**
 * Local vault session — the whole lock/unlock story when there is no server.
 *
 * The unwrapped vault key lives in a module variable for as long as the tab is
 * open. It is never written to IndexedDB, never serialised and never sent
 * anywhere; only `VaultMaterial` (the vault key wrapped under a passphrase and
 * under a recovery key) is persisted.
 *
 * Passphrase handling, stated honestly: a JavaScript string cannot be wiped.
 * A passphrase lives for the duration of one call, is handed straight to the
 * key-derivation step, and is never stored in this module, in React state, in
 * IndexedDB, in the URL or in a log line.
 *
 * Because there is no account here, every state is decided by this device's own
 * storage — there is no "conflict" phase and no sync to fall back on.
 */

import { defaultCrypto } from "./crypto";
import { isVaultCryptoError } from "./errors";
import { createVault, rewrapVaultKeyWithPassphrase, unlockWithPassphrase, validateRecoveryKit } from "./keys";
import { openVaultStore, requestPersistence, type VaultStore } from "./store";
import type { RecoveryKit, VaultMaterial } from "./types";

export type LocalVaultPhase = "checking" | "unavailable" | "no-vault" | "locked" | "unlocked";

export type LocalVaultState = {
  phase: LocalVaultPhase;
  /** Plain-language detail, safe to render. Never contains a secret. */
  detail?: string;
};

let vaultKey: CryptoKey | null = null;
let material: VaultMaterial | null = null;
let current: LocalVaultState = { phase: "checking" };
let store: Promise<VaultStore> | null = null;

const listeners = new Set<() => void>();

function publish(next: LocalVaultState): LocalVaultState {
  current = next;
  for (const listener of listeners) listener();
  return next;
}

export function getLocalVaultState(): LocalVaultState {
  return current;
}

export function subscribeLocalVault(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** One IndexedDB handle, shared by the session and the document store. */
export function localVaultStore(): Promise<VaultStore> {
  if (!store) store = openVaultStore();
  return store;
}

function unavailable(detail: string): LocalVaultState {
  return publish({ phase: "unavailable", detail });
}

/**
 * Adds a plain-language line to the state the whole screen reads from. Used for
 * outcomes that outlive the panel that caused them — restoring a backup swaps
 * the panel out, so the confirmation has to live at this level to be seen. The
 * next phase change drops it.
 */
export function noteLocalVaultDetail(detail: string): void {
  publish({ ...current, detail });
}

/**
 * Finds out what this device holds. Never derives a key and never overwrites
 * anything. A browser without Web Crypto or without usable storage is reported
 * as `unavailable` rather than silently doing something weaker.
 */
export async function inspectLocalVault(): Promise<LocalVaultState> {
  publish({ phase: "checking" });

  const crypto = defaultCrypto();
  if (!crypto?.subtle) {
    return unavailable(
      "This browser cannot create a private vault. Open this app in a current Chrome, Edge or Safari.",
    );
  }

  let found: VaultMaterial | null;
  try {
    found = await (await localVaultStore()).getMaterial();
  } catch {
    return unavailable("This browser will not let the app store data on this device.");
  }

  vaultKey = null;
  material = found;
  return publish(found ? { phase: "locked" } : { phase: "no-vault" });
}

/** Creates a brand-new vault and unlocks it. Returns the recovery kit once — it is never persisted. */
export async function createLocalVault(passphrase: string): Promise<RecoveryKit> {
  if (typeof passphrase !== "string" || passphrase.length < 8) {
    throw new Error("Use a passphrase of at least 8 characters.");
  }
  if (await (await localVaultStore()).getMaterial()) {
    throw new Error("This device already has a private vault.");
  }

  const created = await createVault(passphrase, defaultCrypto());
  await (await localVaultStore()).putMaterial(created.material);
  await requestPersistence();

  material = created.material;
  vaultKey = created.vk;
  publish({ phase: "unlocked" });
  return created.kit;
}

/** Derives the vault key from the passphrase. A wrong passphrase is a hard failure. */
export async function unlockLocalVault(passphrase: string): Promise<void> {
  const local = material ?? (await (await localVaultStore()).getMaterial());
  if (!local) throw new Error("There is no private vault on this device yet.");
  if (!passphrase) throw new Error("Enter your vault passphrase.");

  let key: CryptoKey;
  try {
    key = await unlockWithPassphrase(passphrase, local.wrappedByPassphrase, local, defaultCrypto());
  } catch (error) {
    vaultKey = null;
    material = local;
    publish({
      phase: "locked",
      detail:
        isVaultCryptoError(error) && error.code === "AUTH_FAILED"
          ? "That passphrase did not open the vault."
          : "The vault could not be opened on this device.",
    });
    throw new Error("That passphrase did not open the vault.");
  }

  material = local;
  vaultKey = key;
  publish({ phase: "unlocked" });
}

/** A `.fvault` or recovery kit arrives as text; parse it here so a bad file fails cleanly. */
function parseKit(kit: unknown): unknown {
  if (typeof kit !== "string") return kit;
  try {
    return JSON.parse(kit) as unknown;
  } catch {
    throw new Error("That file is not a FamilyVault recovery file.");
  }
}

/**
 * Opens the vault with a recovery file and immediately re-wraps it under a new
 * passphrase. The documents are untouched — only the passphrase that opens the
 * vault changes — so this both restores access and closes the hole that the
 * forgotten passphrase left open.
 */
export async function recoverLocalVault(kit: unknown, newPassphrase: string): Promise<void> {
  if (typeof newPassphrase !== "string" || newPassphrase.length < 8) {
    throw new Error("Use a new passphrase of at least 8 characters.");
  }

  const local = await (await localVaultStore()).getMaterial();
  if (!local) throw new Error("Restore your backup before using its recovery file.");

  let result;
  try {
    const validated = validateRecoveryKit(parseKit(kit));
    if (
      validated.wrappedByRecoveryKey.ct !== local.wrappedByRecoveryKey.ct ||
      validated.wrappedByRecoveryKey.iv !== local.wrappedByRecoveryKey.iv
    ) {
      throw new Error("That recovery file does not belong to this vault.");
    }
    result = await rewrapVaultKeyWithPassphrase(
      { ...validated, createdAt: local.createdAt },
      newPassphrase,
      defaultCrypto(),
    );
  } catch (error) {
    if (isVaultCryptoError(error)) {
      if (error.code === "AUTH_FAILED" || error.code === "INVALID_ARGUMENT") {
        throw new Error("That recovery file does not belong to this vault.");
      }
      throw new Error("That file is not a FamilyVault recovery file.");
    }
    throw error;
  }

  await (await localVaultStore()).putMaterial(result.material);
  material = result.material;
  vaultKey = result.vk;
  publish({ phase: "unlocked" });
}

/** Drops the in-memory key. The wrapped material stays — it is useless without the passphrase. */
export function lockLocalVault(): void {
  vaultKey = null;
  publish({ phase: material ? "locked" : "no-vault" });
}

/** The usable vault key. Callers must not store it anywhere. */
export function requireLocalVaultKey(): CryptoKey {
  if (!vaultKey) throw new Error("Open your vault first.");
  return vaultKey;
}

export function isLocalVaultUnlocked(): boolean {
  return vaultKey !== null;
}

export function hasLocalVaultMaterial(): boolean {
  return material !== null;
}

/** Test/diagnostic helper: clears module state without touching stored data. */
export function resetLocalVaultSession(): void {
  vaultKey = null;
  material = null;
  store = null;
  publish({ phase: "checking" });
}
