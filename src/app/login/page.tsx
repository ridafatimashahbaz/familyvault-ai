import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { getI18n } from "@/lib/i18n/server";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  // Signed-in users have nothing to do here.
  if (await getSessionUser()) redirect("/dashboard");

  const { t } = await getI18n();
  const params = await searchParams;
  const flag = (key: string) => params[key] === "1";

  const notice = flag("registered")
    ? t.auth.noticeRegistered
    : flag("signedOut")
      ? t.auth.noticeSignedOut
      : params["error"]
        ? t.auth.noticeError
        : null;

  return (
    <AuthShell title={t.auth.loginTitle} subtitle={t.auth.loginSubtitle}>
      <LoginForm notice={notice} />
    </AuthShell>
  );
}
