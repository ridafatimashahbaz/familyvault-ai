"use client";

import { useRef, useState } from "react";

import { CATEGORIES, CATEGORY_KEYS, type CategoryKey } from "@shared/constants";
import { importVaultText } from "@vault/documents";
import { describeVaultFailure } from "@vault/errors";
import { createLocalVault, noteLocalVaultDetail } from "@vault/session";
import type { RecoveryKit } from "@vault/types";

/**
 * First run: make a vault, or bring one back from a backup file.
 *
 * The passphrase is used once to scramble the vault key and then dropped — it is
 * never stored, so there is nothing to reset and nothing to recover except the
 * recovery file this screen hands over.
 */
export function SetupPanel({ onCreated }: { onCreated: (kit: RecoveryKit) => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const restoreInput = useRef<HTMLInputElement | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      if (passphrase !== confirm) throw new Error("The two passphrases must match.");
      const kit = await createLocalVault(passphrase);
      setPassphrase("");
      setConfirm("");
      onCreated(kit);
    } catch (caught) {
      setError(describeVaultFailure(caught));
    } finally {
      setBusy(false);
    }
  }

  async function restore(file: File) {
    setRestoreBusy(true);
    setRestoreMessage(null);
    try {
      const count = await importVaultText(await file.text());
      // The panel is swapped out the moment the material lands, so the
      // confirmation is published to the screen-level state instead.
      noteLocalVaultDetail(
        count === 1
          ? "Backup restored: 1 document. Enter its passphrase to open it."
          : `Backup restored: ${count} documents. Enter its passphrase to open it.`,
      );
    } catch (caught) {
      setRestoreMessage(describeVaultFailure(caught));
    } finally {
      setRestoreBusy(false);
      if (restoreInput.current) restoreInput.current.value = "";
    }
  }

  return (
    <>
      <section className="card">
        <h2>Make your family&rsquo;s vault</h2>
        <p className="muted">
          A vault needs its own passphrase, separate from anything else you use. Write it down and
          keep it safe: it is not stored anywhere, and nobody can reset it for you.
        </p>
        <div className="grid-2">
          <label className="field">
            <span>
              Vault passphrase <span className="hint">at least 8 characters</span>
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Repeat it</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </label>
        </div>
        {error ? <p className="notice notice-bad">{error}</p> : null}
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || passphrase.length < 8 || confirm.length === 0}
            onClick={() => void create()}
          >
            {busy ? "Making your vault…" : "Create my vault"}
          </button>
        </div>
        <p className="small muted">
          A few unrelated words make a strong passphrase — for example three words you will not
          forget.
        </p>
      </section>

      <section className="card">
        <h3>Already have a backup file?</h3>
        <p className="muted">
          Restore a backup on this device. This only works while there is nothing here yet — an
          existing vault is never overwritten.
        </p>
        <div className="actions">
          <input
            ref={restoreInput}
            type="file"
            accept=".fvault,application/json"
            aria-label="Choose a backup file to restore"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void restore(file);
            }}
          />
          {restoreBusy ? <span className="small muted">Restoring…</span> : null}
        </div>
        {restoreMessage ? <p className="notice">{restoreMessage}</p> : null}
      </section>

      <section className="card">
        <h3>What you can keep here</h3>
        <ul className="list">
          {CATEGORY_KEYS.map((key: CategoryKey) => (
            <li className="row" key={key}>
              <div className="row-main">
                <p className="row-title">{CATEGORIES[key].label}</p>
                <p className="row-meta">{CATEGORIES[key].blurb}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
