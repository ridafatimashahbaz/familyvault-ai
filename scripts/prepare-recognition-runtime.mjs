import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "pwa/public/reading-runtime");
await mkdir(target, { recursive: true });
await copyFile(path.join(root, "node_modules/tesseract.js/dist/worker.min.js"), path.join(target, "worker.min.js"));
for (const name of await readdir(path.join(root, "node_modules/tesseract.js-core"))) {
  if (/^tesseract-core.*-lstm\.wasm(\.js)?$/.test(name)) {
    await copyFile(path.join(root, "node_modules/tesseract.js-core", name), path.join(target, name));
  }
}
for (const name of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  await copyFile(path.join(root, "node_modules/onnxruntime-web/dist", name), path.join(target, name));
}
const training = path.join(root, "storage/ocr-lang/eng.traineddata.gz");
try {
  await stat(training);
} catch {
  throw new Error("English printed-text data is missing. Run node scripts/download-ocr-langs.mjs eng before preparing the reading runtime.");
}
await copyFile(training, path.join(target, "eng.traineddata.gz"));
console.log("Prepared same-origin reading runtimes and English printed-text data.");
