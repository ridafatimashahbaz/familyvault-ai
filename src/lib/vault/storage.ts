/**
 * The vault's device storage — one handle, shared.
 *
 * `@vault/store` opens IndexedDB and already refuses to persist any usable key
 * material; this module only exists so the session and the document modules read
 * and write through *the same* connection instead of each caching their own.
 * With one handle, dropping the cached handle really does mean "this device
 * starts from an empty vault", which is what the multi-device tests rely on.
 */

import { openVaultStore, type VaultStore } from "@vault/store";

let store: Promise<VaultStore> | null = null;

export function vaultStore(): Promise<VaultStore> {
  if (!store) store = openVaultStore();
  return store;
}

/** Forget the cached handle so the next access reopens this device's storage. */
export function forgetVaultStore(): void {
  store = null;
}
