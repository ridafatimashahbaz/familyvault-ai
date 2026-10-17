import { findDates, toDateKey, type ParsedDate } from "./dates";

/**
 * Dates found *with their meaning*, not just strings that look like dates.
 *
 * A page that says "Next follow up: 12 May 2027" and a page that says
 * "Valid till 12 May 2029" both contain a date; only context tells the user
 * which one is the appointment and which one is the expiry. So every role below
 * is matched by a label phrase and a date is only reported when a label sits
 * right in front of it — the same precision-over-recall rule the expiry
 * detector already uses.
 *
 * Every reported date carries the normalised value, the exact text as
 * recognised, an evidence snippet, the page it came from and a confidence. When
 * any of those are weak the date is flagged `reviewRequired` with the reason,
 * instead of being presented as fact or quietly dropped. A value with no day is
 * reported at month precision and flagged; a value with no year is not reported
 * at all, because inventing one is how a reminder gets set for the wrong year.
 *
 * This does not replace `expiry.ts`: issue and expiry keep their own columns
 * because reminders, the calendar and .ics export read them. These results are
 * the review layer, stored in the existing `extractedData` JSON, so no schema
 * change is needed.
 */

export type DateRole =
  | "issue"
  | "appointment"
  | "followUp"
  | "examination"
  | "prescription"
  | "expiry"
  | "paymentDue"
  | "renewal"
  | "academicDeadline"
  | "other";

export type DetectedDate = {
  role: DateRole;
  /** ISO yyyy-mm-dd, midnight UTC. */
  iso: string;
  /** The exact substring that matched, as recognised. */
  raw: string;
  /** 1-based page number; always 1 for a single image. */
  page: number;
  precision: "day" | "month";
  confidence: number;
  /** Surrounding text, so the user can check the reading without opening the scan. */
  evidence: string;
  reviewRequired: boolean;
  reasons: string[];
};

export type TextPage = { page: number; text: string };

type RoleRule = { role: DateRole; label: string; phrases: string[] };

/** Longest phrases first within a role, so a bare "date" never wins over "date of expiry". */
const ROLE_RULES: RoleRule[] = [
  {
    role: "appointment",
    label: "Appointment",
    phrases: ["next appointment", "appointment date", "appointment on", "your appointment", "appointment"],
  },
  {
    role: "followUp",
    label: "Follow-up",
    phrases: ["next follow up", "next follow-up", "follow up after", "follow-up", "follow up", "review after", "revisit after", "come back on"],
  },
  {
    role: "examination",
    label: "Test / examination",
    phrases: ["date of examination", "examination date", "test date", "date of test", "specimen collected", "sample collected", "collected on", "report date", "examined on", "under test on"],
  },
  {
    role: "prescription",
    label: "Prescription",
    phrases: ["prescribed on", "date of prescription", "prescription is valid", "prescription date", "advised on"],
  },
  {
    role: "paymentDue",
    label: "Payment due",
    phrases: ["payment due", "due date", "due on", "payable on", "installment due", "bill due", "amount due"],
  },
  {
    role: "renewal",
    label: "Renewal",
    phrases: ["renew before", "renewal date", "renew on or before", "policy renewal", "next renewal"],
  },
  {
    role: "academicDeadline",
    label: "Academic deadline",
    phrases: ["last date of admission", "submission deadline", "deadline for", "result date", "semester starts", "fee submission"],
  },
  {
    role: "expiry",
    label: "Expiry",
    phrases: ["date of expiry", "expiry date", "expiration date", "document expires", "valid till", "valid until", "valid up to", "valid through", "expires on", "token paid till", "maturity date", "coverage until", "expiry", "expiration"],
  },
  {
    role: "issue",
    label: "Issue",
    phrases: ["date of issue", "issue date", "issued on", "date of issuance", "commencement date", "effective date", "registration date", "filing date", "executed on"],
  },
];

const WINDOW_CHARS = 90;
const MAX_TOTAL_DATES = 40;
/** Dates with no label near them are shown for information, never as a fact. */
const MAX_UNLABELLED_PER_PAGE = 3;
const CONFIDENT_AT = 0.75;

export function detectLabelledDates(
  pages: TextPage[],
  options: { ocrConfidence?: number | null } = {},
): DetectedDate[] {
  const found: DetectedDate[] = [];
  /** Which spans a role already claimed, so "other" does not repeat them. */
  const claimed = new Map<number, [number, number][]>();
  const seen = new Set<string>();

  for (const { page, text } of pages) {
    if (!text) continue;
    claimed.set(page, []);

    // Every place a heading appears, so a label's search can stop at the next
    // one instead of running into the date that belongs to it.
    const headings = allHeadings(text);

    for (const rule of ROLE_RULES) {
      for (const phrase of rule.phrases) {
        if (found.length >= MAX_TOTAL_DATES) break;

        const hit = findPhrase(text, phrase);
        if (!hit) continue;

        const nextHeading = headings.find((start) => start >= hit.end);
        const windowEnd = Math.min(
          hit.end + WINDOW_CHARS,
          nextHeading ?? Number.POSITIVE_INFINITY,
          text.length,
        );
        const window = text.slice(hit.end, windowEnd);
        if (window.trim().length === 0) continue;

        // Prefer a date with a real day; a bare month is only used when nothing else matched.
        const candidates = findDates(window);
        const best = candidates.find((c) => c.hasDay) ?? candidates[0];
        if (!best) continue;

        const key = `${rule.role}:${toDateKey(best.date)}:${page}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // The window starts at the end of the label, so the offset is relative to it.
        const offset = hit.end + best.index;
        claimed.get(page)!.push([offset, offset + best.raw.length]);
        found.push(describe(rule, best, page, text, hit.start, options.ocrConfidence, []));
      }
    }

    for (const candidate of findDates(text).slice(0, MAX_UNLABELLED_PER_PAGE * 3)) {
      if (found.length >= MAX_TOTAL_DATES) break;
      if (candidate.confidence < 0.6) continue;
      if (overlaps(claimed.get(page) ?? [], candidate.index, candidate.index + candidate.raw.length)) continue;

      const key = `other:${toDateKey(candidate.date)}:${page}`;
      if (seen.has(key)) continue;
      seen.add(key);
      claimed.get(page)!.push([candidate.index, candidate.index + candidate.raw.length]);

      found.push(
        describe(
          { role: "other", label: "Other date", phrases: [""] },
          candidate,
          page,
          text,
          candidate.index,
          options.ocrConfidence,
          ["no label was found near this date, so what it refers to is unknown"],
        ),
      );
    }
  }

  return found.sort((a, b) => a.page - b.page || b.confidence - a.confidence);
}

function overlaps(spans: [number, number][], start: number, end: number): boolean {
  return spans.some(([s, e]) => start < e && end > s);
}

/** Case-insensitive first hit, with a noisy-spacing fallback for poor scans. */
function findPhrase(text: string, phrase: string): { start: number; end: number } | null {
  if (!phrase) return null;
  const direct = text.toLowerCase().indexOf(phrase);
  if (direct !== -1) return { start: direct, end: direct + phrase.length };

  // "Ex p i r y" style splits from a bad scan: match the words with junk between.
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  const pattern = new RegExp(words.map(escapeRegExp).join("[\\s./:\\-]{0,4}"), "i");
  const match = pattern.exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

/**
 * Where each heading phrase begins, ascending. A label may only look for its
 * date up to the next heading, otherwise it reports the date under that heading.
 */
function allHeadings(text: string): number[] {
  const starts: number[] = [];
  const lower = text.toLowerCase();

  for (const rule of ROLE_RULES) {
    for (const phrase of rule.phrases) {
      let at = lower.indexOf(phrase);
      while (at !== -1) {
        starts.push(at);
        at = lower.indexOf(phrase, at + 1);
      }
    }
  }

  return starts.sort((a, b) => a - b);
}

function describe(
  rule: RoleRule,
  parsed: ParsedDate,
  page: number,
  text: string,
  phraseAt: number,
  ocrConfidence: number | null | undefined,
  extraReasons: string[],
): DetectedDate {
  const reasons = [...extraReasons];

  if (!parsed.hasDay) reasons.push("only the month was found, not the day");
  if (parsed.confidence < CONFIDENT_AT && !reasons.length) {
    reasons.push(
      parsed.format === "numeric"
        ? "day and month order is unclear in this format"
        : "the words around this date were hard to read",
    );
  }
  if (typeof ocrConfidence === "number" && ocrConfidence < 70) {
    reasons.push(
      `the text on this page was read with ${Math.round(ocrConfidence)}% certainty`,
    );
  }

  const from = Math.max(0, phraseAt - 10);
  // The look-back can land inside a word, and "xt visit: …" reads as noise.
  const evidence = (from > 0 && !/\s/.test(text[from - 1] ?? "")
    ? text.slice(from, phraseAt + 200).replace(/^\S*\s*/, "")
    : text.slice(from, phraseAt + 200)
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  return {
    role: rule.role,
    iso: toDateKey(parsed.date),
    raw: parsed.raw,
    page,
    precision: parsed.hasDay ? "day" : "month",
    confidence: Math.round(parsed.confidence * 100) / 100,
    evidence,
    reviewRequired: reasons.length > 0,
    reasons,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const DATE_ROLE_LABELS: Record<DateRole, string> = {
  ...Object.fromEntries(ROLE_RULES.map((rule) => [rule.role, rule.label])),
  other: "Other date",
} as Record<DateRole, string>;
