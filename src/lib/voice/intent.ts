/**
 * A very small intent classifier for spoken requests.
 *
 * It exists so the assistant can turn a short spoken instruction into the right
 * action — most importantly "explain this" ("Understand it") and "what expires
 * soon?" — without sending the utterance anywhere. It is deliberately a keyword
 * test rather than a model: it is instant, offline and easy to reason about,
 * and the full question is still passed through to the assistant afterwards.
 *
 * English, Urdu and (best-effort) Punjabi keywords are matched; the transcript
 * is normalised first so punctuation and spacing do not matter.
 */

import { normaliseTranscript } from "./speech";

export type VoiceIntent = "understand" | "expiry" | "count" | "ask";

const KEYWORDS: Record<Exclude<VoiceIntent, "ask">, string[]> = {
  // "explain", "what does this mean", سمجھاؤ / مطلب
  understand: [
    "understand",
    "explain",
    "simplify",
    "in simple words",
    "what does this mean",
    "what does it mean",
    "summarise",
    "summarize",
    "summary",
    "سمجھا",
    "سمجھاؤ",
    "سمجھائیں",
    "مطلب",
    "آسان الفاظ",
    "خلاصہ",
  ],
  // "expire", "renew", میعاد / ختم
  expiry: [
    "expire",
    "expires",
    "expiring",
    "expiry",
    "renew",
    "due date",
    "run out",
    "کب ختم",
    "میعاد",
    "ختم ہو",
    "تجدید",
  ],
  // "how many", کتنے / تعداد
  count: [
    "how many",
    "how much",
    "number of",
    "count",
    "total",
    "کتنے",
    "کتنی",
    "تعداد",
  ],
};

export function classifyIntent(raw: string): VoiceIntent {
  const text = normaliseTranscript(raw).toLowerCase();
  if (!text) return "ask";

  // An explicit request to explain wins over everything else.
  if (KEYWORDS.understand.some((word) => text.includes(word))) return "understand";
  if (KEYWORDS.expiry.some((word) => text.includes(word))) return "expiry";
  if (KEYWORDS.count.some((word) => text.includes(word))) return "count";
  return "ask";
}

/**
 * The question a spoken intent turns into when the assistant acts on it rather
 * than simply filling the box. Kept separate from `classifyIntent` so the
 * wording can be reviewed on its own.
 */
export const INTENT_QUESTIONS: Record<VoiceIntent, string | null> = {
  understand: "Explain this document in simple words: what is it and what do I need to know?",
  expiry: "Which documents are expiring soon?",
  count: null,
  ask: null,
};
