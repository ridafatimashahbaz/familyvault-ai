import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { analyzeRecognizedText, recognitionErrorRate } from "../../pwa/src/recognition/analysis";

const REFERENCE = "Appointment: 18 November 2026\nFollow-up: 25 November 2026\nDocument expires: 30 November 2026";

describe("recognition output analysis, not model accuracy", () => {
  test("analyzes only actual input and keeps recognition dates unconfirmed", () => {
    const result = analyzeRecognizedText(REFERENCE, "note.png");
    assert.equal(result.expiryCandidate?.iso, "2026-11-30");
    assert.equal(result.dates.length, 3);
    assert.ok(result.dates.every((date) => date.reviewRequired));
    assert.equal(result.summary, REFERENCE);
  });

  test("empty or unreadable output never gains a reference expiry", () => {
    for (const text of ["", "unreadable", "Appointment: 18 November 2026", "Document expires: 31 November 2026"]) {
      assert.equal(analyzeRecognizedText(text, "note.png").expiryCandidate, null);
    }
  });

  test("corrections replace extracted values without hiding ambiguity", () => {
    const result = analyzeRecognizedText("Expiry date: 03/04/2027", "note.png", true);
    assert.equal(result.expiryCandidate?.reviewRequired, true);
    assert.equal(analyzeRecognizedText("Document expires: 30 December 2026", "note.png", true).expiryCandidate?.iso, "2026-12-30");
  });

  test("summary quotes source lines without adding clinical instructions", () => {
    const result = analyzeRecognizedText("Medication: unclear\nDose: ?\nNext visit: unknown", "note.png");
    assert.equal(result.summary, "Medication: unclear\nDose: ?\nNext visit: unknown");
    assert.equal(result.expiryCandidate, null);
  });

  test("measures real substitutions, insertions and deletions", () => {
    assert.equal(recognitionErrorRate("abc", "abc", "character").rate, 0);
    assert.equal(recognitionErrorRate("abc", "axc", "character").edits, 1);
    assert.equal(recognitionErrorRate("abc", "abcd", "character").edits, 1);
    assert.equal(recognitionErrorRate("abc", "ac", "character").edits, 1);
    assert.equal(recognitionErrorRate("hello world", "hello", "word").rate, 0.5);
    assert.equal(recognitionErrorRate("", "", "word").rate, 0);
  });
});
