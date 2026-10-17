import { DOC_TYPE_MAP, EXPIRY_LABELS, ISSUE_LABELS } from "@/lib/constants";
import { findDateAfterLabel, findDates, toDateKey } from "./dates";
import type { DetectedDate } from "./labelled-dates";
import type { ExtractedFields } from "./extract";

/**
 * Issue / expiry date detection.
 *
 * Dates are only accepted when they sit next to an explicit label. Guessing
 * "the latest future date on the page is probably the expiry" produces
 * confident wrong answers, and a wrong expiry drives renewal reminders, so
 * precision matters more than recall here. When nothing is found the document
 * is left without an expiry and the UI says so.
 */

export type DateDetection = {
  issueDate: Date | null;
  expiryDate: Date | null;
  /** Provenance shown in the UI, e.g. `label "Date of Expiry"`. */
  expirySource: string | null;
  issueSource: string | null;
  noExpiry: boolean;
  warnings: string[];
};

const EXPIRY_FIELD_PATTERN =
  /expir|expiry|valid\s*(until|till|thru|through|up\s*to)|end\s*date|maturity|due\s*date|renewal|token\s*paid\s*till/i;

const ISSUE_FIELD_PATTERN =
  /issue|issued|issuance|effective|commencement|start\s*date|registration\s*date|filing\s*date|date\s*of\s*marriage/i;

const PERMANENT_PHRASES = [
  "valid for life",
  "lifetime validity",
  "lifetime",
  "lifelong",
  "non-expirable",
  "no expiry",
  "does not expire",
  "permanent validity",
];

/** Bare "date" matches almost anything, so it is excluded from label scans. */
const ISSUE_SCAN_LABELS = ISSUE_LABELS.filter((l) => l.trim().toLowerCase() !== "date");

export function detectDates(
  text: string,
  docType: string,
  fields: ExtractedFields,
): DateDetection {
  const warnings: string[] = [];
  const lower = text.toLowerCase();

  const fromFields = (pattern: RegExp) => {
    for (const [key, value] of Object.entries(fields)) {
      if (!pattern.test(key)) continue;
      const candidates = findDates(value);
      if (candidates.length > 0) {
        return { parsed: candidates[0]!, source: `field "${key}"` };
      }
    }
    return null;
  };

  const expiryFromField = fromFields(EXPIRY_FIELD_PATTERN);
  const expiryFromLabel = expiryFromField
    ? null
    : findDateAfterLabel(text, EXPIRY_LABELS);

  let expiryDate = expiryFromField?.parsed.date ?? expiryFromLabel?.date ?? null;
  let expirySource =
    expiryFromField?.source ??
    (expiryFromLabel ? `label near "${matchLabel(lower, EXPIRY_LABELS)}"` : null);

  const issueFromField = fromFields(ISSUE_FIELD_PATTERN);
  const issueFromLabel = issueFromField ? null : findDateAfterLabel(text, ISSUE_SCAN_LABELS);

  const issueDate = issueFromField?.parsed.date ?? issueFromLabel?.date ?? null;
  const issueSource = issueFromField?.source ?? (issueFromLabel ? "label in document" : null);

  if (issueDate && expiryDate && expiryDate.getTime() <= issueDate.getTime()) {
    warnings.push(
      `The detected expiry (${toDateKey(expiryDate)}) is not after the issue date ` +
        `(${toDateKey(issueDate)}), so it was discarded as a likely misread.`,
    );
    expiryDate = null;
    expirySource = null;
  }

  if (expiryDate) {
    const year = expiryDate.getUTCFullYear();
    if (year < 1990) {
      warnings.push(`The detected expiry year (${year}) looks implausible and was discarded.`);
      expiryDate = null;
      expirySource = null;
    }
  }

  const typeDef = DOC_TYPE_MAP[docType];
  const saysPermanent = PERMANENT_PHRASES.some((phrase) => lower.includes(phrase));
  const noExpiry = Boolean(!expiryDate && (typeDef?.permanent || saysPermanent));

  return {
    issueDate,
    expiryDate,
    expirySource,
    issueSource,
    noExpiry,
    warnings,
  };
}

function matchLabel(lowerText: string, labels: string[]): string {
  for (const label of labels) {
    if (lowerText.includes(label)) return label;
  }
  return "document text";
}

/**
 * Just the printed heading the date sat under.
 *
 * `evidence` is a surrounding snippet and starts a few characters before the
 * heading, so it often opens inside the previous field's date; quoting it whole
 * gives a source like `label "0-11-2025 Coverage until …"`.
 */
function headingOf(date: DetectedDate): string {
  const at = date.raw ? date.evidence.indexOf(date.raw) : -1;
  const start = at === -1 ? 0 : Math.max(0, at - 30);
  let tokens = date.evidence.slice(start, at === -1 ? 30 : at).split(/\s+/).filter(Boolean);

  // A cut in the middle of a word leaves a fragment like "erage until".
  if (start > 0 && tokens.length > 0 && /[a-z]/i.test(date.evidence[start - 1] ?? "")) {
    tokens = tokens.slice(1);
  }
  while (tokens.length > 0 && !/[a-z]/i.test(tokens[0]!)) tokens = tokens.slice(1);

  return tokens.join(" ").slice(0, 40) || "the expiry heading";
}

/**
 * Make the reminder agree with the dates shown for review.
 *
 * `detectDates` is the older, coarser scan and `labelled-dates.ts` is the newer,
 * role-aware one. Left alone they can disagree on the same document — a policy
 * card reading "Coverage until 19-11-2026" beside "Renew before 30 November
 * 2026" gives two different expiries — and a document page that shows one date
 * in the card and reminds on another destroys the point of showing the evidence.
 *
 * The labelled reading wins when it is confident, because it knows which heading
 * the date sat under. When it is not confident the older value is kept, but the
 * disagreement is reported instead of hidden.
 */
export function reconcileExpiry(
  detection: DateDetection,
  labelled: DetectedDate[],
): { dates: DateDetection; warnings: string[] } {
  const candidates = labelled.filter((d) => d.role === "expiry");
  const trusted = candidates
    .filter((d) => !d.reviewRequired)
    .sort((a, b) => Number(b.precision === "day") - Number(a.precision === "day"))[0];

  const detectedKey = detection.expiryDate ? toDateKey(detection.expiryDate) : null;
  const warnings: string[] = [];

  if (trusted && trusted.iso !== detectedKey) {
    const afterIssue = !detection.issueDate || trusted.iso > toDateKey(detection.issueDate);

    if (afterIssue) {
      if (detectedKey) {
        warnings.push(
          `Two dates could be the expiry. Using ${trusted.iso} — found next to ` +
            `"${headingOf(trusted)}" on page ${trusted.page} — instead of ${detectedKey}. ` +
            "You can change it below.",
        );
      }
      return {
        dates: {
          ...detection,
          expiryDate: new Date(`${trusted.iso}T00:00:00.000Z`),
          expirySource: `label "${headingOf(trusted)}"`,
          noExpiry: false,
        },
        warnings,
      };
    }

    warnings.push(
      `"${headingOf(trusted)}" on page ${trusted.page} looks like an expiry but is not after ` +
        `the issue date, so the reminder was left as ${detectedKey ?? "none"}.`,
    );
  }

  const unsure = candidates.find((d) => d.reviewRequired && d.iso !== detectedKey);
  if (detectedKey && unsure) {
    warnings.push(
      `The reminder uses ${detectedKey}, and this document also shows a possible expiry of ` +
        `${unsure.iso} ("${headingOf(unsure)}", page ${unsure.page}). Check which one is right below.`,
    );
  }

  return { dates: detection, warnings };
}
