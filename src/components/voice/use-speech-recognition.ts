"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { normaliseTranscript, type SpeechLanguage } from "@/lib/voice/speech";
import { canUseOnDeviceModel, transcribeOnDevice } from "@/lib/voice/whisper";

/**
 * Microphone input, on-device only.
 *
 * Transcription runs in a Web Worker (Whisper via transformers.js) and the
 * audio never leaves the device. The browser's own Web Speech API is
 * deliberately not used: on Chromium and Safari it uploads the recording to the
 * vendor's servers, which this app will not do. When the on-device model cannot
 * run, voice input simply fails closed.
 *
 * The microphone is opened only on an explicit tap and every track is stopped
 * when recording ends or the component unmounts.
 */

type Status = "idle" | "requesting" | "recording" | "working";

/** Decodes a recorded clip and reduces it to the 16 kHz mono PCM Whisper wants. */
async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const Ctor =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  const context = new Ctor();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const mono = new Float32Array(length);

    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) mono[i] += data[i] / channels;
    }

    return buffer.sampleRate === 16000 ? mono : resample(mono, buffer.sampleRate, 16000);
  } finally {
    void context.close();
  }
}

function resample(input: Float32Array, from: number, to: number): Float32Array {
  const ratio = from / to;
  const output = new Float32Array(Math.floor(input.length / ratio));

  for (let i = 0; i < output.length; i += 1) {
    const position = i * ratio;
    const before = Math.floor(position);
    const after = Math.min(before + 1, input.length - 1);
    const weight = position - before;
    output[i] = input[before] * (1 - weight) + input[after] * weight;
  }

  return output;
}

/**
 * Maps a capture failure to the error code the UI understands. A denied mic
 * permission or a browser security restriction becomes "not-allowed" so the
 * caller shows the microphone-permission message; anything else is an
 * unsupported/failed capture.
 */
export function speechErrorCode(error: unknown): "not-allowed" | "unsupported" {
  const record =
    error && typeof error === "object"
      ? (error as { name?: unknown; message?: unknown })
      : null;
  const name = typeof record?.name === "string" ? record.name : "";
  const message =
    typeof record?.message === "string" ? record.message : typeof error === "string" ? error : "";

  return /not[-_ ]?allowed|denied|permission|security/i.test(`${name} ${message}`)
    ? "not-allowed"
    : "unsupported";
}

/* `Worker`, `AudioContext`, `MediaRecorder` and `navigator.mediaDevices` only
   exist in a browser, so capability cannot be read during render: the server
   HTML and the hydration render must agree. Reporting "unsupported" first and
   re-reading after mount keeps the mic disabled until the real check lands. */
function subscribeRecognitionSupport(onChange: () => void): () => void {
  window.addEventListener("load", onChange);
  return () => window.removeEventListener("load", onChange);
}

function readRecognitionSupport(): boolean {
  return canUseOnDeviceModel();
}

function serverRecognitionSupport(): boolean {
  return false;
}

export type UseSpeechRecognitionOptions = {
  language: SpeechLanguage;
  onResult: (transcript: string) => void;
};

export function useSpeechRecognition({ language, onResult }: UseSpeechRecognitionOptions) {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);

  const canUseOnDevice = useSyncExternalStore(
    subscribeRecognitionSupport,
    readRecognitionSupport,
    serverRecognitionSupport,
  );
  const supported = canUseOnDevice;

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => releaseStream, [releaseStream]);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    releaseStream();
    setStatus("idle");
  }, [releaseStream]);

  const recordForModel = useCallback(async () => {
    // "Requesting Permission" until the browser actually hands over the mic.
    setStatus("requesting");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (cancelledRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      setStatus("idle");
      return;
    }
    streamRef.current = stream;
    cancelledRef.current = false;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });

    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      releaseStream();

      if (cancelledRef.current || blob.size === 0) {
        setStatus("idle");
        return;
      }

      setStatus("working");
      void (async () => {
        try {
          const audio = await decodeToMono16k(blob);
          if (cancelledRef.current) return;
          const text = await transcribeOnDevice({
            audio,
            language,
            onProgress: (info) =>
              setProgress(info.status === "download" ? Math.round(info.progress ?? 0) : null),
          });
          if (cancelledRef.current) return;
          onResult(normaliseTranscript(text));
        } catch (caught) {
          if (!cancelledRef.current) {
            setError(caught instanceof Error ? caught.message : "Transcription failed");
          }
        } finally {
          setProgress(null);
          setStatus("idle");
        }
      })();
    });

    // Capture is really running now — only then is it honest to say "Listening".
    recorder.start();
    setStatus("recording");
  }, [language, onResult, releaseStream]);

  const start = useCallback(async () => {
    setError(null);

    if (!canUseOnDevice) {
      setError("unsupported");
      return;
    }

    try {
      await recordForModel();
    } catch (caught) {
      // Permission denied, or no device.
      setError(speechErrorCode(caught));
    }
  }, [canUseOnDevice, recordForModel]);

  return {
    supported,
    requesting: status === "requesting",
    listening: status === "recording",
    working: status === "working",
    canUseOnDevice,
    progress,
    error,
    start,
    stop,
    // Stop cancels both recording and the transcription pass that follows it.
    toggle: () => (status === "idle" ? void start() : stop()),
  };
}
