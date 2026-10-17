"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { THEME_CHOICES, type ThemeChoice } from "@/lib/theme";
import { useTheme } from "@/components/theme-provider";

const LABELS: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const ICONS: Record<ThemeChoice, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/** Three-way segmented control — the explicit choice, used in Settings and menus. */
export function ThemeToggle({ className }: { className?: string }) {
  const { choice, setChoice } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-ink-50 p-1",
        className,
      )}
    >
      {THEME_CHOICES.map((option) => {
        const Icon = ICONS[option];
        const active = choice === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setChoice(option)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-surface text-ink-900 shadow-card"
                : "text-ink-500 hover:text-ink-800",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

const ORDER: ThemeChoice[] = ["light", "dark", "system"];

/** Single icon that cycles Light → Dark → System, for tight header space. */
export function IconThemeToggle({ className }: { className?: string }) {
  const { choice, resolved, setChoice } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setChoice(ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length])}
      title={`Theme: ${LABELS[choice]} — click to change`}
      aria-label={`Colour theme: ${LABELS[choice]}. Change theme.`}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800",
        className,
      )}
    >
      {resolved === "dark" ? (
        <Moon className="size-4.5" aria-hidden="true" />
      ) : (
        <Sun className="size-4.5" aria-hidden="true" />
      )}
      <span className="sr-only">{LABELS[choice]}</span>
    </button>
  );
}
