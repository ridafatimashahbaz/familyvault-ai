"use client";

import { Mic } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";

/**
 * A short "how to use the microphone" note. Speech is always handled on this
 * device, so the badge is a fixed statement rather than a per-session status.
 */
export function VoiceHelp({ onDeviceAvailable }: { onDeviceAvailable: boolean }) {
  const { t } = useLocale();

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-accent hover:text-accent-strong">
        <Mic className="size-3.5" aria-hidden="true" />
        {t.voice.helpTitle}
        <Badge tone={onDeviceAvailable ? "success" : "neutral"}>{t.voice.onDeviceBadge}</Badge>
      </summary>
      <div className="mt-2 space-y-1.5 rounded-lg border border-ink-200 bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">
        <p>{t.voice.helpBody}</p>
        <p className="text-ink-500">{t.voice.modeNote}</p>
        <p className="font-medium text-ink-700">{t.voice.helpPrivacy}</p>
      </div>
    </details>
  );
}
