"use client";

import { Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import type { SpeechLanguage } from "@/lib/voice/speech";
import { useSpeechSynthesis } from "./use-speech-synthesis";

/**
 * Reads one answer aloud in a specific language, on-device. When the browser
 * has no installed voice for that language it renders disabled with an honest
 * explanation rather than pretending to speak a language it cannot.
 */
export function SpeakButton({
  id,
  text,
  language,
  label,
  className,
}: {
  id: string;
  text: string;
  language: SpeechLanguage;
  label: string;
  className?: string;
}) {
  const { t } = useLocale();
  const { supported, speakingId, speak, hasVoice } = useSpeechSynthesis(language);
  if (!supported) return null;

  const available = hasVoice(language);
  const speaking = speakingId === id;
  const name = `${t.voice.readAloud} — ${label}`;

  return (
    <button
      type="button"
      aria-label={name}
      title={available ? name : t.voice.voiceUnavailable}
      aria-pressed={speaking}
      disabled={!available}
      onClick={() => speak(id, text, language)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        speaking
          ? "bg-brand-50 text-accent"
          : available
            ? "text-ink-500 hover:bg-ink-100 hover:text-ink-800"
            : "cursor-not-allowed text-ink-300",
        className,
      )}
    >
      {speaking ? (
        <VolumeX className="size-3.5" aria-hidden="true" />
      ) : (
        <Volume2 className="size-3.5" aria-hidden="true" />
      )}
      {name}
    </button>
  );
}
