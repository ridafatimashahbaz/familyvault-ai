import { CATEGORIES, DOC_TYPES, docTypeLabel, type CategoryKey } from "@/lib/constants";
import { env } from "@/lib/env";
import { expiryState, type ExpiryState } from "@/lib/utils";
import { dateKey, type DateDecision, parseExtractedData } from "@/lib/pipeline/extracted-data";
import { DATE_ROLE_LABELS, type DateRole, type DetectedDate } from "@/lib/pipeline/labelled-dates";
import type { DocumentListItem } from "@/lib/services/documents";

/**
 * Shapes documents for the client.
 *
 * Two things are deliberate here: internal storage details (the storage key,
 * the raw SHA-256) never leave the server, and the list shape omits the OCR
 * text and raw field JSON so a page of results stays small. The detail shape
 * adds them back.
 */

export type DocumentSummary = {
  id: string;
  title: string;
  originalName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  docType: string;
  docTypeLabel: string;
  category: CategoryKey;
  categoryLabel: string;
  status: string;
  ocrStatus: string;
  ocrConfidence: number | null;
  classificationConfidence: number;
  classificationSource: string;
  summary: string | null;
  notes: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  noExpiry: boolean;
  expiry: ExpiryState;
  daysToExpiry: number | null;
  isExpired: boolean;
  encrypted: boolean;
  hasPreview: boolean;
  familyMember: { id: string; name: string; relation: string } | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type DocumentDetail = DocumentSummary & {
  fields: [string, string][];
  evidence: string[];
  ocrText: string | null;
  ocrEngine: string | null;
  expirySource: string | null;
  summarySource: string | null;
  errorMessage: string | null;
  processedAt: string | null;
  pageCount: number | null;
  pagesRead: number;
  textEdited: boolean;
  dates: DateReviewItem[];
};

export type DateReviewItem = {
  /** Send this back unchanged to record a decision about this date. */
  key: string;
  role: DateRole;
  label: string;
  /** The date the reader found, as `YYYY-MM-DD`. */
  detected: string;
  /** The date in force now - the user's if they changed it. */
  effective: string;
  /** The exact characters found in the document. */
  raw: string;
  page: number;
  precision: "day" | "month";
  confidence: number;
  evidence: string;
  reviewRequired: boolean;
  reasons: string[];
  decision: DateDecision | null;
};

/** HEIC and TIFF are accepted for storage but browsers cannot render them. */
const NON_PREVIEWABLE = new Set(["image/heic", "image/tiff"]);

export function toDocumentSummary(row: DocumentListItem): DocumentSummary {
  const category: CategoryKey = row.category in CATEGORIES ? (row.category as CategoryKey) : "other";
  const expiry: ExpiryState = row.noExpiry
    ? "none"
    : expiryState(row.expiryDate, env().EXPIRY_WARNING_DAYS);

  return {
    id: row.id,
    title: row.title,
    originalName: row.originalName,
    extension: row.extension,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    docType: row.docType,
    docTypeLabel: docTypeLabel(row.docType),
    category,
    categoryLabel: CATEGORIES[category].label,
    status: row.status,
    ocrStatus: row.ocrStatus,
    ocrConfidence: row.ocrConfidence,
    classificationConfidence: row.classificationConfidence,
    classificationSource: row.classificationSource,
    summary: row.summary,
    notes: row.notes,
    issueDate: row.issueDate?.toISOString() ?? null,
    expiryDate: row.expiryDate?.toISOString() ?? null,
    noExpiry: row.noExpiry,
    expiry,
    daysToExpiry: row.daysToExpiry,
    isExpired: row.isExpired,
    encrypted: row.encrypted,
    hasPreview: !NON_PREVIEWABLE.has(row.mimeType),
    familyMember: row.familyMember,
    tags: row.tags.map((t) => t.tag.name),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDocumentDetail(row: DocumentListItem): DocumentDetail {
  const parsed = parseExtractedData(row.extractedData);

  return {
    ...toDocumentSummary(row),
    fields: Object.entries(parsed.fields),
    evidence: parsed.evidence,
    ocrText: row.ocrText,
    ocrEngine: row.ocrEngine,
    expirySource: row.expirySource,
    summarySource: row.summarySource,
    errorMessage: row.errorMessage,
    processedAt: row.processedAt?.toISOString() ?? null,
    pageCount: parsed.pageCount,
    pagesRead: parsed.pagesRead,
    textEdited: parsed.textEdited,
    dates: parsed.dates.map((date) => toDateReviewItem(date, parsed.reviewed[dateKey(date)] ?? null)),
  };
}

function toDateReviewItem(date: DetectedDate, decision: DateDecision | null): DateReviewItem {
  // A correction the user made outranks what the reader found.
  const effective = decision && decision.action !== "ignored" ? (decision.iso ?? date.iso) : date.iso;

  return {
    key: dateKey(date),
    role: date.role,
    label: DATE_ROLE_LABELS[date.role],
    detected: date.iso,
    effective,
    raw: date.raw,
    page: date.page,
    precision: date.precision,
    confidence: date.confidence,
    evidence: date.evidence,
    reviewRequired: date.reviewRequired && decision === null,
    reasons: date.reasons,
    decision,
  };
}

/** Offered to the doc-type picker so a user can correct a wrong classification. */
export function docTypeOptions() {
  return DOC_TYPES.map((d) => ({
    key: d.key,
    label: d.label,
    category: d.category,
    categoryLabel: CATEGORIES[d.category].label,
    hasExpiry: d.hasExpiry,
  }));
}
