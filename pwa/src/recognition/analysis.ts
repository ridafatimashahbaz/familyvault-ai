import { classifyDocument } from "../../../src/lib/pipeline/classify";
import { detectLabelledDates } from "../../../src/lib/pipeline/labelled-dates";

export function analyzeRecognizedText(text: string, filename: string, reviewed = false) {
  const dates = detectLabelledDates([{ page: 1, text }]).map((date) => ({
    ...date,
    reviewRequired: !reviewed || date.reviewRequired,
    reasons: !reviewed ? [...date.reasons, "Check this date against the original document."] : date.reasons,
  }));
  const expiryCandidates = dates.filter((date) => date.role === "expiry" && date.precision === "day");
  const category = classifyDocument(text, filename);
  const summary = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 3).join("\n");
  return {
    dates,
    category,
    summary,
    expiryCandidate: expiryCandidates.length === 1 ? expiryCandidates[0] : null,
  };
}

export function recognitionErrorRate(reference: string, actual: string, unit: "character" | "word") {
  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
  const expected = unit === "word" ? normalize(reference).split(" ").filter(Boolean) : [...normalize(reference)];
  const recognized = unit === "word" ? normalize(actual).split(" ").filter(Boolean) : [...normalize(actual)];
  let previous = Array.from({ length: recognized.length + 1 }, (_, index) => index);
  for (let i = 0; i < expected.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < recognized.length; j++) {
      current.push(Math.min(current[j]! + 1, previous[j + 1]! + 1, previous[j]! + (expected[i] === recognized[j] ? 0 : 1)));
    }
    previous = current;
  }
  const edits = previous[recognized.length]!;
  return { edits, total: expected.length, rate: expected.length ? edits / expected.length : actual.trim() ? 1 : 0 };
}
