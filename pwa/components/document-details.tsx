"use client";

import { useState } from "react";
import { CATEGORIES, CATEGORY_KEYS, type CategoryKey } from "@shared/constants";
import { DATE_ROLE_LABELS } from "@shared/pipeline/labelled-dates";
import { type VaultDocumentDetailsPatch, type StoredDocumentMeta } from "@vault/documents";
import { analyzeRecognizedText } from "../src/recognition/analysis";

export function DocumentDetails({ meta, onSave, onClose, busy }: {
  meta: StoredDocumentMeta;
  onSave: (details: VaultDocumentDetailsPatch) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [category, setCategory] = useState<CategoryKey>(meta.category);
  const [expiryDate, setExpiryDate] = useState(meta.expiryDate ?? "");
  const [text, setText] = useState(meta.recognition?.text ?? "");
  const [confirmed, setConfirmed] = useState(meta.expiryReview?.confirmed ?? false);
  const [source, setSource] = useState<"manual" | "recognition">(meta.expiryReview?.source ?? "manual");
  const analysis = analyzeRecognizedText(text, meta.name, true);

  return (
    <section className="card" aria-label="Document details">
      <h2>Review document details — {meta.name}</h2>
      <p className="muted">Changes here leave the original file untouched. Check dates and medical details against your original.</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          category, expiryDate: expiryDate || null,
          expiryReview: { source, confirmed: Boolean(expiryDate) && confirmed, evidence: source === "recognition" ? analysis.expiryCandidate?.evidence : undefined },
          ...(meta.recognition ? { recognition: { ...meta.recognition, text, reviewed: true } } : {}),
        });
      }}>
        <div className="grid-2">
          <label className="field"><span>What kind of document?</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as CategoryKey)}>
              {CATEGORY_KEYS.map((key) => <option key={key} value={key}>{CATEGORIES[key].label}</option>)}
            </select>
          </label>
          <label className="field"><span>Expiry date</span>
            <input type="date" value={expiryDate} onChange={(event) => { setExpiryDate(event.target.value); setSource("manual"); setConfirmed(false); }} />
          </label>
        </div>
        {expiryDate ? <label className="field"><span><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I checked this expiry date against the original.</span></label> : null}
        {!confirmed && expiryDate ? <p className="notice notice-warn">Needs checking. This date will not be used for reminders until you confirm it.</p> : null}
        {meta.recognition ? <>
          <label className="field"><span>Text to review and correct</span>
            <textarea rows={8} value={text} maxLength={50000} onChange={(event) => { setText(event.target.value); setConfirmed(false); }} />
          </label>
          <p className="small muted">Corrections below are saved separately from the original image.</p>
          <h3>Dates found in this text</h3>
          {analysis.dates.length ? <ul>{analysis.dates.map((date, index) => <li key={`${date.role}-${date.iso}-${index}`}>
            {DATE_ROLE_LABELS[date.role]}: {date.iso} — “{date.raw}”{date.reviewRequired ? " (check this date)" : ""}
          </li>)}</ul> : <p>No usable dates found. You can enter the expiry yourself if the original shows one.</p>}
          {analysis.expiryCandidate ? <button className="btn btn-secondary btn-sm" type="button" onClick={() => {
            setExpiryDate(analysis.expiryCandidate!.iso); setSource("recognition"); setConfirmed(false);
          }}>Use suggested expiry, then confirm</button> : null}
          <h3>Short extract from the text</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{analysis.summary || "No readable text."}</p>
          <p className="small muted">This is a quotation, not medical advice or a verified interpretation.</p>
        </> : null}
        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </form>
    </section>
  );
}
