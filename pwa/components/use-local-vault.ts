"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  getLocalVaultState,
  inspectLocalVault,
  subscribeLocalVault,
  type LocalVaultState,
} from "@vault/session";

/**
 * React view of the local vault session. The session lives in `@vault/session`
 * (module scope) rather than in component state on purpose: the unwrapped key
 * must survive re-renders without being re-derived, and it must never end up in
 * a prop, a URL or markup.
 */
export function useLocalVault(): LocalVaultState {
  const state = useSyncExternalStore(subscribeLocalVault, getLocalVaultState, getLocalVaultState);

  useEffect(() => {
    void inspectLocalVault();
  }, []);

  return state;
}
