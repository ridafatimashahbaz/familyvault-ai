import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Plain link pagination. The caller supplies the href for a page number, so the
 * same control works for the documents list and for any other paged view while
 * keeping the current filters intact.
 */
export function Pagination({
  page,
  pages,
  hrefFor,
  className,
}: {
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (pages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-between gap-3", className)}
    >
      <p className="text-sm text-ink-500">
        Page <span className="font-medium text-ink-800 tabular-nums">{page}</span> of{" "}
        <span className="tabular-nums">{pages}</span>
      </p>

      <div className="flex items-center gap-1">
        <PageLink href={hrefFor(page - 1)} label="Previous page" disabled={page <= 1}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </PageLink>

        <div className="hidden items-center gap-1 sm:flex">
          {pageWindow(page, pages).map((entry, index) =>
            entry === "gap" ? (
              <span key={`gap-${index}`} className="px-1.5 text-sm text-ink-400" aria-hidden="true">
                …
              </span>
            ) : (
              <Link
                key={entry}
                href={hrefFor(entry)}
                aria-current={entry === page ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium tabular-nums transition-colors",
                  entry === page
                    ? "bg-brand-700 text-white"
                    : "border border-ink-200 bg-surface text-ink-700 hover:bg-ink-50",
                )}
              >
                {entry}
              </Link>
            ),
          )}
        </div>

        <PageLink href={hrefFor(page + 1)} label="Next page" disabled={page >= pages}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  label,
  disabled,
  children,
}: {
  href: string;
  label: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const className =
    "inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-ink-200 bg-surface px-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:pointer-events-none disabled:opacity-40";

  return disabled ? (
    <span className={className} aria-disabled="true">
      {children}
      <span className="sr-only">{label}</span>
    </span>
  ) : (
    <Link href={href} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

/** 1 … 4 5 [6] 7 8 … 20, capped so a long list never wraps. */
function pageWindow(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

  const out: (number | "gap")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);

  if (from > 2) out.push("gap");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pages - 1) out.push("gap");

  out.push(pages);
  return out;
}
