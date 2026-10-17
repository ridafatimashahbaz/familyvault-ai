import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Headline number with an optional link. Rendered as a link only when there is
 * somewhere useful to go, so it never looks clickable and then does nothing.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  href?: string;
  tone?: "neutral" | "brand" | "warning" | "danger" | "success";
}) {
  const tones = {
    neutral: "bg-ink-100 text-ink-600",
    brand: "bg-brand-50 text-accent",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    success: "bg-emerald-50 text-emerald-700",
  } as const;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-500">{label}</p>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-950 tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-ink-500">{hint}</p> : null}
    </>
  );

  const className =
    "block rounded-card border border-ink-200/80 bg-surface p-4 shadow-card transition-shadow hover:shadow-raised sm:p-5";

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={cn(className, "cursor-default hover:shadow-card")}>
      {body}
    </div>
  );
}
