import Link from "next/link";

import { Logo } from "@/components/brand";
import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-16 text-center">
      <Logo />
      <p className="mt-8 text-sm font-semibold uppercase tracking-wider text-accent">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-950">
        That page is not in the vault
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-600">
        The link may be out of date, or the document it pointed to has been deleted.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <LinkButton href="/dashboard">Go to dashboard</LinkButton>
        <LinkButton href="/documents" variant="secondary">
          Browse documents
        </LinkButton>
      </div>
      <Link href="/" className="mt-6 text-xs text-ink-400 hover:text-ink-600 hover:underline">
        FamilyVault AI home
      </Link>
    </div>
  );
}
