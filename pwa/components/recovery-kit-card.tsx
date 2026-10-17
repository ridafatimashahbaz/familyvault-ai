"use client";

import { useState } from "react";

import type { RecoveryKit } from "@vault/types";

/**
 * Shown once, right after the vault is made.
 *
 * The recovery file is never stored anywhere — not on this device, not on a
 * server — so this is the only chance to keep it. That is stated plainly rather
 * than buried, and the card refuses to go away until the user says it is saved.
 */
export function RecoveryKitCard({ kit, onDismissed }: { kit: RecoveryKit; onDismissed: () => void }) {
  const [saved, setSaved] = useState(false);

  function download() {
    const blob = new Blob([JSON.stringify(kit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `familyvault-recovery-${kit.createdAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <section className="kit">
      <h2>Save your recovery file now</h2>
      <p>
        This file is the only way back in if you forget your passphrase. It is shown once and is
        never saved anywhere, so keep it somewhere safe — a printout, a password manager, or a
        folder only you can open.
      </p>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={download}>
          Download my recovery file
        </button>
        <button type="button" className="btn btn-secondary" onClick={onDismissed} disabled={!saved}>
          {saved ? "I have saved it — continue" : "Save it first to continue"}
        </button>
      </div>
      <p className="small">
        Anyone who has this file can open your vault. Keep it away from the passphrase, so one lost
        paper is not the whole story.
      </p>
    </section>
  );
}
