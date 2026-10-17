import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Tone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  brand: "bg-brand-50 text-accent ring-brand-200",
  info: "bg-info-surface text-info-ink ring-info-border",
  success: "bg-success-surface text-success-ink ring-success-border",
  warning: "bg-warning-surface text-warning-ink ring-warning-border",
  danger: "bg-danger-surface text-danger-ink ring-danger-border",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  icon,
  title,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Small dot + label, used for status columns in tables. */
export function StatusDot({ tone = "neutral", label }: { tone?: Tone; label: string }) {
  const dot: Record<Tone, string> = {
    neutral: "bg-ink-400",
    brand: "bg-brand-500",
    info: "bg-info",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600">
      <span className={cn("size-1.5 shrink-0 rounded-full", dot[tone])} aria-hidden="true" />
      {label}
    </span>
  );
}
