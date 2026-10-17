import type { ComponentType } from "react";
import {
  BookOpen,
  CircleSlash,
  Clock,
  FileText,
  GraduationCap,
  HeartPulse,
  IdCard,
  House,
  Scale,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { CATEGORIES, type CategoryKey } from "@/lib/constants";
import { EXPIRY_STATE_LABEL, type ExpiryState } from "@/lib/utils";
import { Badge, type Tone } from "@/components/ui/badge";

/** Shared visual language for the bits of a document that appear on every list. */

const CATEGORY_ICONS: Record<CategoryKey, LucideIcon> = {
  identity: IdCard,
  civil: BookOpen,
  education: GraduationCap,
  medical: HeartPulse,
  property: House,
  financial: Wallet,
  legal: Scale,
  other: FileText,
};

export function CategoryIcon({
  category,
  className = "size-4.5",
}: {
  category: string;
  className?: string;
}) {
  const Icon: ComponentType<{ className?: string }> =
    CATEGORY_ICONS[category as CategoryKey] ?? FileText;
  return <Icon className={className} aria-hidden="true" />;
}

/** Tile shown next to each document in lists and on the detail page. */
export function CategoryTile({ category, className = "" }: { category: string; className?: string }) {
  return (
    <span
      className={`flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-accent ring-1 ring-brand-100 ${className}`}
    >
      <CategoryIcon category={category} />
    </span>
  );
}

const EXPIRY_TONES: Record<ExpiryState, Tone> = {
  expired: "danger",
  critical: "warning",
  warning: "warning",
  ok: "success",
  none: "neutral",
};

export function ExpiryBadge({
  expiry,
  daysToExpiry,
  showDays = true,
}: {
  expiry: ExpiryState;
  daysToExpiry?: number | null;
  showDays?: boolean;
}) {
  if (expiry === "none") {
    return (
      <Badge tone="neutral" icon={<CircleSlash className="size-3" aria-hidden="true" />}>
        No expiry
      </Badge>
    );
  }

  const label =
    showDays && daysToExpiry !== null && daysToExpiry !== undefined
      ? daysToExpiry < 0
        ? `${EXPIRY_STATE_LABEL[expiry]} · ${Math.abs(daysToExpiry)}d ago`
        : `${EXPIRY_STATE_LABEL[expiry]} · in ${daysToExpiry}d`
      : EXPIRY_STATE_LABEL[expiry];

  return (
    <Badge tone={EXPIRY_TONES[expiry]} icon={<Clock className="size-3" aria-hidden="true" />}>
      {label}
    </Badge>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  ready: "success",
  processing: "info",
  queued: "neutral",
  failed: "danger",
};

const STATUS_LABELS: Record<string, string> = {
  ready: "Ready",
  processing: "Processing",
  queued: "Queued",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"}>{STATUS_LABELS[status] ?? status}</Badge>;
}

/**
 * Classification confidence is shown because OCR'd text is genuinely ambiguous
 * sometimes; a low number is an invitation to check, not a bug.
 */
export function ConfidenceBadge({
  confidence,
  source,
}: {
  confidence: number;
  source: string;
}) {
  const percent = Math.round(confidence * 100);
  const tone: Tone = percent >= 70 ? "brand" : percent >= 45 ? "warning" : "danger";
  const origin = source === "manual" ? "Set by you" : source === "llm" ? "AI-assisted" : "Auto";

  return (
    <Badge tone={tone} title={`${origin} classification, ${percent}% confident`}>
      {origin} · {percent}%
    </Badge>
  );
}

/** Category label chip, kept separate so lists can drop it on narrow screens. */
export function CategoryBadge({ category }: { category: string }) {
  const key = category in CATEGORIES ? (category as CategoryKey) : "other";
  return <Badge tone="neutral">{CATEGORIES[key].label}</Badge>;
}
