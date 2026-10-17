"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, LogIn } from "lucide-react";

import { signInAction, type AuthFormState } from "@/lib/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useLocale } from "@/components/locale-provider";

export function LoginForm({ notice }: { notice?: string | null }) {
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(signInAction, null);
  const [revealed, setRevealed] = useState(false);
  const { t } = useLocale();

  return (
    <div className="space-y-4">
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {state?.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <form action={formAction} className="space-y-4" noValidate>
        <Input
          label={t.auth.emailLabel}
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          placeholder={t.auth.emailPlaceholder}
          className="h-11"
        />

        <Input
          label={t.auth.passwordLabel}
          name="password"
          type={revealed ? "text" : "password"}
          autoComplete="current-password"
          required
          placeholder={t.auth.passwordPlaceholder}
          className="h-11"
          trailing={
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="flex size-7 items-center justify-center rounded transition-colors hover:text-ink-700"
              aria-label={revealed ? t.auth.hidePassword : t.auth.showPassword}
              aria-pressed={revealed}
            >
              {revealed ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          }
        />

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={isPending}
          icon={<LogIn className="size-4 flip-rtl" aria-hidden="true" />}
        >
          {isPending ? t.auth.signingIn : t.auth.signIn}
        </Button>
      </form>

      <p className="text-center text-sm text-ink-600">
        {t.auth.noAccount}{" "}
        <Link href="/register" className="font-medium text-accent hover:text-accent-strong hover:underline">
          {t.auth.createOne}
        </Link>
      </p>
    </div>
  );
}
