/// <reference lib="webworker" />

/**
 * On-device speech recognition.
 *
 * The Whisper model runs here, inside a Web Worker, via transformers.js on
 * WebAssembly. Nothing is uploaded: the audio arrives as a Float32Array over
 * the structured-clone boundary and the transcript goes back the same way.
 *
 * The model is loaded lazily on the first request and kept in the browser cache
 * so a second use — including offline — does not download it again. A pipeline
 * is cached per model id, so switching checkpoints does not reload the one
 * already in memory while the worker lives.
 */

import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

import { WHISPER_LANGUAGES, WHISPER_MODELS, type WhisperModelId } from "@/lib/voice/speech";
import type { WhisperProgress, WhisperRequest, WhisperResponse } from "@/lib/voice/worker-protocol";

// Everything comes from the hub (there is no local copy to prefer) and is
// cached by the browser so the model survives reloads — and works offline.
env.allowLocalModels = false;
env.useBrowserCache = true;

/** The subset of transformers.js's ProgressInfo the UI cares about. */
type RawProgress = {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

const pipelines = new Map<WhisperModelId, Promise<AutomaticSpeechRecognitionPipeline>>();

function getPipeline(
  model: WhisperModelId,
  onProgress: (progress: WhisperProgress) => void,
): Promise<AutomaticSpeechRecognitionPipeline> {
  const existing = pipelines.get(model);
  if (existing) return existing;

  const created = pipeline("automatic-speech-recognition", WHISPER_MODELS[model], {
    dtype: "q8",
    progress_callback: (info) => {
      const raw = info as RawProgress;
      if (raw.status === "progress" || raw.status === "progress_total") {
        onProgress({
          status: "download",
          file: raw.file,
          progress: raw.progress,
          loaded: raw.loaded,
          total: raw.total,
        });
      } else if (raw.status === "ready") {
        onProgress({ status: "ready" });
      }
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>;

  pipelines.set(model, created);
  return created;
}

self.addEventListener("message", (event: MessageEvent<WhisperRequest>) => {
  void handle(event.data);
});

function post(message: WhisperResponse) {
  self.postMessage(message);
}

async function handle({ id, audio, language, model }: WhisperRequest) {
  try {
    const asr = await getPipeline(model, (progress) => post({ id, type: "progress", progress }));
    const output = await asr(audio, {
      language: WHISPER_LANGUAGES[language],
      task: "transcribe",
      chunk_length_s: 30,
    });

    const text = Array.isArray(output) ? output.map((part) => part.text).join(" ") : output.text;
    post({ id, type: "result", text });
  } catch (error) {
    post({
      id,
      type: "error",
      message: error instanceof Error ? error.message : "Transcription failed",
    });
  }
}
