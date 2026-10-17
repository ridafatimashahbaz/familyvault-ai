"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Circle, UserPlus } from "lucide-react";

import { registerAction, type AuthFormState } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useLocale } from "@/components/locale-provider";

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(registerAction, null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { t } = useLocale();

  const checks = useMemo(() => {
    return [
      { label: t.auth.ruleLength, ok: password.length >= 8 },
      { label: t.auth.ruleLetter, ok: /[A-Za-z]/.test(password) },
      { label: t.auth.ruleNumber, ok: /\d/.test(password) },
      { label: t.auth.ruleMatch, ok: password.length > 0 && password === confirm },
    ];
  }, [password, confirm, t]);

  const allOk = checks.every((c) => c.ok);

  return (
    <div className="space-y-4">
      {state?.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <form action={formAction} className="space-y-4" noValidate>
        <Input
          label={t.auth.nameLabel}
          name="name"
          autoComplete="name"
          required
          autoFocus
          placeholder={t.auth.namePlaceholder}
          className="h-11"
          error={state?.fieldErrors?.name?.[0]}
          hint={t.auth.nameHint}
        />

        <Input
          label={t.auth.emailLabel}
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={t.auth.emailPlaceholder}
          className="h-11"
          error={state?.fieldErrors?.email?.[0]}
        />

        <div>
          <Input
            label={t.auth.passwordLabel}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            placeholder={t.auth.passwordHint}
            className="h-11"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={state?.fieldErrors?.password?.[0]}
            aria-describedby="password-requirements"
          />

          <ul id="password-requirements" className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {checks.map((check) => (
              <li
                key={check.label}
                className={cn(
                  "flex items-center gap-1.5 text-xs transition-colors",
                  check.ok ? "text-accent" : "text-ink-400",
                )}
              >
                {check.ok ? (
                  <Check className="size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Circle className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{check.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <Input
          label={t.auth.confirmLabel}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          placeholder={t.auth.confirmPlaceholder}
          className="h-11"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={state?.fieldErrors?.confirmPassword?.[0]}
        />

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={isPending}
          disabled={!allOk && password.length > 0}
          icon={<UserPlus className="size-4" aria-hidden="true" />}
        >
          {isPending ? t.auth.creatingVault : t.auth.createAccount}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-600">
        {t.auth.haveAccount}{" "}
        <Link href="/login" className="font-medium text-accent hover:text-accent-strong hover:underline">
          {t.auth.signIn}
        </Link>
      </p>
    </div>
  );
}
