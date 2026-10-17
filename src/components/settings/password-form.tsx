"use client";

import { useMemo, useState } from "react";
import { Check, Circle, KeyRound } from "lucide-react";

import { ApiError, apiFetch, describeError } from "@/lib/client-api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/toast";

/**
 * Changing a password re-verifies the current one, which is a guessing oracle
 * for anyone holding a live session cookie, so the server rate limits it to five
 * attempts per 15 minutes. That budget is surfaced here rather than discovered
 * by hitting it.
 */
export function PasswordForm() {
  const toast = useToast();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [done, setDone] = useState(false);

  const checks = useMemo(
    () => [
      { label: "At least 8 characters", ok: next.length >= 8 },
      { label: "Contains a letter", ok: /[A-Za-z]/.test(next) },
      { label: "Contains a number", ok: /\d/.test(next) },
      { label: "Both entries match", ok: next.length > 0 && next === confirm },
    ],
    [next, confirm],
  );

  const valid = checks.every((check) => check.ok);

  async function submit() {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    setDone(false);

    try {
      await apiFetch<{ changed: boolean }>("/api/account/password", {
        method: "POST",
        body: { currentPassword: current, newPassword: next },
      });

      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
      toast.success("Password changed");
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && current) void submit();
      }}
      className="space-y-4"
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {done ? (
        <Alert tone="success" title="Password changed">
          Use the new password next time you sign in. This session stays signed in.
        </Alert>
      ) : null}

      <Input
        type="password"
        label="Current password"
        value={current}
        required
        autoComplete="current-password"
        onChange={(event) => setCurrent(event.target.value)}
        error={fieldErrors.currentPassword?.[0]}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          type="password"
          label="New password"
          value={next}
          required
          autoComplete="new-password"
          maxLength={200}
          onChange={(event) => setNext(event.target.value)}
          error={fieldErrors.newPassword?.[0]}
        />
        <Input
          type="password"
          label="Confirm new password"
          value={confirm}
          required
          autoComplete="new-password"
          maxLength={200}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>

      {next.length > 0 ? (
        <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Password requirements">
          {checks.map((check) => (
            <li
              key={check.label}
              className={
                check.ok
                  ? "flex items-center gap-1.5 text-xs font-medium text-emerald-700"
                  : "flex items-center gap-1.5 text-xs text-ink-500"
              }
            >
              {check.ok ? (
                <Check className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              {check.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          loading={saving}
          disabled={!valid || !current}
          icon={saving ? undefined : <KeyRound className="size-4" aria-hidden="true" />}
        >
          {saving ? "Changing…" : "Change password"}
        </Button>
        <p className="text-xs text-ink-500">Five attempts every 15 minutes.</p>
      </div>
    </form>
  );
}
