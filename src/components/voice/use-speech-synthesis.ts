"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { SPEECH_LOCALES, type SpeechLanguage } from "@/lib/voice/speech";

/* `speechSynthesis` only exists in a browser. Reading support through
   useSyncExternalStore keeps the server render and the hydration render
   identical, and adds the button only after hydration instead of during it. */
function subscribeSpeechSupport(onChange: () => void): () => void {
  window.addEventListener("load", onChange);
  return () => window.removeEventListener("load", onChange);
}

function readSpeechSupport(): boolean {
  return "speechSynthesis" in window;
}

function serverSpeechSupport(): boolean {
  return false;
}

/* Voices load asynchronously and `getVoices()` is empty until they arrive, so
   availability is read through its own store that re-fires on `voiceschanged`. */
function subscribeVoices(onChange: () => void): () => void {
  if (!("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", onChange);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", onChange);
}

function readVoices(): SpeechSynthesisVoice[] {
  return "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
}

function serverVoices(): SpeechSynthesisVoice[] {
  return [];
}

/** Preferred subtags, most-specific first, for each read-aloud language. */
const VOICE_PREFERENCES: Record<SpeechLanguage, string[]> = {
  en: ["en-us", "en-gb", "en"],
  ur: ["ur-pk", "ur-in", "ur"],
  pa: ["pa-in", "pa"],
};

/**
 * Picks the best installed voice for a language: the most-preferred subtag that
 * exists, falling back to any voice whose tag starts with the language. Returns
 * `undefined` when the browser has no voice for it at all.
 */
export function selectVoice(voices: SpeechSynthesisVoice[], language: SpeechLanguage): SpeechSynthesisVoice | undefined {
  const preferred = VOICE_PREFERENCES[language];
  for (const tag of preferred) {
    const exact = voices.find((voice) => voice.lang.toLowerCase().replace("_", "-") === tag);
    if (exact) return exact;
  }
  return voices.find((voice) => voice.lang.toLowerCase().replace("_", "-").startsWith(language));
}

/**
 * Read-aloud via the browser's own `speechSynthesis`. On-device: no audio is
 * sent anywhere. One utterance plays at a time; a second tap stops the first.
 */
export function useSpeechSynthesis(language: SpeechLanguage) {
  const supported = useSyncExternalStore(subscribeSpeechSupport, readSpeechSupport, serverSpeechSupport);
  const voices = useSyncExternalStore(subscribeVoices, readVoices, serverVoices);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, [supported]);

  // Leaving the page should not keep talking.
  useEffect(() => {
    if (!supported) return;
    return () => window.speechSynthesis.cancel();
  }, [supported]);

  const hasVoice = useCallback(
    (target: SpeechLanguage) => selectVoice(voices, target) !== undefined,
    [voices],
  );

  const speak = useCallback(
    (id: string, text: string, speakLanguage?: SpeechLanguage) => {
      if (!supported) return;
      const target = speakLanguage ?? language;
      const trimmed = text.trim();
      if (!trimmed) return;

      const synth = window.speechSynthesis;

      // A second tap on the same answer stops it; a tap on another switches.
      if (speakingId === id) {
        cancel();
        return;
      }

      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.lang = SPEECH_LOCALES[target];
      const voice = selectVoice(voices, target);
      if (voice) utterance.voice = voice;
      utterance.onend = () => setSpeakingId((current) => (current === id ? null : current));
      utterance.onerror = () => setSpeakingId((current) => (current === id ? null : current));

      setSpeakingId(id);
      synth.speak(utterance);
    },
    [cancel, language, speakingId, supported, voices],
  );

  return { supported, speakingId, speak, cancel, hasVoice };
}
