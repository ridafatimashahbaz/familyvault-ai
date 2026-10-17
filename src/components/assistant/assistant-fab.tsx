"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BotMessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";

/**
 * The assistant's own front door: one prominent floating button, always within
 * thumb reach at the bottom of the screen, on every signed-in page. The sidebar
 * no longer lists it — this is where it lives now.
 *
 * Hidden on the assistant page itself so it never points at where you already
 * are. Positioned with logical utilities (`end-*`) so it mirrors in RTL.
 */
export function AssistantFab() {
  const pathname = usePathname();
  const { t } = useLocale();

  if (pathname === "/assistant" || pathname.startsWith("/assistant/")) return null;

  return (
    <Link
      href="/assistant"
      aria-label={t.nav.assistant}
      title={t.nav.assistant}
      className={cn(
        "group fixed bottom-5 end-5 z-30 inline-flex items-center gap-2.5",
        "rounded-full bg-brand-700 ps-4 pe-4 py-3.5 text-sm font-semibold text-white",
        "shadow-raised ring-1 ring-brand-900/10 transition-all",
        "hover:bg-brand-800 hover:shadow-lg active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
      )}
    >
      <BotMessageSquare className="size-5.5 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">{t.nav.assistant}</span>
    </Link>
  );
}
