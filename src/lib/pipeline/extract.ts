import { DOC_TYPE_MAP } from "@/lib/constants";

/**
 * Label-driven field extraction.
 *
 * Identity documents print a label then its value, either on the same line
 * ("Date of Birth 15-03-1988") or on the next one ("Name\nMUHAMMAD AHMED").
 * Both layouts are handled.
 *
 * Two details matter for correctness on real scans:
 *   - Labels are matched longest-first and each match claims its span, so the
 *     label "Name" never picks up the tail of "Father's Name" and report the
 *     father as the document holder.
 *   - Label patterns tolerate OCR noise between words (stray slashes, colons
 *     and spaces) without matching across unrelated words.
 *
 * A few high-value fields are additionally pulled by shape, because OCR often
 * mangles the label sitting next to them.
 */

export type ExtractedFields = Record<string, string>;

const GENERIC_LABELS = [
  "Name",
  "Full Name",
  "Child Name",
  "Patient Name",
  "Employee Name",
  "Policy Holder",
  "Account Title",
  "Father Name",
  "Father's Name",
  "Father/Husband Name",
  "Husband Name",
  "Mother Name",
  "Mother's Name",
  "Date of Birth",
  "Birth Date",
  "Gender",
  "Sex",
  "Age / Sex",
  "Address",
  "Present Address",
  "Permanent Address",
  "Property Address",
  "Blood Group",
  "Nationality",
  "Religion",
  "Place of Birth",
  "Document Number",
  "Registration Number",
  "Serial Number",
  "Roll Number",
  "Account Number",
  "Consumer No",
  "Policy Number",
  "Reference Number",
  "Deed Number",
  "Licence Number",
  "Passport Number",
  "CNIC",
];

/** Too short or too noisy to be worth matching as a label. */
const SKIP_LABELS = new Set(["date", "no", "the", "signature", "sign", "cnic"]);

/**
 * Identifiers and phone numbers are both digit strings, so each pattern has to
 * prove the candidate is not a slice of something longer: an IBAN must be a
 * standalone token (never part of a passport machine-readable zone) and a phone
 * number must not run into further digits or separators.
 */
const SHAPE_PATTERNS: { key: string; regex: RegExp }[] = [
  { key: "CNIC Number", regex: /\b(\d{5}[-\s]\d{7}[-\s]\d)\b/ },
  { key: "Passport Number", regex: /\b([A-Z]{1,2}\d{7})\b/ },
  { key: "IBAN", regex: /(?<![A-Z0-9<])([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}[A-Z0-9]{0,4})(?![A-Z0-9<])/ },
  { key: "Email", regex: /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/ },
  {
    key: "Phone",
    regex: /(?<![\d.])(\+?92[\s-]?\d{3}[\s-]?\d{7}|\+?\d{1,3}[\s-]?\d{3,4}[\s-]?\d{6,7})(?![\d.-])/,
  },
];

const MAX_FIELDS = 24;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a pattern for a label that tolerates up to three noise characters
 * between words (enough for separators OCR renders as " / " or " - ") and
 * requires word boundaries on both sides.
 */
function labelRegex(label: string): RegExp | null {
  const words = label
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  if (words.length === 0) return null;

  const body = words.map(escapeRegex).join("[^A-Za-z0-9]{0,3}");
  return new RegExp(`(^|[^A-Za-z0-9])(${body})(?![A-Za-z0-9])`, "i");
}

type LabelMatcher = { label: string; regex: RegExp };

function buildMatchers(docType: string): LabelMatcher[] {
  const typeDef = DOC_TYPE_MAP[docType];
  const labels = [...new Set([...(typeDef?.fields ?? []), ...GENERIC_LABELS])]
    .filter((l) => !SKIP_LABELS.has(l.trim().toLowerCase()))
    // Longest first: more specific labels claim their text before shorter ones.
    .sort((a, b) => b.length - a.length);

  const matchers: LabelMatcher[] = [];
  for (const label of labels) {
    const regex = labelRegex(label);
    if (regex) matchers.push({ label, regex });
  }
  return matchers;
}

export function extractFields(text: string, docType: string): ExtractedFields {
  const fields: ExtractedFields = {};
  if (!text || text.trim().length < 3) return fields;

  const matchers = buildMatchers(docType);
  const lines = text.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim());

  // Spans already consumed on each line, in original-line coordinates.
  const claimed: { start: number; end: number }[][] = lines.map(() => []);
  // Lines that contain nothing but a label, whose value sits on a later line.
  const labelOnlyLines = new Set<number>();

  const isOverlapping = (ranges: { start: number; end: number }[], start: number, end: number) =>
    ranges.some((r) => start < r.end && end > r.start);

  // Pass 1: identify label-only lines so pass 2 can read values from the
  // following line without mistaking another label for a value.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line || line.length > 60) continue;

    for (const { regex } of matchers) {
      regex.lastIndex = 0;
      const match = regex.exec(line);
      if (!match) continue;
      if (line.slice(match.index + match[0].length).trim().length === 0) {
        labelOnlyLines.add(i);
        break;
      }
    }
  }

  // Pass 2: read a value for each label.
  for (const { label, regex } of matchers) {
    if (fields[label] || Object.keys(fields).length >= MAX_FIELDS) continue;

    // A private global copy: `matchAll` needs the flag, and keeping it separate
    // means the shared non-global regex used above never carries a lastIndex.
    const scan = new RegExp(regex.source, "gi");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line) continue;

      for (const match of line.matchAll(scan)) {
        const start = match.index!;
        const end = start + match[0].length;

        if (isOverlapping(claimed[i]!, start, end)) continue;

        const remainder = line.slice(end).replace(/^[\s:.\-–—/]+/, "").trim();

        if (remainder.length > 0) {
          const value = cleanValue(remainder, matchers, label);
          if (value) {
            fields[label] = value;
            claimed[i]!.push({ start, end });
          }
          break;
        }

        // Label alone on its line: take the next line that is not itself a label.
        if (labelOnlyLines.has(i)) {
          const next = nextValueLine(lines, i + 1, labelOnlyLines, claimed);
          if (next !== null) {
            const value = cleanValue(next.text, matchers, label);
            if (value) {
              fields[label] = value;
              claimed[i]!.push({ start, end });
              claimed[next.index]!.push({ start: 0, end: lines[next.index]!.length });
            }
          }
        }
        break;
      }

      if (fields[label]) break;
    }
  }

  for (const { key, regex: shape } of SHAPE_PATTERNS) {
    if (fields[key]) continue;

    const scan = new RegExp(shape.source, shape.flags.includes("g") ? shape.flags : `${shape.flags}g`);
    for (const match of text.matchAll(scan)) {
      const candidate = (match[1] ?? "").replace(/\s+/g, " ").trim();
      if (!candidate) continue;
      if (DEDUPE_SHAPE_KEYS.has(key) && restatesExistingField(fields, candidate)) continue;
      fields[key] = candidate;
      break;
    }
  }

  return fields;
}

/** Only the greedy, generic shapes need this; an IBAN legitimately contains the account number. */
const DEDUPE_SHAPE_KEYS = new Set(["Phone"]);

/** True when the candidate is just another slice of a number already stored. */
function restatesExistingField(fields: ExtractedFields, candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 4) return false;

  return Object.values(fields).some((value) => {
    const stored = value.replace(/\D/g, "");
    return stored.length >= 4 && (stored.includes(digits) || digits.includes(stored));
  });
}

function nextValueLine(
  lines: string[],
  from: number,
  labelOnlyLines: Set<number>,
  claimed: { start: number; end: number }[][],
): { index: number; text: string } | null {
  for (let i = from; i < Math.min(from + 4, lines.length); i++) {
    const line = lines[i]!;
    if (!line || line.length < 2) continue;
    if (labelOnlyLines.has(i)) continue;
    if (claimed[i]!.some((r) => r.start === 0 && r.end >= line.length)) continue;
    return { index: i, text: line };
  }
  return null;
}

/** Labels whose printed value is legitimately a single character ("Sex M"). */
const SHORT_VALUE_LABELS = new Set(["sex", "gender", "age / sex", "blood group"]);

function cleanValue(value: string, matchers: LabelMatcher[], label: string): string {
  let cleaned = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Truncate where the next label begins: "Name ALI DOB 1990" -> "ALI".
  // A match at index 0 means the remainder is itself a label — a table header
  // like "Test Name Result Reference Range" — so there is no value to take.
  let earliest = cleaned.length;
  for (const { regex } of matchers) {
    regex.lastIndex = 0;
    const match = regex.exec(cleaned);
    if (!match) continue;

    const at = match.index + (match[1]?.length ?? 0);
    if (at === 0) return "";
    if (at < earliest) earliest = at;
  }
  if (earliest < cleaned.length) cleaned = cleaned.slice(0, earliest);

  cleaned = cleaned.replace(/^[\s:.\-–—/]+/, "").replace(/[\s:.\-–—/]+$/, "").trim();

  const minLength = SHORT_VALUE_LABELS.has(label.trim().toLowerCase()) ? 1 : 2;
  if (cleaned.length < minLength || cleaned.length > 160) return "";
  if (/^[^A-Za-z0-9]+$/.test(cleaned)) return "";
  if (/^(.)\1{4,}$/.test(cleaned)) return "";

  return cleaned;
}

/** Human-friendly ordering for the detail view: identity fields first. */
const FIELD_PRIORITY = [
  "name", "full name", "child name", "patient name", "policy holder",
  "cnic number", "passport number", "date of birth",
  "father name", "father's name", "father/husband name", "mother name",
  "gender", "sex", "nationality", "address",
];

export function sortFields(fields: ExtractedFields): [string, string][] {
  return Object.entries(fields).sort((a, b) => {
    const ai = FIELD_PRIORITY.indexOf(a[0].toLowerCase());
    const bi = FIELD_PRIORITY.indexOf(b[0].toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a[0].localeCompare(b[0]);
  });
}
