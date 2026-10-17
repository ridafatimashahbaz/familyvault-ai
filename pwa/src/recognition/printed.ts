import { createWorker, OEM } from "tesseract.js";

export async function readPrintedImages(images: Blob[], onProgress: (message: string) => void, signal: AbortSignal): Promise<string> {
  onProgress("Preparing the printed-text reader on this device…");
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: "/reading-runtime/worker.min.js",
    corePath: "/reading-runtime/",
    langPath: "/reading-runtime/",
    workerBlobURL: false,
    cacheMethod: "none",
    logger: ({ status, progress }) => {
      if (!signal.aborted && status === "recognizing text") onProgress(`Reading printed text: ${Math.round(progress * 100)}%`);
    },
    errorHandler: () => undefined,
  });
  const cancel = () => { void worker.terminate(); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    const pages: string[] = [];
    for (const image of images) {
      signal.throwIfAborted();
      const { data } = await worker.recognize(image);
      pages.push(data.text.trim());
    }
    return pages.join("\n");
  } finally {
    signal.removeEventListener("abort", cancel);
    await worker.terminate();
  }
}
