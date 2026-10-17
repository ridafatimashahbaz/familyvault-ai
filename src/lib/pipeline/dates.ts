/**
 * Flexible date parsing for OCR text.
 *
 * OCR output is messy and documents use many regional formats, so this module
 * recognises the common ones, validates that the result is a real calendar
 * date, and records how confident it is in each interpretation.
 *
 * Ambiguity rule: for a numeric date where both components are <= 12
 * (e.g. 03/04/2027) day-first is assumed, which is what CNIC, most European
 * and most South Asian documents use. Those matches are given lower
 * confidence so a nearby unambiguous candidate wins.
 */

export type DateFormat = "iso" | "numeric" | "day-month-name" | "month-name-day" | "month-name";

export type ParsedDate = {
  /** Midnight UTC, so storing in the database never shifts the day. */
  date: Date;
  /** The exact substring that was matched. */
  raw: string;
  format: DateFormat;
  /** Offset in the source text, used to find dates near a label. */
  index: number;
  hasDay: boolean;
  confidence: number;
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2, febuary: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const MONTH_NAME =
  "(?:jan|feb|february|mar|apr|april|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";

const ORDINAL = "(?:st|nd|rd|th)?";
const SEP = "[\\s\\-/,.]";

const PATTERNS: { regex: RegExp; build: (m: RegExpExecArray, index: number) => ParsedDate | null }[] = [
  // 2027-08-15 / 2027/08/15
  {
    regex: new RegExp(`\\b(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})\\b`, "gi"),
    build: (m, index) =>
      makeDate(+m[1]!, +m[2]!, +m[3]!, m[0], "iso", index, true, 0.95),
  },
  // 15 August 2027 / 15-Aug-2027 / 15th August, 2027
  {
    regex: new RegExp(`\\b(\\d{1,2})${ORDINAL}${SEP}*(${MONTH_NAME})\\.?${SEP}*(\\d{4})\\b`, "gi"),
    build: (m, index) => {
      const month = MONTHS[m[2]!.toLowerCase().slice(0, 3)] ?? MONTHS[m[2]!.toLowerCase()];
      return makeDate(+m[3]!, month, +m[1]!, m[0], "day-month-name", index, true, 0.93);
    },
  },
  // August 15, 2027 / Aug 15 2027
  {
    regex: new RegExp(`\\b(${MONTH_NAME})\\.?${SEP}(\\d{1,2})${ORDINAL}${SEP}*(\\d{4})\\b`, "gi"),
    build: (m, index) => {
      const month = MONTHS[m[1]!.toLowerCase().slice(0, 3)] ?? MONTHS[m[1]!.toLowerCase()];
      return makeDate(+m[3]!, month, +m[2]!, m[0], "month-name-day", index, true, 0.93);
    },
  },
  // 15/08/2027, 15-08-27, 15.08.2027
  {
    regex: new RegExp(`\\b(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{2,4})\\b`, "g"),
    build: (m, index) => {
      const first = +m[1]!;
      const second = +m[2]!;
      let year = +m[3]!;
      if (year < 100) year = year < 50 ? 2000 + year : 1900 + year;

      if (first > 12 && second <= 12) {
        return makeDate(year, second, first, m[0], "numeric", index, true, 0.9);
      }
      if (second > 12 && first <= 12) {
        return makeDate(year, first, second, m[0], "numeric", index, true, 0.75);
      }
      // Genuinely ambiguous - assume day-first.
      return makeDate(year, second, first, m[0], "numeric", index, true, 0.6);
    },
  },
  // August 2027 (no day) - used for coarse issue/expiry hints
  {
    regex: new RegExp(`\\b(${MONTH_NAME})\\.?,${SEP}(\\d{4})\\b`, "gi"),
    build: (m, index) => {
      const month = MONTHS[m[1]!.toLowerCase().slice(0, 3)] ?? MONTHS[m[1]!.toLowerCase()];
      return makeDate(+m[2]!, month, 1, m[0], "month-name", index, false, 0.5);
    },
  },
];

const MAX_RESULTS = 200;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function makeDate(
  year: number,
  month: number,
  day: number,
  raw: string,
  format: DateFormat,
  index: number,
  hasDay: boolean,
  confidence: number,
): ParsedDate | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return {
    date: new Date(Date.UTC(year, month - 1, day)),
    raw: raw.trim(),
    format,
    index,
    hasDay,
    confidence,
  };
}

/**
 * Finds every plausible date in a block of text, most-confident first.
 * Overlapping matches are dropped so "15 August 2027" is not also reported
 * as a numeric date.
 */
export function findDates(text: string): ParsedDate[] {
  if (!text) return [];

  const found: ParsedDate[] = [];
  const claimed: [number, number][] = [];

  for (const { regex, build } of PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      const overlaps = claimed.some(([s, e]) => start < e && end > s);
      // Advance on zero-length matches so the loop always terminates.
      if (match[0].length === 0) regex.lastIndex++;
      if (overlaps) continue;

      const parsed = build(match, start);
      if (parsed) {
        claimed.push([start, end]);
        found.push(parsed);
      }

      if (found.length >= MAX_RESULTS) return sortDates(found);
    }
  }

  return sortDates(found);
}

function sortDates(dates: ParsedDate[]): ParsedDate[] {
  return dates.sort((a, b) => b.confidence - a.confidence || a.index - b.index);
}

/**
 * Finds the date that best belongs to one of `labels` - closest to it, with
 * day precision and parsing confidence as modifiers.
 * This is how "Date of Expiry: 15-08-2027" is resolved reliably instead of
 * guessing from every date on the page.
 */
export function findDateAfterLabel(
  text: string,
  labels: string[],
  windowChars = 80,
): ParsedDate | null {
  const lower = text.toLowerCase();

  let best: { candidate: ParsedDate; score: number } | null = null;

  for (const label of labels) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(label, from);
      if (at === -1) break;
      from = at + label.length;

      const searchStart = at + label.length;
      const window = text.slice(searchStart, searchStart + windowChars);

      for (const candidate of findDates(window)) {
        // Day precision is worth a little, distance from the label costs:
        // a date further along the line usually belongs to the next field.
        const score =
          candidate.confidence + (candidate.hasDay ? 0.05 : -0.2) - candidate.index / 1000;
        if (!best || score > best.score) {
          best = {
            candidate: { ...candidate, index: searchStart + candidate.index },
            score,
          };
        }
      }
    }
  }

  return best?.candidate ?? null;
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
