import { existsSync } from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";
import { ocrLangDir } from "@/lib/security/storage";

/**
 * OCR built on tesseract.js.
 *
 * Language data is read from OCR_LANG_PATH when present so the app can run
 * with no network access; otherwise tesseract.js falls back to its own CDN.
 * Run `npm run ocr:download-langs` to prime the local cache.
 *
 * A single worker is reused for the lifetime of the process because creating
 * one loads the WASM core (~1s). Jobs are serialised through a promise chain:
 * one WASM instance at a time keeps memory bounded and tesseract cannot
 * process two recognitions on the same worker concurrently anyway.
 */

type TesseractWorker = {
  recognize: (image: Buffer | string) => Promise<{ data: { text: string; confidence?: number } }>;
  reinitialize?: (langs?: string | string[]) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

const globalForOcr = globalThis as unknown as {
  __fvOcr?: { worker: TesseractWorker | null; langs: string; queue: Promise<unknown> };
};

function state() {
  if (!globalForOcr.__fvOcr) {
    globalForOcr.__fvOcr = { worker: null, langs: "", queue: Promise.resolve() };
  }
  return globalForOcr.__fvOcr;
}

export type OcrOutcome =
  | { ok: true; text: string; confidence: number | null; engine: string }
  | { ok: false; error: string };

function configuredLanguages(): string {
  return env()
    .OCR_LANGUAGES.split(",")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("+");
}

/** True when every configured language has a local traineddata file. */
function hasLocalLanguageData(langs: string): boolean {
  const dir = ocrLangDir();
  if (!existsSync(dir)) return false;

  return langs
    .split("+")
    .every(
      (lang) =>
        existsSync(path.join(dir, `${lang}.traineddata.gz`)) ||
        existsSync(path.join(dir, `${lang}.traineddata`)),
    );
}

/**
 * OCR configuration, safe to show the signed-in user. `offline` matters for
 * privacy: without local traineddata, tesseract.js fetches language files from
 * its CDN on first use.
 */
export function ocrStatus() {
  const e = env();
  const langs = configuredLanguages();

  return {
    engine: e.OCR_ENGINE,
    languages: langs ? langs.split("+") : [],
    offline: e.OCR_ENGINE !== "none" && hasLocalLanguageData(langs),
  };
}

async function getWorker(langs: string): Promise<TesseractWorker> {
  const s = state();

  if (s.worker && s.langs === langs) return s.worker;

  if (s.worker && s.langs !== langs && s.worker.reinitialize) {
    await s.worker.reinitialize(langs.split("+"));
    s.langs = langs;
    return s.worker;
  }

  if (s.worker) {
    await s.worker.terminate().catch(() => undefined);
    s.worker = null;
  }

  // Imported lazily so pages that never OCR do not pay the WASM load cost,
  // and so Turbopack keeps it out of the client graph.
  const { createWorker } = await import("tesseract.js");

  const options: Record<string, unknown> = {};
  if (hasLocalLanguageData(langs)) {
    options.langPath = ocrLangDir();
  }

  const worker = (await createWorker(langs.split("+"), 1, options)) as unknown as TesseractWorker;
  s.worker = worker;
  s.langs = langs;
  return worker;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Runs OCR over an image buffer. Never throws: callers record the failure on
 * the document and keep whatever else the pipeline produced.
 */
export async function recognizeImage(
  image: Buffer,
  timeoutMs = 120_000,
): Promise<OcrOutcome> {
  if (env().OCR_ENGINE === "none") {
    return { ok: false, error: "OCR is disabled (OCR_ENGINE=none)." };
  }

  const langs = configuredLanguages();
  if (!langs) return { ok: false, error: "No OCR languages configured." };

  const s = state();
  // Serialise: resolve the previous job (success or failure) before starting.
  const run = s.queue.then(async () => {
    const worker = await getWorker(langs);
    const result = await withTimeout(worker.recognize(image), timeoutMs, "OCR");
    const text = (result.data.text ?? "").replace(/\r/g, "").trim();
    const confidence =
      typeof result.data.confidence === "number" ? Math.round(result.data.confidence * 10) / 10 : null;

    return { ok: true as const, text, confidence, engine: `tesseract:${langs}` };
  });

  s.queue = run.catch(() => undefined);

  try {
    return await run;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "OCR failed with an unknown error.",
    };
  }
}

export async function terminateOcr(): Promise<void> {
  const s = state();
  if (s.worker) {
    await s.worker.terminate().catch(() => undefined);
    s.worker = null;
    s.langs = "";
  }
}

/** Collapses the whitespace noise OCR typically produces. */
export function normalizeOcrText(text: string): string {
  return text
    .replace(/\u0000/g, " ")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
