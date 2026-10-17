/**
 * Vault session (Phase 1, Day 2 Stage B) — browser only.
 *
 * Owns the one thing that must never leave this device: the unwrapped vault key.
 * It is held in a module variable for as long as the tab is unlocked, is never
 * written to IndexedDB, never serialised, and never sent anywhere. What *is*
 * persisted locally and uploaded to the server is `VaultMaterial` — the vault key
 * wrapped under a passphrase-derived key and under a recovery key. The server
 * cannot open either blob, and the account password is not involved at all: the
 * passphrase is a second, separate secret.
 *
 * Passphrase handling, stated honestly: a JavaScript string cannot be wiped, so a
 * passphrase lives for the duration of one call and becomes unreachable when that
 * frame goes away. It is never stored in this module, in React state, in
 * IndexedDB, in the URL or in a log line.
 *
 * The static-export PWA (`pwa/`) has no session, no API routes and a different
 * origin, so it cannot reach these endpoints. This module therefore runs in the
 * signed-in main app, which is where the cookie session exists.
 */

import { createVault, unlockWithPassphrase } from "@vault/keys";
import { defaultCrypto } from "@vault/crypto";
import { requestPersistence } from "@vault/store";
import { isVaultCryptoError } from "@vault/errors";
import type { RecoveryKit, VaultMaterial } from "@vault/types";

import { describeError } from "@/lib/client-api";
import { fetchVaultMaterial, uploadVaultMaterial } from "./client";
import { forgetVaultStore, vaultStore } from "./storage";

export type VaultPhase =
  | "checking"
  | "unavailable" // this browser lacks the crypto or storage this needs
  | "no-vault" // signed in, nothing on this device or in the account
  | "locked" // material present, key not yet derived
  | "unlocked"
  | "conflict"; // this device and the account hold different vaults

export type VaultSessionState = {
  phase: VaultPhase;
  /** True when this device's wrapped material is also stored on the server. */
  synced: boolean;
  /** Plain-language detail, safe to render. Never contains a secret. */
  detail?: string;
};

let vaultKey: CryptoKey | null = null;
let material: VaultMaterial | null = null;
let current: VaultSessionState = { phase: "checking", synced: false };

const listeners = new Set<() => void>();

function publish(next: VaultSessionState): void {
  current = next;
  for (const listener of listeners) listener();
}

export function getVaultState(): VaultSessionState {
  return current;
}

export function subscribeVault(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Compares the two copies by their wrapped blobs — never by decrypting them. */
function sameMaterial(a: VaultMaterial, b: VaultMaterial): boolean {
  return (
    a.kdf.salt === b.kdf.salt &&
    a.kdf.iterations === b.kdf.iterations &&
    a.wrappedByPassphrase.ct === b.wrappedByPassphrase.ct &&
    a.wrappedByRecoveryKey.ct === b.wrappedByRecoveryKey.ct
  );
}

type AccountRead =
  | { ok: true; material: VaultMaterial | null }
  | { ok: false; detail: string };

/**
 * Reads the account's copy of the vault material.
 *
 * `ok: true, material: null` means the account provably has no vault. A failed
 * request is *not* that: treating "could not check" as "nothing there" is how a
 * second device ends up overwriting the vault that a first device created.
 */
async function readAccount(): Promise<AccountRead> {
  try {
    return { ok: true, material: await fetchVaultMaterial() };
  } catch (error) {
    return { ok: false, detail: describeError(error) };
  }
}

function unavailable(detail: string): VaultSessionState {
  const state = { phase: "unavailable", synced: false, detail } satisfies VaultSessionState;
  publish(state);
  return state;
}

/**
 * Finds out what this device and this account hold. Never derives a key and never
 * overwrites either copy: a device/account mismatch is reported as a conflict, so
 * a stray sync cannot destroy a vault that exists only on this phone.
 */
export async function inspectVault(): Promise<VaultSessionState> {
  publish({ phase: "checking", synced: false });

  const crypto = defaultCrypto();
  if (!crypto?.subtle) {
    return unavailable("This browser cannot create a private vault. Open the app in a current Chrome, Edge or Safari.");
  }

  let local: VaultMaterial | null;
  try {
    local = await (await vaultStore()).getMaterial();
  } catch {
    return unavailable("This browser will not let the app store data on this device.");
  }

  const account = await readAccount();
  const remote = account.ok ? account.material : null;
  const detail = account.ok ? undefined : account.detail;

  if (local && remote && !sameMaterial(local, remote)) {
    vaultKey = null;
    material = local;
    const state: VaultSessionState = {
      phase: "conflict",
      synced: false,
      detail: "This device holds a different private vault than your account. Export this device before you change anything — the two cannot be merged.",
    };
    publish(state);
    return state;
  }

  vaultKey = null;
  material = local ?? remote;

  if (local) {
    const state: VaultSessionState = { phase: "locked", synced: true, ...(detail ? { detail } : {}) };
    publish(state);
    return state;
  }

  if (remote) {
    try {
      await (await vaultStore()).putMaterial(remote);
    } catch {
      // Usable for this session; the copy simply stays on the server.
    }
    const state: VaultSessionState = { phase: "locked", synced: true };
    publish(state);
    return state;
  }

  const state: VaultSessionState = { phase: "no-vault", synced: false, ...(detail ? { detail } : {}) };
  publish(state);
  return state;
}

export type CreateVaultOutcome = {
  kit: RecoveryKit;
  synced: boolean;
  /** Set when the vault works on this device but could not be stored on the account. */
  syncMessage?: string;
};

/** Creates a brand-new vault. Throws when this device or account already has one. */
export async function setupVault(passphrase: string): Promise<CreateVaultOutcome> {
  if (passphrase.length < 8) {
    throw new Error("Use a passphrase of at least 8 characters.");
  }
  const existing = await (await vaultStore()).getMaterial();
  if (existing || current.phase === "conflict") {
    throw new Error("This device already has a private vault.");
  }

  // Checked before a single byte is written: an account that already holds a
  // vault is unlocked, never replaced by a new one.
  const account = await readAccount();
  if (account.ok && account.material) {
    throw new Error("Your account already has a private vault. Enter its passphrase to open it.");
  }

  const created = await createVault(passphrase, defaultCrypto());

  await (await vaultStore()).putMaterial(created.material);
  await requestPersistence();

  material = created.material;
  vaultKey = created.vk;

  if (!account.ok) {
    // The account could not be checked, so nothing is pushed to it. The vault is
    // complete and usable on this device and syncs on a later unlock.
    const detail = "Your vault is saved on this device. It will not be copied to your account until your account can be reached.";
    publish({ phase: "unlocked", synced: false, detail });
    return { kit: created.kit, synced: false, syncMessage: detail };
  }

  try {
    await uploadVaultMaterial(created.material);
    publish({ phase: "unlocked", synced: true });
    return { kit: created.kit, synced: true };
  } catch (error) {
    // The vault is real and usable here; only cross-device sync is missing.
    publish({ phase: "unlocked", synced: false, detail: describeError(error) });
    return { kit: created.kit, synced: false, syncMessage: describeError(error) };
  }
}

/** Derives the vault key from the passphrase. A wrong passphrase is a hard failure. */
export async function unlockVault(passphrase: string): Promise<void> {
  const local = material ?? (await (await vaultStore()).getMaterial());
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
      synced: current.synced,
      detail: isVaultCryptoError(error) && error.code === "AUTH_FAILED"
        ? "That passphrase did not open the vault."
        : describeError(error),
    });
    throw new Error("That passphrase did not open the vault.");
  }

  material = local;
  vaultKey = key;

  // A device that adopted its vault from the account has nothing to push. A
  // device-only vault is offered here, and only to an account that provably has
  // none — a different vault on the account is never overwritten.
  let synced = current.synced;
  if (!synced) {
    const account = await readAccount();
    if (account.ok && account.material === null) {
      try {
        await uploadVaultMaterial(local);
        synced = true;
      } catch {
        synced = false;
      }
    } else if (account.ok && account.material) {
      synced = sameMaterial(account.material, local);
    }
  }

  publish({ phase: "unlocked", synced });
}

/** Drops the in-memory key. Wrapped material stays — it is useless without the passphrase. */
export function lockVault(): void {
  vaultKey = null;
  publish({ phase: material ? "locked" : "no-vault", synced: current.synced });
}

/** The usable vault key. Callers must not store it anywhere. */
export function requireVaultKey(): CryptoKey {
  if (!vaultKey) throw new Error("Unlock your private vault first.");
  return vaultKey;
}

export function isVaultUnlocked(): boolean {
  return vaultKey !== null;
}

/** Test/diagnostic helper: clears module state without touching stored data. */
export function resetVaultSession(): void {
  vaultKey = null;
  material = null;
  forgetVaultStore();
  publish({ phase: "checking", synced: false });
}
