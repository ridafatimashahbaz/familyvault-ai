import { Vault } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Wordmark. The vault dial doubles as the favicon concept, so the brand stays
 * recognisable at 16px in a browser tab.
 */
export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white shadow-card">
        <Vault className="size-4.5" aria-hidden="true" strokeWidth={2.2} />
      </span>
      {compact ? null : (
        <span className="flex flex-col leading-none">
          <span className="text-[0.95rem] font-semibold tracking-tight text-ink-950">
            FamilyVault
          </span>
          <span className="mt-0.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-accent">
            AI
          </span>
        </span>
      )}
    </span>
  );
}
