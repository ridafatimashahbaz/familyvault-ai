import { MAX_OCR_PAGES, OCR_TIME_BUDGET_MS } from "@/lib/constants";
import { summarizeDocument } from "@/lib/ai/summarize";
import type { DetectedFile } from "@/lib/security/upload";
import type { OcrStatus } from "@/lib/constants";

import { classifyDocument, type Classification } from "./classify";
import { extractFields, type ExtractedFields } from "./extract";
import { detectDates, type DateDetection, reconcileExpiry } from "./expiry";
import { normalizeOcrText, recognizeImage } from "./ocr";
import { detectLabelledDates, type DetectedDate, type TextPage } from "./labelled-dates";
import { extractPdfText } from "./pdf";
import { cleanupRenderedPages, readRenderedPage, renderPdfPages } from "./render";

/**
 * The document processing pipeline.
 *
 * text extraction -> classification -> field extraction -> date detection
 * -> labelled date detection -> summary. Each stage records what it could and
 * could not do, so a partial failure (unreadable scan, unsupported format)
 * still leaves a usable document behind with an honest explanation attached.
 *
 * Text is kept page by page so a date can say which page it came from, and so a
 * scanned PDF can be read one page at a time without holding every page in
 * memory at once.
 */

export type ProcessInput = {
  buffer: Buffer;
  filename: string;
  detected: DetectedFile;
  memberName?: string | null;
};

export type ProcessResult = {
  text: string;
  pages: TextPage[];
  ocrStatus: OcrStatus;
  ocrEngine: string | null;
  ocrConfidence: number | null;
  pageCount: number | null;
  pagesRead: number;
  classification: Classification;
  fields: ExtractedFields;
  dates: DateDetection;
  labelledDates: DetectedDate[];
  summary: string;
  summarySource: "local";
  warnings: string[];
};

export async function processDocument(input: ProcessInput): Promise<ProcessResult> {
  const warnings: string[] = [];

  let pages: TextPage[] = [];
  let ocrStatus: OcrStatus = "pending";
  let ocrEngine: string | null = null;
  let ocrConfidence: number | null = null;
  let pageCount: number | null = null;
  let pagesRead = 0;

  if (input.detected.kind === "pdf") {
    const pdf = await extractPdfText(input.buffer);

    if (!pdf.ok) {
      ocrStatus = "failed";
      warnings.push(`Could not read this PDF: ${pdf.error}`);
    } else {
      pageCount = pdf.total;

      if (pdf.hasTextLayer) {
        pages = pdf.pages;
        ocrStatus = "done";
        ocrEngine = "pdf-text-layer";
        ocrConfidence = null;
        pagesRead = pages.length;
        if (pdf.truncated) {
          warnings.push(
            `This PDF has ${pdf.total} pages; the first ${pages.length} were read. ` +
              "The whole file is stored and downloadable — split it if you need the rest indexed.",
          );
        }
      } else {
        // No text layer: try to read the scan itself.
        const scanned = await ocrScannedPdf(input.buffer, pageCount);
        pages = scanned.pages;
        pagesRead = pages.length;
        ocrEngine = scanned.engine;
        ocrConfidence = scanned.confidence;

        if (pages.length > 0) {
          ocrStatus = "done";
          if (scanned.stoppedAt) {
            warnings.push(
              `Only the first ${pages.length} pages were read before the time limit. ` +
                "Use Re-analyse on a quieter moment to read further.",
            );
          }
        } else {
          ocrStatus = scanned.rendered ? "failed" : "skipped";
          warnings.push(
            scanned.rendered
              ? "This PDF is a scan and OCR produced no text from it. The pages may be blank, extremely low resolution, or mostly handwriting."
              : "This PDF is a scan with no embedded text layer, and this server has no PDF page renderer installed, so its contents could not be read. " +
                "It is stored safely and classified from the file name only. Installing poppler-utils (the Docker image already has it) or re-uploading the scan as JPG/PNG enables OCR.",
          );
        }
      }
    }
  } else if (input.detected.ocrCapable) {
    const result = await recognizeImage(input.buffer);

    if (result.ok) {
      pages = [{ page: 1, text: result.text }];
      pagesRead = 1;
      pageCount = 1;
      ocrStatus = "done";
      ocrEngine = result.engine;
      ocrConfidence = result.confidence;
    } else {
      ocrStatus = "failed";
      warnings.push(`OCR failed: ${result.error}`);
    }
  } else {
    ocrStatus = "skipped";
    pageCount = 1;
    warnings.push(
      `${input.detected.extension.toUpperCase()} images cannot be decoded by the OCR engine. ` +
        "The file is stored and downloadable, but its contents were not indexed.",
    );
  }

  pages = pages
    .map((p) => ({ page: p.page, text: normalizeOcrText(p.text) }))
    .filter((p) => p.text.length > 0);
  const text = pages.map((p) => p.text).join("\n\n");

  if (!text && ocrStatus === "done") {
    warnings.push(
      "No readable text was found. The image may be blank, heavily cropped, very low resolution, upside down, or handwritten.",
    );
  } else if (text && ocrConfidence !== null && ocrConfidence < 55) {
    warnings.push(
      `OCR confidence was low (${Math.round(ocrConfidence)}%). Extracted details should be checked against the original.`,
    );
  }

  if (ocrConfidence !== null && ocrConfidence < 45) {
    warnings.push(
      "Low confidence usually means handwriting, a faint stamp or a poor photo. The printed-text reader cannot learn handwriting, so please check the important numbers yourself and correct the extracted text if it is wrong.",
    );
  }

  const classification = classifyDocument(text, input.filename);

  if (classification.docType === "other") {
    warnings.push(
      "The document type could not be identified automatically. You can set it on the document page.",
    );
  }

  const fields = extractFields(text, classification.docType);
  const labelledDates = detectLabelledDates(pages, { ocrConfidence });

  const { dates, warnings: dateWarnings } = reconcileExpiry(
    detectDates(text, classification.docType, fields),
    labelledDates,
  );
  warnings.push(...dateWarnings);

  const summarized = await summarizeDocument({
    title: input.filename,
    docType: classification.docType,
    category: classification.category,
    memberName: input.memberName ?? null,
    text,
    fields,
    issueDate: dates.issueDate,
    expiryDate: dates.expiryDate,
  });

  return {
    text,
    pages,
    ocrStatus,
    ocrEngine: ocrEngine ?? null,
    ocrConfidence,
    pageCount,
    pagesRead,
    classification,
    fields,
    dates,
    labelledDates,
    summary: summarized.summary,
    summarySource: summarized.source,
    warnings,
  };
}

type ScannedOcrOutcome = {
  pages: TextPage[];
  engine: string | null;
  confidence: number | null;
  rendered: boolean;
  stoppedAt: boolean;
};

/**
 * Renders a scanned PDF and OCRs it page by page.
 *
 * Both caps are enforced here: at most MAX_OCR_PAGES pages, and never longer
 * than OCR_TIME_BUDGET_MS in total, because this runs inside the upload request
 * and the OCR worker is shared by every user. Whatever was read before a cap is
 * kept — a half-read document is useful, a failed one is not.
 */
async function ocrScannedPdf(buffer: Buffer, totalPages: number | null): Promise<ScannedOcrOutcome> {
  const rendered = await renderPdfPages(buffer, MAX_OCR_PAGES);
  if (!rendered.ok) {
    return { pages: [], engine: null, confidence: null, rendered: false, stoppedAt: false };
  }

  const started = Date.now();
  const pages: TextPage[] = [];
  const confidences: number[] = [];
  let engine: string | null = null;
  let stoppedAt = false;

  try {
    const limit = Math.min(rendered.pages.files.length, MAX_OCR_PAGES, totalPages ?? MAX_OCR_PAGES);

    for (let i = 0; i < limit; i++) {
      if (Date.now() - started > OCR_TIME_BUDGET_MS) {
        stoppedAt = true;
        break;
      }

      const image = await readRenderedPage(rendered.pages.files[i]!);
      const result = await recognizeImage(image, Math.max(10_000, OCR_TIME_BUDGET_MS - (Date.now() - started)));

      if (!result.ok) {
        if (pages.length === 0) {
          return { pages: [], engine: null, confidence: null, rendered: true, stoppedAt: false };
        }
        stoppedAt = true;
        break;
      }

      engine = result.engine;
      if (result.confidence !== null) confidences.push(result.confidence);
      if (result.text) pages.push({ page: i + 1, text: result.text });
    }
  } finally {
    await cleanupRenderedPages(rendered.pages);
  }

  return {
    pages,
    engine,
    // The weakest page sets the tone: one unreadable page in a four-page report
    // should not be averaged into a confident-looking number.
    confidence: confidences.length ? Math.min(...confidences) : null,
    rendered: true,
    stoppedAt,
  };
}
