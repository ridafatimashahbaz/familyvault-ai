"use client";

import { Languages } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";

const OPTIONS: { locale: "en" | "ur"; label: string }[] = [
  { locale: "en", label: "EN" },
  { locale: "ur", label: "اردو" },
];

/** Compact two-way language switch, shown in the headers. */
export function LocaleToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <div
      role="group"
      aria-label={t.common.language}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-ink-200 bg-ink-50 p-0.5",
        className,
      )}
    >
      <Languages className="mx-1 size-3.5 text-ink-400" aria-hidden="true" />
      {OPTIONS.map((option) => {
        const active = locale === option.locale;
        return (
          <button
            key={option.locale}
            type="button"
            onClick={() => setLocale(option.locale)}
            aria-pressed={active}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              active ? "bg-surface text-ink-900 shadow-card" : "text-ink-500 hover:text-ink-800",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
