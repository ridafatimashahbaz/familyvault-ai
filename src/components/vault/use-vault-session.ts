"use client";

import { useEffect, useSyncExternalStore } from "react";

import { getVaultState, inspectVault, subscribeVault, type VaultSessionState } from "@/lib/vault/session";

/**
 * React view of the vault session. The session lives in `@/lib/vault/session`
 * (module scope) rather than in component state on purpose: the decrypted key has
 * to survive navigation between screens without being re-derived, and it must
 * never end up in a prop, a URL or a serialised server payload.
 */
export function useVaultSession(): VaultSessionState {
  const state = useSyncExternalStore(subscribeVault, getVaultState, getVaultState);

  useEffect(() => {
    void inspectVault();
  }, []);

  return state;
}
