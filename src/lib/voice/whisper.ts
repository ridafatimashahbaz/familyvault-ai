/**
 * Main-thread front end for the on-device Whisper worker.
 *
 * It owns a single lazily-created worker and a map of in-flight requests, so
 * callers get a promise per utterance. If the worker cannot even be created
 * (an old browser, or a bundler that did not emit it), `canUseOnDeviceModel()`
 * returns `null`-equivalent `false` and voice input fails closed — there is no
 * cloud fallback.
 */

import type { SpeechLanguage, WhisperModelId } from "./speech";
import type { WhisperProgress, WhisperRequest, WhisperResponse } from "./worker-protocol";

type Pending = {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: WhisperProgress) => void;
};

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker | null {
  if (worker || workerFailed) return worker;

  try {
    worker = new Worker(new URL("../../workers/whisper.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    workerFailed = true;
    return null;
  }

  worker.addEventListener("message", (event: MessageEvent<WhisperResponse>) => {
    const data = event.data;
    const entry = pending.get(data.id);
    if (!entry) return;

    if (data.type === "progress") entry.onProgress?.(data.progress);
    else if (data.type === "result") {
      pending.delete(data.id);
      entry.resolve(data.text);
    } else {
      pending.delete(data.id);
      entry.reject(new Error(data.message));
    }
  });

  worker.addEventListener("error", () => {
    workerFailed = true;
    for (const entry of pending.values()) entry.reject(new Error("The speech worker stopped."));
    pending.clear();
    worker = null;
  });

  return worker;
}

/** Whether the on-device path can even be attempted in this browser. */
export function canUseOnDeviceModel(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export type TranscribeOptions = {
  audio: Float32Array;
  language: SpeechLanguage;
  model?: WhisperModelId;
  onProgress?: (progress: WhisperProgress) => void;
};

/** Transcribes 16 kHz mono PCM in the worker. Rejects if the model cannot run. */
export function transcribeOnDevice({
  audio,
  language,
  model = "base",
  onProgress,
}: TranscribeOptions): Promise<string> {
  const active = ensureWorker();
  if (!active) return Promise.reject(new Error("On-device speech is unavailable."));

  const id = nextId++;
  const request: WhisperRequest = { id, type: "transcribe", audio, language, model };

  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    active.postMessage(request, [audio.buffer]);
  });
}

/** The worker is a page-lifetime singleton; drop it when the tab goes away. */
export function disposeWhisperWorker(): void {
  worker?.terminate();
  worker = null;
  pending.clear();
}
