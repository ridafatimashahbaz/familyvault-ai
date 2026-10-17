import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";

import { GuestProvider } from "@/components/guest/signup-gate";
import { GuestVault } from "@/components/guest/guest-vault";
import { Logo } from "@/components/brand";
import { LinkButton } from "@/components/ui/button";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Try the demo",
  description:
    "Explore a sample FamilyVault AI vault without an account: browse documents, see expiry reminders and ask the assistant.",
};

/**
 * Public, no-login experience. Everything here runs from an in-memory sample
 * dataset; the first attempt to add or change data opens the signup dialog.
 */
export default async function TryPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <GuestProvider>
      <div className="min-h-screen bg-canvas">
        <header className="sticky top-0 z-20 border-b border-ink-200/80 bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Link href="/" aria-label="FamilyVault AI home">
              <Logo />
            </Link>
            <nav className="flex items-center gap-2" aria-label="Account">
              <LinkButton href="/login" variant="ghost">
                Sign in
              </LinkButton>
              <LinkButton href="/register">Create account</LinkButton>
            </nav>
          </div>
        </header>

        <div className="border-b border-brand-100 bg-brand-50">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-6 lg:px-8">
            <Sparkles className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-accent-strong">
              <span className="font-semibold">Demo mode.</span> You are looking at a sample vault.
              Anything that saves data asks you to create a free account first.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 font-semibold text-accent hover:text-accent-strong"
            >
              Sign up
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
              Explore a family vault
            </h1>
            <p className="text-sm leading-relaxed text-ink-600">
              This is the real interface, filled with seven fictional documents. Click around — then
              create an account to start your own.
            </p>
          </div>

          <GuestVault />
        </main>

        <footer className="border-t border-ink-200/70 px-4 py-6 text-xs text-ink-400 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2">
            <p>FamilyVault AI — a sample vault for demonstration. No real data is stored.</p>
            <Link href="/" className="hover:text-ink-600 hover:underline">
              Back to home
            </Link>
          </div>
        </footer>
      </div>
    </GuestProvider>
  );
}
