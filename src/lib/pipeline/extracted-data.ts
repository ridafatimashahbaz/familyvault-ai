import type { Classification } from "./classify";
import type { DateRole, DetectedDate } from "./labelled-dates";

/**
 * What the pipeline keeps beside the document.
 *
 * This is the payload of the existing `Document.extractedData` text column, so
 * none of it needs a migration. Two rules shape it:
 *
 * - It must stay small. The page-by-page text is *not* stored here — `ocrText`
 *   already holds the whole document, and duplicating it per page would double
 *   the column for no benefit. Only the page count and the dates are kept.
 * - Anything the user decided survives a re-analyse. `reviewed` records
 *   confirmations and rejections, `textEdited` records that the extracted text
 *   was corrected by hand. Re-running OCR over a document the user has already
 *   checked is how trust is lost.
 */

export type DateDecisionAction = "confirmed" | "ignored" | "expiry";

export type DateDecision = {
  action: DateDecisionAction;
  /** ISO date the user settled on, when they changed it. */
  iso?: string;
  decidedAt: string;
};

export type ExtractedData = {
  fields: Record<string, string>;
  evidence: string[];
  pageCount: number | null;
  pagesRead: number;
  dates: DetectedDate[];
  reviewed: Record<string, DateDecision>;
  textEdited: boolean;
};

export const EMPTY_EXTRACTED: ExtractedData = {
  fields: {},
  evidence: [],
  pageCount: null,
  pagesRead: 0,
  dates: [],
  reviewed: {},
  textEdited: false,
};

/** Stable identity for a detected date, used as the key in `reviewed`. */
export function dateKey(date: Pick<DetectedDate, "role" | "iso" | "page">): string {
  return `${date.role}:${date.iso}:${date.page}`;
}

export type PipelineOutput = {
  fields: Record<string, string>;
  classification: Classification;
  pageCount: number | null;
  pagesRead: number;
  labelledDates: DetectedDate[];
};

/**
 * Builds the stored payload from a pipeline run, carrying forward whatever the
 * user already decided. Decisions whose date is no longer detected are kept:
 * the user may have confirmed a date the reader can no longer see, and silently
 * deleting their confirmation is worse than keeping an orphan.
 */
export function buildExtractedData(
  output: PipelineOutput,
  previous: ExtractedData | null,
): ExtractedData {
  return {
    fields: output.fields,
    evidence: output.classification.matchedTerms.slice(0, 12),
    pageCount: output.pageCount,
    pagesRead: output.pagesRead,
    dates: output.labelledDates.slice(0, 40),
    reviewed: { ...(previous?.reviewed ?? {}) },
    textEdited: previous?.textEdited ?? false,
  };
}

export function parseExtractedData(raw: string | null): ExtractedData {
  if (!raw) return { ...EMPTY_EXTRACTED };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...EMPTY_EXTRACTED };
  }

  if (typeof parsed !== "object" || parsed === null) return { ...EMPTY_EXTRACTED };

  const value = parsed as Partial<ExtractedData> & {
    dates?: unknown;
    reviewed?: unknown;
  };

  return {
    fields: toStringRecord(value.fields),
    evidence: Array.isArray(value.evidence) ? value.evidence.filter((e): e is string => typeof e === "string") : [],
    pageCount: typeof value.pageCount === "number" ? value.pageCount : null,
    pagesRead: typeof value.pagesRead === "number" ? value.pagesRead : 0,
    dates: Array.isArray(value.dates) ? value.dates.filter(isDetectedDate) : [],
    reviewed: toDecisions(value.reviewed),
    textEdited: value.textEdited === true,
  };
}

/** Rows written before this module existed carry only `fields` and `evidence`. */
function isDetectedDate(candidate: unknown): candidate is DetectedDate {
  if (typeof candidate !== "object" || candidate === null) return false;
  const d = candidate as Partial<DetectedDate>;

  return (
    typeof d.role === "string" &&
    typeof d.iso === "string" &&
    ISO_DATE.test(d.iso) &&
    typeof d.raw === "string" &&
    typeof d.page === "number" &&
    (d.precision === "day" || d.precision === "month") &&
    typeof d.confidence === "number" &&
    typeof d.evidence === "string" &&
    typeof d.reviewRequired === "boolean" &&
    Array.isArray(d.reasons)
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The stored form of a date: `YYYY-MM-DD`, always interpreted as UTC midnight. */
export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

function toStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function toDecisions(value: unknown): Record<string, DateDecision> {
  if (typeof value !== "object" || value === null) return {};

  const out: Record<string, DateDecision> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "object" || raw === null) continue;
    const decision = raw as Partial<DateDecision>;
    if (decision.action !== "confirmed" && decision.action !== "ignored" && decision.action !== "expiry") continue;

    out[key] = {
      action: decision.action,
      ...(typeof decision.iso === "string" && ISO_DATE.test(decision.iso) ? { iso: decision.iso } : {}),
      decidedAt: typeof decision.decidedAt === "string" ? decision.decidedAt : new Date().toISOString(),
    };
  }
  return out;
}

/** The roles the date-review UI groups by; `other` is informational only. */
export const ACTIONABLE_ROLES: DateRole[] = [
  "issue",
  "appointment",
  "followUp",
  "examination",
  "prescription",
  "expiry",
  "paymentDue",
  "renewal",
  "academicDeadline",
];

/** Every role a stored date can carry, including the informational one. */
export const DATE_ROLES: DateRole[] = [...ACTIONABLE_ROLES, "other"];

export type ReviewedDate = { kind: "none" } | { kind: "date"; date: Date };

/**
 * The date the user settled on for `role`, if they ever decided one.
 *
 * `undefined` means "no decision, the pipeline's answer stands"; a rejection is
 * returned as `kind: "none"` rather than dropped, so a re-analyse cannot
 * resurrect an expiry the user already said was a misread. Re-processing that
 * silently overwrites a checked date is how a wrong reminder comes back.
 *
 * For `expiry` the search also covers decisions filed under other roles: "use
 * this as the expiry date" is stored against the date the reader actually found,
 * which is often an appointment or renewal date. Ignoring those would let a
 * re-analyse throw away a reminder the user chose on purpose.
 */
export function reviewedDate(
  data: ExtractedData,
  role: DateRole,
): ReviewedDate | undefined {
  const decided = Object.entries(data.reviewed)
    .filter(([key, decision]) => key.split(":")[0] === role || (role === "expiry" && decision.action === "expiry"))
    .sort((a, b) => b[1].decidedAt.localeCompare(a[1].decidedAt));

  for (const [key, decision] of decided) {
    if (decision.action === "ignored") return { kind: "none" };

    const iso = decision.iso ?? key.split(":")[1];
    if (!iso || !ISO_DATE.test(iso)) continue;
    return { kind: "date", date: new Date(`${iso}T00:00:00.000Z`) };
  }

  return undefined;
}
