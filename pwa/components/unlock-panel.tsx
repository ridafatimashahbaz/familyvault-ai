"use client";

import { useRef, useState } from "react";

import { describeVaultFailure } from "@vault/errors";
import { recoverLocalVault, unlockLocalVault } from "@vault/session";

/**
 * The locked screen: open the vault, or use the recovery file when the
 * passphrase is gone. Recovery re-wraps the same vault key under a new
 * passphrase, so the documents stay exactly as they were.
 */
export function UnlockPanel() {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kitFile, setKitFile] = useState<File | null>(null);
  const [newPassphrase, setNewPassphrase] = useState("");
  const [newConfirm, setNewConfirm] = useState("");
  const [recoverBusy, setRecoverBusy] = useState(false);
  const [recoverError, setRecoverError] = useState<string | null>(null);
  const kitInput = useRef<HTMLInputElement | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      await unlockLocalVault(passphrase);
      setPassphrase("");
    } catch (caught) {
      setError(describeVaultFailure(caught));
    } finally {
      setBusy(false);
    }
  }

  async function recover() {
    setRecoverBusy(true);
    setRecoverError(null);
    try {
      if (!kitFile) throw new Error("Choose your recovery file first.");
      if (newPassphrase !== newConfirm) throw new Error("The two new passphrases must match.");
      await recoverLocalVault(await kitFile.text(), newPassphrase);
      setNewPassphrase("");
      setNewConfirm("");
      setKitFile(null);
      if (kitInput.current) kitInput.current.value = "";
    } catch (caught) {
      setRecoverError(describeVaultFailure(caught));
    } finally {
      setRecoverBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Your vault is locked</h2>
      <p className="muted">Enter your vault passphrase to open the documents kept on this device.</p>

      <label className="field">
        <span>Vault passphrase</span>
        <input
          type="password"
          autoComplete="off"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && passphrase.length > 0 && !busy) void open();
          }}
        />
      </label>
      {error ? <p className="notice notice-bad">{error}</p> : null}
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || passphrase.length === 0}
          onClick={() => void open()}
        >
          {busy ? "Opening…" : "Open my vault"}
        </button>
      </div>

      <details>
        <summary>Forgot your passphrase?</summary>
        <p className="muted small">
          Find the recovery file you saved when you first made the vault. It opens your documents
          once — you will choose a new passphrase here, and everything stays as it is.
        </p>
        <div className="grid-2">
          <label className="field">
            <span>Recovery file</span>
            <input
              ref={kitInput}
              type="file"
              accept=".json,application/json"
              onChange={(event) => setKitFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="field">
            <span>
              New passphrase <span className="hint">at least 8 characters</span>
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassphrase}
              onChange={(event) => setNewPassphrase(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Repeat the new passphrase</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newConfirm}
              onChange={(event) => setNewConfirm(event.target.value)}
            />
          </label>
        </div>
        {recoverError ? <p className="notice notice-bad">{recoverError}</p> : null}
        <div className="actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={recoverBusy || !kitFile || newPassphrase.length < 8 || newConfirm.length === 0}
            onClick={() => void recover()}
          >
            {recoverBusy ? "Opening with the recovery file…" : "Use my recovery file"}
          </button>
        </div>
      </details>
    </section>
  );
}
