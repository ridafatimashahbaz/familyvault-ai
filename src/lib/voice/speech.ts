/**
 * Speech helpers shared by the microphone and read-aloud components.
 *
 * Everything here is pure so it can be unit-tested without a browser: the
 * language tables, the transcript tidy-up and the model table.
 */

export type SpeechLanguage = "en" | "ur" | "pa";

export const SPEECH_LANGUAGES: SpeechLanguage[] = ["en", "ur", "pa"];

/** BCP-47 tags for the browser's read-aloud (speech synthesis) API. */
export const SPEECH_LOCALES: Record<SpeechLanguage, string> = {
  en: "en-US",
  ur: "ur-PK",
  pa: "pa-IN",
};

/**
 * Whisper wants a language *name*, not a tag. Urdu is romanised as "urdu";
 * "punjabi" is best-effort (the multilingual models see it the least).
 */
export const WHISPER_LANGUAGES: Record<SpeechLanguage, string> = {
  en: "english",
  ur: "urdu",
  pa: "punjabi",
};

export function isSpeechLanguage(value: unknown): value is SpeechLanguage {
  return value === "en" || value === "ur" || value === "pa";
}

/**
 * Tidies a raw transcript: collapses runs of whitespace, drops zero-width and
 * bidi control characters that some engines insert, and trims the ends. A
 * trailing space is kept off so the value can be dropped straight into a form.
 */
export function normaliseTranscript(text: string): string {
  return text
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The model used by the on-device transcriber. `base` is the quantised
 * multilingual checkpoint: a reasonable size/accuracy trade for Urdu, and much
 * smaller than `small`. The tiny variant is offered to low-end devices.
 */
export const WHISPER_MODELS = {
  base: "onnx-community/whisper-base",
  tiny: "onnx-community/whisper-tiny",
} as const;

export type WhisperModelId = keyof typeof WHISPER_MODELS;
