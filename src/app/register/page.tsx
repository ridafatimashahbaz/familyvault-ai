import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/register-form";
import { getI18n } from "@/lib/i18n/server";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Create your account" };

export default async function RegisterPage() {
  if (await getSessionUser()) redirect("/dashboard");

  const { t } = await getI18n();

  return (
    <AuthShell title={t.auth.registerTitle} subtitle={t.auth.registerSubtitle}>
      <RegisterForm />
    </AuthShell>
  );
}
