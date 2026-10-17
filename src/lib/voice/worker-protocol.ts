/**
 * The message contract between the main thread and the on-device Whisper
 * worker. Kept in its own module so both sides can import the types without
 * pulling the other's runtime in.
 */

import type { SpeechLanguage, WhisperModelId } from "./speech";

export type WhisperProgress = {
  /** `download` carries byte progress while the model is fetched. */
  status: "download" | "ready";
  file?: string;
  /** Percentage 0-100 across the whole model, when the runtime reports it. */
  progress?: number;
  loaded?: number;
  total?: number;
};

export type WhisperRequest = {
  id: number;
  type: "transcribe";
  /** 16 kHz mono PCM, already decoded on the main thread. */
  audio: Float32Array;
  language: SpeechLanguage;
  model: WhisperModelId;
};

export type WhisperResponse =
  | { id: number; type: "progress"; progress: WhisperProgress }
  | { id: number; type: "result"; text: string }
  | { id: number; type: "error"; message: string };
