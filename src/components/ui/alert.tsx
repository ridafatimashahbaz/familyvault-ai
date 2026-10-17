import type { ReactNode } from "react";
import { Info, CircleCheck, TriangleAlert, OctagonX } from "lucide-react";

import { cn } from "@/lib/utils";

const STYLES: Record<"info" | "success" | "warning" | "danger", string> = {
  info: "border-info-border bg-info-surface text-info-ink",
  success: "border-success-border bg-success-surface text-success-ink",
  warning: "border-warning-border bg-warning-surface text-warning-ink",
  danger: "border-danger-border bg-danger-surface text-danger-ink",
};

const ICONS = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: OctagonX,
} as const;

export type AlertTone = keyof typeof ICONS;

export function Alert({
  tone = "info",
  title,
  className,
  children,
  action,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  className?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = ICONS[tone];

  return (
    <div
      className={cn("flex gap-3 rounded-lg border px-3.5 py-3 text-sm", STYLES[tone], className)}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="leading-relaxed opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Stacked list of non-fatal processing warnings, e.g. "OCR confidence was low". */
export function WarningList({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;

  return (
    <Alert tone="warning" title={`${items.length} ${items.length === 1 ? "notice" : "notices"}`} className={className}>
      <ul className="list-disc space-y-1 pl-4">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Alert>
  );
}
