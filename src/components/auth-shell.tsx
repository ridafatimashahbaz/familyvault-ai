import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, ScanText, ShieldCheck } from "lucide-react";

import { getI18n } from "@/lib/i18n/server";
import { Logo } from "@/components/brand";
import { LocaleToggle } from "@/components/locale-toggle";
import { IconThemeToggle } from "@/components/theme-toggle";

/**
 * Frame for the sign-in and sign-up screens: a value panel beside the form on
 * desktop, just the form on a phone.
 */
export async function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = await getI18n();
  const points = [
    { icon: ScanText, title: t.auth.points[0].title, body: t.auth.points[0].body },
    { icon: ShieldCheck, title: t.auth.points[1].title, body: t.auth.points[1].body },
    { icon: Lock, title: t.auth.points[2].title, body: t.auth.points[2].body },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-canvas lg:grid lg:grid-cols-[1fr_26rem] lg:gap-0">
      <aside className="relative hidden overflow-hidden bg-brand-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            background:
              "radial-gradient(40rem 24rem at 20% 10%, var(--color-brand-400), transparent 60%), radial-gradient(36rem 20rem at 80% 90%, var(--color-brand-700), transparent 65%)",
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <span className="flex items-center gap-2.5 text-white">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
              <Lock className="size-4" aria-hidden="true" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[0.95rem] font-semibold tracking-tight">FamilyVault</span>
              <span className="mt-0.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-brand-200">
                AI
              </span>
            </span>
          </span>
        </div>

        <div className="relative space-y-8">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-white">
            {t.auth.shellH2}
          </h2>
          <ul className="max-w-md space-y-4">
            {points.map((point) => (
              <li key={point.title} className="flex gap-3">
                <point.icon className="mt-0.5 size-4.5 shrink-0 text-brand-200" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-white">{point.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-brand-100/90">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-200/80">{t.auth.shellFooter}</p>
      </aside>

      <main className="flex flex-1 flex-col justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Logo />
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800"
            >
              <ArrowLeft className="size-3.5 flip-rtl" aria-hidden="true" />
              {t.auth.home}
            </Link>
          </div>

          <div className="mb-4 flex items-center justify-end gap-2">
            <LocaleToggle />
            <IconThemeToggle />
          </div>

          <div className="rounded-card border border-ink-200/80 bg-surface p-6 shadow-card sm:p-7">
            <h1 className="text-xl font-semibold tracking-tight text-ink-950">{title}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>

          {footer ? <div className="mt-5 text-center text-sm text-ink-600">{footer}</div> : null}

          <p className="mt-8 hidden text-center text-xs text-ink-400 lg:block">
            <Link href="/" className="hover:text-ink-600 hover:underline">
              {t.auth.backHome}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
