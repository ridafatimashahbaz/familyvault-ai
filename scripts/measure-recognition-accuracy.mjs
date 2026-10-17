import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker, OEM } from "tesseract.js";

import { recognitionErrorRate } from "../pwa/src/recognition/analysis.ts";
import { detectLabelledDates } from "../src/lib/pipeline/labelled-dates.ts";

/**
 * Measures what the on-device reader actually gets right on the sample set.
 * The numbers written to accuracy.json are measured, never asserted from the
 * model's documentation, and the script fails closed if the engine is missing.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const samplesDir = join(root, "pwa", "public", "recognition-samples");
const langDir = join(root, "storage", "ocr-lang");
const dataset = JSON.parse(readFileSync(join(samplesDir, "dataset.json"), "utf8"));

if (!existsSync(join(langDir, "eng.traineddata.gz"))) {
  console.error(`Missing language data: ${langDir}\\eng.traineddata.gz\nRun: npm run ocr:download-langs`);
  process.exit(1);
}

// Same OEM (LSTM_ONLY) and language data the product uses; the Node worker is
// used here because the browser worker bundle cannot run outside a DOM.
const worker = await createWorker("eng", OEM.LSTM_ONLY, { langPath: langDir });

const cases = [];
for (const item of dataset.cases) {
  const image = join(samplesDir, basename(item.image));
  const { data } = await worker.recognize(image);
  const actual = (data.text ?? "").trim();

  const expectedDates = new Set(detectLabelledDates([{ page: 1, text: item.reference }]).map((d) => d.iso));
  const found = detectLabelledDates([{ page: 1, text: actual }]);

  const cer = recognitionErrorRate(item.reference, actual, "character");
  const wer = recognitionErrorRate(item.reference, actual, "word");

  cases.push({
    id: item.id,
    kind: item.kind,
    characterErrorRate: Number(cer.rate.toFixed(4)),
    wordErrorRate: Number(wer.rate.toFixed(4)),
    characterEdits: `${cer.edits}/${cer.total}`,
    wordEdits: `${wer.edits}/${wer.total}`,
    datesFound: found.map((d) => ({ role: d.role, iso: d.iso, precision: d.precision, reviewRequired: d.reviewRequired })),
    expirySuggested: found.some((d) => d.role === "expiry" && d.precision === "day")
      ? found.find((d) => d.role === "expiry" && d.precision === "day").iso
      : null,
    datesNotInReference: found.filter((d) => !expectedDates.has(d.iso)).map((d) => ({ role: d.role, iso: d.iso })),
    read: actual,
  });
}

await worker.terminate();

const mean = (key) => Number((cases.reduce((sum, c) => sum + c[key], 0) / cases.length).toFixed(4));
const handwritten = cases.filter((c) => c.kind === "synthetic-pen-strokes");
const printed = cases.filter((c) => c.kind === "printed");

const result = {
  measuredAt: new Date().toISOString(),
  engine: "tesseract.js LSTM_ONLY with eng.traineddata (same engine and language file the app loads in the browser; driven through the Node worker here)",
  note: "Synthetic pen trajectories only. These are not human handwriting, so the handwritten numbers below describe this narrow synthetic set and must not be quoted as real-world handwriting accuracy.",
  summary: {
    allCases: { characterErrorRate: mean("characterErrorRate"), wordErrorRate: mean("wordErrorRate") },
    syntheticPenStrokes: {
      cases: handwritten.length,
      characterErrorRate: Number((handwritten.reduce((s, c) => s + c.characterErrorRate, 0) / handwritten.length).toFixed(4)),
      wordErrorRate: Number((handwritten.reduce((s, c) => s + c.wordErrorRate, 0) / handwritten.length).toFixed(4)),
    },
    printedControl: {
      cases: printed.length,
      characterErrorRate: Number((printed.reduce((s, c) => s + c.characterErrorRate, 0) / printed.length).toFixed(4)),
      wordErrorRate: Number((printed.reduce((s, c) => s + c.wordErrorRate, 0) / printed.length).toFixed(4)),
    },
    expiryDatesSuggested: cases.filter((c) => c.expirySuggested).length,
    expiryDatesNotInReference: cases.reduce((s, c) => s + c.datesNotInReference.length, 0),
  },
  cases,
};

writeFileSync(join(samplesDir, "accuracy.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.summary, null, 2));
