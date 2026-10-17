import { env } from "@/lib/env";
import { MAX_PDF_PAGES } from "@/lib/constants";

/**
 * Text extraction for PDFs.
 *
 * Uses the PDF's embedded text layer, which is present on digitally produced
 * documents (bank statements, tax returns, e-certificates). Scanned PDFs have
 * no text layer; those are handed to `renderPdfPages`, which rasterises them
 * when a PDF renderer is installed.
 *
 * Text is returned page by page because a family document is often several
 * pages long and "the 3rd page says 12 May 2027" is only useful advice if the
 * app can say which page it meant.
 *
 * Page count is capped for *processing*, never for storage: a 300-page scan is
 * still kept and downloadable, but reading all of it would block the single OCR
 * worker for minutes and time out. The cap is reported so the UI can be honest
 * about what was actually read.
 */

export type PdfPage = { page: number; text: string };

export type PdfTextOutcome =
  | { ok: true; pages: PdfPage[]; text: string; total: number; hasTextLayer: boolean; truncated: boolean }
  | { ok: false; error: string };

export async function extractPdfText(buffer: Buffer): Promise<PdfTextOutcome> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const result = await parser.getText();
      const total = result.total ?? result.pages?.length ?? 0;

      const all: PdfPage[] = (result.pages ?? [])
        .map((p) => ({ page: p.num, text: (p.text ?? "").replace(/\r/g, "").trim() }))
        .filter((p) => p.text.length > 0);

      const kept = all.slice(0, MAX_PDF_PAGES);
      const text = (result.text ?? "").replace(/\r/g, "").trim();
      const readable = kept.reduce((sum, p) => sum + p.text.length, 0);

      return {
        ok: true,
        pages: kept,
        text: kept.length > 0 ? kept.map((p) => p.text).join("\n\n") : text,
        total,
        // Judged on the pages actually kept: a text layer that only starts on
        // page 41 is not a text layer this run can use.
        hasTextLayer: readable >= env().PDF_TEXT_LAYER_MIN_CHARS,
        truncated: all.length > kept.length,
      };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read the PDF.",
    };
  }
}
