"use client";

import { useEffect, useRef, useState } from "react";

import { DATE_ROLE_LABELS } from "@shared/pipeline/labelled-dates";

import accuracy from "../public/recognition-samples/accuracy.json";
import samples from "../public/recognition-samples/dataset.json";
import { analyzeRecognizedText, recognitionErrorRate } from "../src/recognition/analysis";
import { prepareRecognitionImages } from "../src/recognition/preprocess";

type Sample = (typeof samples.cases)[number];
type Scored = (typeof accuracy.cases)[number];

/**
 * The reader is shown working on samples a person can look at and contradict.
 * Scores come from accuracy.json, which `node scripts/measure-recognition-accuracy.mjs`
 * writes by running the model over these very files — nothing here is a
 * advertised figure, and a date only appears when one was actually read.
 */
export function HandwritingDemo() {
  const [active, setActive] = useState<Sample>(samples.cases[0]);
  const [picked, setPicked] = useState<File | null>(null);
  const [pickedUrl, setPickedUrl] = useState<string | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      controller.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  function reset() {
    setRaw(null);
    setText("");
    setError("");
    setProgress("");
  }

  function choosePicture(file: File | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    if (file) {
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      setPickedUrl(url);
    } else {
      urlRef.current = null;
      setPickedUrl(null);
    }
    setPicked(file);
    reset();
  }

  const score = raw === null ? undefined : recognitionErrorRate(active.reference, raw, "word");
  const analysis = analyzeRecognizedText(text, picked ? picked.name : active.id, text !== (raw ?? ""));
  const measured = score ? `${correct(score.rate === 0 ? 1 : 1 - score.rate)} of words matched` : null;

  async function read(file: File) {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setRaw(null);
    setProgress("Getting the reader ready on this device…");
    try {
      const images = await prepareRecognitionImages(file, { handwriting: false, rotation: 0 });
      abort.signal.throwIfAborted();
      const { readPrintedImages } = await import("../src/recognition/printed");
      const result = await readPrintedImages(images, setProgress, abort.signal);
      abort.signal.throwIfAborted();
      setRaw(result);
      setText(result);
      setProgress(
        result
          ? "Finished reading on this device. Check it against the picture and fix anything wrong."
          : "Nothing readable was found. Nothing has been guessed.",
      );
    } catch {
      setError(
        abort.signal.aborted
          ? "Reading stopped. Try a clearer, smaller picture, or write the details in yourself."
          : "The reader could not finish on this device. Its reading files may not be on this device yet — open the app while online once, then try again.",
      );
      setProgress("");
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }

  async function readSample() {
    try {
      const response = await fetch(active.image);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      await read(new File([blob], `${active.id}.png`, { type: blob.type || "image/png" }));
    } catch {
      setError("The sample picture could not be opened on this device.");
    }
  }

  return (
    <section className="card" id="handwriting-demo">
      <h2>Handwriting AI Demo — See How FamilyVault Reads Documents</h2>
      <p className="muted">
        Choose a sample and let this device read it, then compare what it found with what the sample
        really says. Nothing is sent anywhere while you do this. A date is only offered when this
        device actually read one.
      </p>

      <div className="chips">
        {samples.cases.map((sample) => (
          <button
            key={sample.id}
            type="button"
            className={!picked && sample.id === active.id ? "chip chip-warn" : "chip"}
            onClick={() => {
              setPicked(null);
              setActive(sample);
              reset();
            }}
          >
            {label(sample)}
          </button>
        ))}
      </div>

      <div className="grid-2">
        <div>
          <p className="small muted">{picked ? "Your own picture, held in memory only:" : "The sample:"}</p>
          {/* Static export has no image optimizer, and these are local sample
              PNGs or the person's own file behind a blob URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={picked && pickedUrl ? pickedUrl : active.image}
            alt={picked ? "The picture you chose" : `${label(active)} sample`}
            style={{ maxWidth: "100%", borderRadius: 10, border: "1px solid rgba(127,127,127,.35)" }}
          />
          <p className="small muted">
            {picked
              ? "Your picture is read once, here. It is not uploaded and is not saved unless you put it in your vault."
              : "These were drawn for testing. They are not a real person’s handwriting and not a real family record, so a good score here does not promise a good score on your own letters."}
          </p>
        </div>
        <div>
          <p className="small muted">What the sample really says:</p>
          <pre className="kit">{picked ? "You know what your own picture says — check the reading against it." : active.reference}</pre>
          {!picked ? (
            <p className="small muted">
              Measured on these files on {accuracy.measuredAt.slice(0, 10)}: {correct(1 - rateOf(rowFor(active.id), "characterErrorRate"))} of
              letters and {correct(1 - rateOf(rowFor(active.id), "wordErrorRate"))} of words read right.
            </p>
          ) : null}
        </div>
      </div>

      <div className="row-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !!picked} onClick={() => void readSample()}>
          {busy ? "Reading on this device…" : "Read this sample now"}
        </button>
        <label className="btn btn-secondary">
          Try a picture from this device
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              choosePicture(event.target.files?.[0] ?? null);
            }}
          />
        </label>
        {picked ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => picked && void read(picked)}>
            {busy ? "Reading on this device…" : "Read my picture"}
          </button>
        ) : null}
        {busy ? (
          <button type="button" className="btn btn-ghost" onClick={() => controller.current?.abort()}>
            Stop
          </button>
        ) : null}
      </div>

      {progress ? <p className="small muted">{progress}</p> : null}
      {error ? <p className="notice notice-bad">{error}</p> : null}

      {raw !== null ? (
        <>
          <p className="small muted">Exactly what this device read{measured ? ` — ${measured}` : ""}:</p>
          <pre className="kit">{raw || "(no text found)"}</pre>

          <div className="field">
            <span>Fix anything it misread</span>
            <textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} />
          </div>

          {analysis.dates.length ? (
            <p className="small">
              Dates found:{" "}
              {analysis.dates
                .map((date) => `${DATE_ROLE_LABELS[date.role] ?? date.role} ${date.iso}${date.reviewRequired ? " (needs checking)" : ""}`)
                .join(", ")}
            </p>
          ) : (
            <p className="small">No dates were found in this text. Nothing was made up.</p>
          )}

          {analysis.expiryCandidate ? (
            <p className="notice notice-warn">
              Suggested expiry: {analysis.expiryCandidate.iso}. It stays “needs checking” until you confirm it
              against the original, and a reminder is only set after you confirm it.
            </p>
          ) : (
            <p className="notice notice-ok">No expiry date was suggested from this reading.</p>
          )}
        </>
      ) : null}

      {!picked ? (
        <table className="list">
          <thead>
            <tr>
              <th className="small muted">Sample</th>
              <th className="small muted">Letters right</th>
              <th className="small muted">Words right</th>
              <th className="small muted">Expiry offered</th>
            </tr>
          </thead>
          <tbody>
            {samples.cases.map((sample) => {
              const row = rowFor(sample.id);
              return (
                <tr key={sample.id}>
                  <td>{label(sample)}</td>
                  <td>{correct(1 - rateOf(row, "characterErrorRate"))}</td>
                  <td>{correct(1 - rateOf(row, "wordErrorRate"))}</td>
                  <td>{row?.expirySuggested ?? "no"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      <p className="small muted">
        {accuracy.note}
      </p>
    </section>
  );
}

function rowFor(id: string): Scored | undefined {
  return (accuracy.cases as Scored[]).find((row) => row.id === id);
}

function rateOf(row: Scored | undefined, key: "characterErrorRate" | "wordErrorRate"): number {
  return row ? row[key] : Number.NaN;
}

function label(sample: Sample): string {
  switch (sample.id) {
    case "printed-control":
      return "Printed text";
    case "pen-clear":
      return "Neat writing";
    case "pen-difficult":
      return "Tight writing";
    case "pen-rotated":
      return "Tilted page";
    case "pen-numeric":
      return "Numbers only";
    case "pen-ambiguous":
      return "Hard to read";
    case "pen-illegible":
      return "Very hard to read";
    default:
      return sample.id;
  }
}

function correct(rate: number): string {
  if (!Number.isFinite(rate)) return "unknown";
  return `${Math.round(Math.max(0, Math.min(1, rate)) * 100)}%`;
}
