"use client";

import { useState } from "react";

import { lockLocalVault, type LocalVaultState } from "@vault/session";
import type { RecoveryKit } from "@vault/types";

import { InstallButton } from "./install-button";
import { HandwritingDemo } from "./handwriting-demo";
import { RecoveryKitCard } from "./recovery-kit-card";
import { SetupPanel } from "./setup-panel";
import { UnlockPanel } from "./unlock-panel";
import { useLocalVault } from "./use-local-vault";
import { VaultWorkspace } from "./vault-workspace";

/**
 * The whole app: one screen that changes with the vault's state.
 *
 * There are no accounts and no server. Everything below reads and writes this
 * device's own storage, so the copy never promises syncing, sharing or a
 * "forgot passphrase" e-mail — none of which exist.
 */
export function VaultApp() {
  const state = useLocalVault();
  const [kit, setKit] = useState<RecoveryKit | null>(null);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>FamilyVault</h1>
          <p>Your family&rsquo;s documents, scrambled on this device.</p>
        </div>
        <div className="topbar-actions">
          <StatusChip state={state} />
          {state.phase === "unlocked" ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={lockLocalVault}>
              Lock
            </button>
          ) : null}
          <InstallButton />
        </div>
      </header>

      {state.detail ? (
        <p className={state.phase === "unavailable" ? "notice notice-bad" : "notice notice-warn"}>
          {state.detail}
        </p>
      ) : null}

      {state.phase === "checking" ? (
        <section className="card">
          <p className="muted">Getting things ready…</p>
        </section>
      ) : null}

      {state.phase === "no-vault" ? <SetupPanel onCreated={setKit} /> : null}
      {state.phase === "locked" ? <UnlockPanel /> : null}

      {state.phase === "unlocked" ? (
        <>
          {kit ? <RecoveryKitCard kit={kit} onDismissed={() => setKit(null)} /> : null}
          <VaultWorkspace />
        </>
      ) : null}

      <HandwritingDemo />

      <footer className="footer">
        <p>
          Everything you keep here is scrambled on this device before it is saved. Nothing is
          uploaded, and nobody else — not even the people who made this app — can open your vault
          for you.
        </p>
        <p>
          This app works without internet, and it keeps working offline: your documents live on this
          device only. To use it like an app, choose &ldquo;Add to Home screen&rdquo; in your
          browser&rsquo;s menu.
        </p>
      </footer>
    </div>
  );
}

function StatusChip({ state }: { state: LocalVaultState }) {
  if (state.phase === "unlocked") return <span className="status status-open">Open on this device</span>;
  if (state.phase === "locked") return <span className="status">Locked</span>;
  if (state.phase === "unavailable") return <span className="status status-bad">Not available here</span>;
  if (state.phase === "checking") return <span className="status">Getting ready…</span>;
  return <span className="status">Not set up yet</span>;
}
