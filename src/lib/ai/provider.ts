import { env } from "@/lib/env";

/**
 * AI status.
 *
 * The app runs entirely on built-in local engines: extractive summaries,
 * keyword retrieval and intent-based answers. There is deliberately **no** LLM
 * provider and no code path that sends document text, metadata, prompts or a
 * question to any third party. `aiStatus()` exists only so the interface can
 * name the engine that produced an answer.
 */

export const LOCAL_ENGINE_LABEL = "Built-in local engine";

export type AiStatus = {
  provider: "local";
  /** Shown in the UI so users know which engine produced an answer. */
  label: string;
  model: "local";
  ocrEnabled: boolean;
};

export function aiStatus(): AiStatus {
  return {
    provider: "local",
    label: LOCAL_ENGINE_LABEL,
    model: "local",
    ocrEnabled: env().OCR_ENGINE !== "none",
  };
}
