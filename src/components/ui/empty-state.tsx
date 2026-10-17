import type { ComponentType, ReactNode } from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The "nothing here yet" state. Every list in the app uses this so an empty
 * vault reads as an invitation rather than a blank screen.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-accent ring-1 ring-brand-100">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-ink-900">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-md text-sm leading-relaxed text-ink-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
