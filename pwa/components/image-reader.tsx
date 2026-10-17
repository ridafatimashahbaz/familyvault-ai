"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES } from "@shared/constants";
import { DATE_ROLE_LABELS } from "@shared/pipeline/labelled-dates";
import { type NewDocumentDetails } from "@vault/documents";
import { analyzeRecognizedText } from "../src/recognition/analysis";
import { prepareRecognitionImages } from "../src/recognition/preprocess";

export function ImageReader({ file, onApply }: { file: File; onApply: (details: NewDocumentDetails) => void }) {
  const [rotation, setRotation] = useState(0);
  const [text, setText] = useState("");
  const [originalOutput, setOriginalOutput] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const analysis = analyzeRecognizedText(text, file.name, text !== originalOutput);

  async function read() {
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 120_000);
    setBusy(true);
    setError("");
    setProgress("Preparing a working copy; your original stays unchanged…");
    try {
      const images = await prepareRecognitionImages(file, { handwriting: false, rotation });
      abort.signal.throwIfAborted();
      const { readPrintedImages } = await import("../src/recognition/printed");
      const result = await readPrintedImages(images, setProgress, abort.signal);
      abort.signal.throwIfAborted();
      setOriginalOutput(result);
      setText(result);
      setProgress(result ? "Reading finished. Check the result before using it." : "No readable text found. Nothing has been invented.");
    } catch {
      setError(abort.signal.aborted ? "Reading stopped. Try a smaller, clearer image or enter details yourself." : "The reader could not finish on this device. Check that its reading files are available, or enter details yourself.");
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }

  return <div className="card" aria-label="Read document image">
    <h3>Read this image on your device</h3>
    <p className="muted">The printed-text reader does not upload your image. Check any dates, medicine names and doses yourself.</p>
    <label className="field"><span>Turn image before reading</span>
      <select value={rotation} onChange={(event) => setRotation(Number(event.target.value))} disabled={busy}>
        <option value={0}>Keep as it is</option><option value={90}>Right turn</option><option value={180}>Upside down</option><option value={270}>Left turn</option>
      </select>
    </label>
    <div className="actions">
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void read()}>{busy ? "Reading…" : "Read printed text"}</button>
      {busy ? <button type="button" className="btn btn-ghost" onClick={() => controller.current?.abort()}>Stop reading</button> : null}
    </div>
    {progress ? <p role="status">{progress}</p> : null}
    {error ? <p className="notice notice-warn" role="alert">{error}</p> : null}
    {originalOutput !== null ? <>
      <details><summary>Original reader output</summary><pre style={{ whiteSpace: "pre-wrap" }}>{originalOutput || "No text returned."}</pre></details>
      <label className="field"><span>Check and correct the text</span><textarea rows={7} value={text} maxLength={50000} onChange={(event) => setText(event.target.value)} /></label>
      <p>Suggested kind: {CATEGORIES[analysis.category.category].label}</p>
      <ul>{analysis.dates.map((date, index) => <li key={`${date.role}-${index}`}>{DATE_ROLE_LABELS[date.role]}: {date.iso} — “{date.raw}” (needs checking)</li>)}</ul>
      {!analysis.dates.length ? <p>No usable dates found.</p> : null}
      <h3>Short extract</h3><p style={{ whiteSpace: "pre-wrap" }}>{analysis.summary || "No readable text."}</p>
      <button className="btn btn-secondary" type="button" disabled={busy || !text.trim()} onClick={() => onApply({
        category: analysis.category.category,
        expiryDate: analysis.expiryCandidate?.iso ?? null,
        expiryReview: { source: "recognition", confirmed: false, evidence: analysis.expiryCandidate?.evidence },
        recognition: { text, engine: "tesseract-english", reviewed: text !== originalOutput },
      })}>Use this text and suggestions</button>
      <p className="small muted">Suggestions remain unconfirmed. Review the expiry against the original before enabling reminders.</p>
    </> : null}
  </div>;
}
