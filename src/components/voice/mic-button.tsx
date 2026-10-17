"use client";

import { Mic, Square } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { Spinner } from "@/components/ui/spinner";

/** Turns an error code from the recogniser into something worth showing a person. */
export function speechErrorMessage(code: string, t: Dictionary): string {
  if (code === "unsupported") return t.voice.unsupported;
  if (/not-allowed|permission|denied/i.test(code)) return t.voice.micDenied;
  return t.voice.modelFailed;
}

/**
 * The microphone. Presentation only — the recogniser lives with the caller so
 * one hook drives both the button and the status badges beside it.
 */
export function MicButton({
  listening,
  requesting,
  working,
  progress,
  supported,
  disabled,
  onToggle,
  className,
}: {
  listening: boolean;
  requesting: boolean;
  working: boolean;
  progress: number | null;
  supported: boolean;
  disabled?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const { t } = useLocale();
  const busy = requesting || working;
  const label = working
    ? t.voice.preparing
    : requesting
      ? t.voice.requesting
      : listening
        ? t.voice.stop
        : t.voice.listen;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        title={supported ? label : t.voice.unsupported}
        aria-pressed={listening || working}
        disabled={disabled || !supported || requesting}
        onClick={onToggle}
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:pointer-events-none disabled:opacity-55",
          listening || working
            ? "border-danger/40 bg-danger/10 text-danger"
            : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50",
        )}
      >
        {busy ? (
          <Spinner className="size-4" />
        ) : listening ? (
          <Square className="size-4" aria-hidden="true" />
        ) : (
          <Mic className="size-4" aria-hidden="true" />
        )}
      </button>
      {progress !== null ? (
        <span className="pointer-events-none absolute -end-1 -top-1 rounded-full bg-brand-700 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {progress}%
        </span>
      ) : null}
    </div>
  );
}
