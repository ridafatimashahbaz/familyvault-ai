import Link from "next/link";

import { formatBytes, timeAgo } from "@/lib/utils";
import type { DocumentSummary } from "@/lib/serializers";
import { CategoryTile, ExpiryBadge, StatusBadge } from "./badges";

/**
 * One line in a document list. Used by the dashboard's recent panel and by the
 * full documents table, so both stay visually identical.
 */
export function DocumentRow({
  doc,
  compact = false,
}: {
  doc: DocumentSummary;
  /** Drops the secondary meta line for tight side panels. */
  compact?: boolean;
}) {
  const meta = [
    doc.docTypeLabel,
    doc.familyMember?.name,
    compact ? null : formatBytes(doc.sizeBytes),
    compact ? null : timeAgo(doc.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/documents/${doc.id}`}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50 focus-visible:bg-ink-50 sm:px-5"
    >
      <CategoryTile category={doc.category} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900 group-hover:text-accent-strong">
          {doc.title}
        </span>
        {meta ? <span className="mt-0.5 block truncate text-xs text-ink-500">{meta}</span> : null}
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {doc.status !== "ready" ? <StatusBadge status={doc.status} /> : null}
        {/* "No expiry" is the common case; showing it on every row is just noise. */}
        {doc.expiry !== "none" ? (
          <span className="hidden sm:block">
            <ExpiryBadge expiry={doc.expiry} daysToExpiry={doc.daysToExpiry} />
          </span>
        ) : null}
      </span>
    </Link>
  );
}
