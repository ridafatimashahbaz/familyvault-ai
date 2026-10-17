import {
  ArrowRight,
  Bell,
  BellRing,
  CalendarClock,
  Download,
  FileSearch,
  Lock,
  MessageCircle,
  ScanText,
  Server,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand";
import { LinkButton } from "@/components/ui/button";
import { IconThemeToggle } from "@/components/theme-toggle";
import { LocaleToggle } from "@/components/locale-toggle";
import { getI18n } from "@/lib/i18n/server";
import { encryptionStatus } from "@/lib/security/crypto";
import { getSessionUser } from "@/lib/session";

const FEATURE_ICONS = [
  Upload,
  FileSearch,
  ScanText,
  Sparkles,
  CalendarClock,
  BellRing,
  Users,
  MessageCircle,
  Bell,
] as const;

const STEP_ICONS = [Users, Upload, ScanText] as const;

export default async function LandingPage() {
  const user = await getSessionUser();
  const { t } = await getI18n();
  const encrypted = encryptionStatus() !== "plaintext";

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-20 border-b border-ink-100 bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2" aria-label="Account">
            <LocaleToggle />
            <IconThemeToggle />
            {user ? (
              <LinkButton
                href="/dashboard"
                icon={<ArrowRight className="size-4 flip-rtl" aria-hidden="true" />}
              >
                {t.landing.ctaDashboard}
              </LinkButton>
            ) : (
              <>
                <LinkButton href="/try" variant="ghost" className="hidden sm:inline-flex">
                  {t.landing.ctaDemo}
                </LinkButton>
                <LinkButton href="/login" variant="ghost">
                  {t.auth.signIn}
                </LinkButton>
                <LinkButton href="/register">{t.auth.createAccount}</LinkButton>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-ink-100">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(60rem 30rem at 15% -10%, var(--fv-brand-50), transparent 60%), radial-gradient(50rem 25rem at 90% 0%, var(--fv-ink-50), transparent 55%)",
            }}
            aria-hidden="true"
          />
          <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
            <div className="max-w-xl space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-accent">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                {t.landing.badge}
              </span>

              <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-ink-950 sm:text-5xl">
                {t.landing.h1}
              </h1>

              <p className="text-pretty text-base leading-relaxed text-ink-600 sm:text-lg">
                {t.landing.lead}
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <LinkButton
                  href={user ? "/dashboard" : "/register"}
                  size="lg"
                  className="w-full sm:w-auto"
                  icon={<ArrowRight className="size-4 flip-rtl" aria-hidden="true" />}
                >
                  {user ? t.landing.ctaDashboard : t.landing.ctaStart}
                </LinkButton>
                <LinkButton href="/try" variant="secondary" size="lg" className="w-full sm:w-auto">
                  {t.landing.ctaDemo}
                </LinkButton>
              </div>

              <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-500">
                <li className="inline-flex items-center gap-1.5">
                  <Lock className="size-3.5 text-accent" aria-hidden="true" />
                  {encrypted ? t.landing.trustEncrypted : t.landing.trustEncryptionReady}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <ScanText className="size-3.5 text-accent" aria-hidden="true" />
                  {t.landing.trustOcr}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
                  {t.landing.trustNoKey}
                </li>
              </ul>
            </div>

            <VaultPreview t={t} />
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">
              {t.landing.featuresTitle}
            </h2>
            <p className="text-pretty text-sm leading-relaxed text-ink-600 sm:text-base">
              {t.landing.featuresLead}
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.landing.features.map((feature, index) => {
              const Icon = FEATURE_ICONS[index];
              return (
                <article
                  key={feature.title}
                  className="rounded-card border border-ink-200/80 bg-surface p-5 shadow-card transition-shadow hover:shadow-raised"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-accent ring-1 ring-brand-100">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3.5 text-sm font-semibold text-ink-950">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{feature.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-y border-ink-100 bg-ink-50/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">
              {t.landing.howTitle}
            </h2>

            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {t.landing.steps.map((step, index) => {
                const Icon = STEP_ICONS[index];
                return (
                  <li key={step.title} className="rounded-card border border-ink-200/80 bg-surface p-5">
                    <span className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-ink-50">
                        {index + 1}
                      </span>
                      <Icon className="size-4 text-accent" aria-hidden="true" />
                    </span>
                    <h3 className="mt-3 text-sm font-semibold text-ink-950">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{step.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">
                {t.landing.trustTitle}
              </h2>
              <p className="text-pretty text-sm leading-relaxed text-ink-600 sm:text-base">
                {t.landing.trustLead}
              </p>
            </div>

            <ul className="space-y-3">
              {t.landing.security.map((item) => (
                <li
                  key={item.title}
                  className="flex gap-3 rounded-card border border-ink-200/80 bg-surface p-4"
                >
                  <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-accent" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-semibold text-ink-950">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink-600">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-ink-100 bg-brand-900">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-5 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {user ? t.landing.finalTitleReady : t.landing.finalTitleSetup}
              </h2>
              <p className="text-sm leading-relaxed text-brand-100">
                {user ? t.landing.finalLeadReady : t.landing.finalLeadSetup}
              </p>
            </div>
            <LinkButton
              href={user ? "/dashboard" : "/register"}
              size="lg"
              className="bg-surface text-accent-strong hover:bg-brand-50 active:bg-brand-100"
              icon={<ArrowRight className="size-4 flip-rtl" aria-hidden="true" />}
            >
              {user ? t.landing.finalCtaDashboard : t.landing.finalCtaCreate}
            </LinkButton>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-100 bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>{t.landing.footerLeft}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href="/install"
              className="inline-flex items-center gap-1.5 font-medium text-accent hover:text-accent-strong"
            >
              <Download className="size-3.5" aria-hidden="true" />
              {t.landing.installCta}
            </Link>
            <p className="inline-flex items-center gap-1.5">
              <Server className="size-3.5" aria-hidden="true" />
              {t.landing.footerRight}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** A static mock of the reminders panel, so the landing page ships no screenshots. */
function VaultPreview({ t }: { t: Awaited<ReturnType<typeof getI18n>>["t"] }) {
  const rows = [
    {
      title: "Ahmed Khan · Passport",
      meta: "14 Mar 2029",
      tint: "bg-emerald-200",
      badge: "bg-emerald-100 text-emerald-800",
      badgeText: t.common.valid,
    },
    {
      title: "Sana Khan · CNIC",
      meta: "22 Nov 2026",
      tint: "bg-amber-200",
      badge: "bg-amber-100 text-amber-900",
      badgeText: t.common.renewSoon,
    },
    {
      title: "House lease agreement",
      meta: "02 Aug 2026",
      tint: "bg-red-200",
      badge: "bg-red-100 text-red-800",
      badgeText: t.common.expired,
    },
  ];

  return (
    <div className="relative rounded-card border border-ink-200 bg-surface p-3 shadow-raised sm:p-4">
      <div className="flex items-center justify-between border-b border-ink-100 pb-3">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-300" />
          <span className="size-2.5 rounded-full bg-amber-300" />
          <span className="size-2.5 rounded-full bg-emerald-300" />
        </div>
        <span className="text-[0.7rem] font-medium uppercase tracking-wider text-ink-400">
          {t.landing.previewTitle}
        </span>
      </div>

      <div className="space-y-2.5 pt-3.5">
        {rows.map((row) => (
          <div
            key={row.title}
            className="flex items-center gap-3 rounded-lg border border-ink-100 bg-ink-50/50 px-3 py-2.5"
          >
            <span className={`size-8 shrink-0 rounded-md ${row.tint}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8rem] font-medium text-ink-900">
                {row.title}
              </span>
              <span className="block truncate text-[0.7rem] text-ink-500">{row.meta}</span>
            </span>
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-[0.65rem] font-semibold ${row.badge}`}
            >
              {row.badgeText}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg bg-brand-50 px-3 py-2.5 ring-1 ring-brand-100 ring-inset">
        <p className="text-[0.7rem] font-medium text-accent-strong">{t.landing.previewQ}</p>
        <p className="mt-1 text-[0.7rem] leading-relaxed text-accent">{t.landing.previewA}</p>
      </div>
    </div>
  );
}
