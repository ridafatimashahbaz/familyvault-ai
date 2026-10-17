"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, KeyRound, Lock, ShieldCheck, Unlock, WandSparkles } from "lucide-react";

import type { RecoveryKit } from "@vault/types";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { lockVault, setupVault, unlockVault } from "@/lib/vault/session";
import { useVaultSession } from "./use-vault-session";
import { PrivateFiles } from "./private-files";

/**
 * The private vault screen.
 *
 * Two separate secrets are in play, and the copy says so: the account password
 * opens the app, the vault passphrase opens the vault. Nothing here accepts or
 * stores the passphrase — it is used once to unscramble the vault key in this
 * tab and then dropped.
 */
export function VaultPanel() {
  const state = useVaultSession();
  const [kit, setKit] = useState<RecoveryKit | null>(null);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Private vault status"
          description="Files in here are scrambled on your device before they are stored."
          icon={<ShieldCheck className="size-4.5" aria-hidden="true" />}
          action={<StatusBadge phase={state.phase} synced={state.synced} />}
        />
        <CardBody className="space-y-4">
          {state.detail ? <Alert tone={state.phase === "unavailable" ? "danger" : "warning"}>{state.detail}</Alert> : null}

          {state.phase === "checking" ? <p className="text-sm text-ink-500">Checking this device and your account…</p> : null}

          {state.phase === "no-vault" ? <SetupForm onCreated={setKit} /> : null}
          {state.phase === "locked" || state.phase === "conflict" ? <UnlockForm lockedOut={state.phase === "conflict"} /> : null}

          {state.phase === "unlocked" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={lockVault}
                icon={<Lock className="size-4" aria-hidden="true" />}
              >
                Lock it again
              </Button>
              {kit ? (
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  onClick={() => downloadKit(kit)}
                  icon={<Download className="size-4" aria-hidden="true" />}
                >
                  Save your recovery file
                </Button>
              ) : null}
            </div>
          ) : null}

          {state.phase === "unlocked" && kit ? (
            <Alert tone="warning" title="Keep this recovery file somewhere safe">
              If you forget your vault passphrase, this file is the only way back in. The people who run
              this server cannot open your vault for you — not with your account password, not with a
              support request.
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      {state.phase === "unlocked" || state.phase === "locked" ? (
        <Card>
          <CardHeader
            title="Private files"
            description="Separate from your other documents: these are never read by the server, never searched by the assistant, and never sent anywhere for reading."
            icon={<KeyRound className="size-4.5" aria-hidden="true" />}
          />
          <CardBody>
            <PrivateFiles unlocked={state.phase === "unlocked"} />
          </CardBody>
        </Card>
      ) : null}

      <p className="text-xs leading-relaxed text-ink-500">
        Nothing is moved or converted automatically. Your existing{" "}
        <Link className="underline underline-offset-2 hover:text-ink-700" href="/documents">
          documents
        </Link>{" "}
        stay where they are and the app can still read them; a file only becomes private when you add
        it here. To make a private file ordinary again, open it to save a copy, then upload that copy
        from the Upload screen.
      </p>
    </div>
  );
}

function StatusBadge({ phase, synced }: { phase: string; synced: boolean }) {
  if (phase === "unlocked") {
    return (
      <Badge tone="success" icon={<ShieldCheck className="size-3" aria-hidden="true" />}>
        {synced ? "Unlocked · backed up to your account" : "Unlocked · this device only"}
      </Badge>
    );
  }
  if (phase === "locked" || phase === "conflict") return <Badge tone="neutral">Locked</Badge>;
  if (phase === "unavailable") return <Badge tone="danger">Not available here</Badge>;
  return <Badge tone="neutral">Not set up</Badge>;
}

function SetupForm({ onCreated }: { onCreated: (kit: RecoveryKit) => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (passphrase !== confirm) throw new Error("The two passphrases must match.");
      const outcome = await setupVault(passphrase);
      onCreated(outcome.kit);
      setPassphrase("");
      setConfirm("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The vault could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-ink-600">
        A private vault needs its own passphrase, different from your account password. Write it down
        and keep it: it is not stored anywhere, and nobody can reset it for you.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Vault passphrase"
          type="password"
          autoComplete="new-password"
          value={passphrase}
          hint="At least 8 characters. A few unrelated words work well."
          onChange={(event) => setPassphrase(event.target.value)}
        />
        <Input
          label="Repeat it"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-danger-ink">{error}</p> : null}
      <Button
        type="button"
        onClick={() => void submit()}
        disabled={busy || passphrase.length < 8 || confirm.length === 0}
        loading={busy}
        icon={<WandSparkles className="size-4" aria-hidden="true" />}
      >
        Create the private vault
      </Button>
    </div>
  );
}

function UnlockForm({ lockedOut }: { lockedOut: boolean }) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockVault(passphrase);
      setPassphrase("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The vault could not be opened.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {lockedOut ? (
        <Alert tone="warning">
          Your account already has a different private vault, so this device will not overwrite either
          one. Export this device first, or sign in on the device that holds the account vault.
        </Alert>
      ) : (
        <p className="text-sm leading-relaxed text-ink-600">
          Enter your vault passphrase to open the files on this device.
        </p>
      )}
      <Input
        label="Vault passphrase"
        type="password"
        autoComplete="off"
        value={passphrase}
        onChange={(event) => setPassphrase(event.target.value)}
      />
      {error ? <p className="text-sm text-danger-ink">{error}</p> : null}
      <Button
        type="button"
        onClick={() => void submit()}
        disabled={busy || passphrase.length === 0}
        loading={busy}
        icon={<Unlock className="size-4" aria-hidden="true" />}
      >
        Open the vault
      </Button>
    </div>
  );
}

function downloadKit(kit: RecoveryKit): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(kit, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `familyvault-recovery-${kit.createdAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
