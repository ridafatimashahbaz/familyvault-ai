"use client";

import { useEffect } from "react";
import Link from "next/link";
import { OctagonX, RotateCw } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

/**
 * Catches render errors anywhere below the root layout. Logged to the console
 * rather than sent anywhere: a self-hosted vault should not phone home.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ui] unhandled render error", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-100">
        <OctagonX className="size-6" aria-hidden="true" />
      </span>

      <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink-950">
        Something went wrong on this page
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-600">
        Your documents are safe — this is a display error, not a problem with your vault. Try again,
        and if it keeps happening check the server log.
      </p>

      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-ink-400">Reference: {error.digest}</p>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className={buttonClass("primary", "md")}>
          <RotateCw className="size-4" aria-hidden="true" />
          Try again
        </button>
        <Link href="/dashboard" className={buttonClass("secondary", "md")}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
