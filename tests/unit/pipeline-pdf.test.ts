import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { MAX_PDF_PAGES } from "@/lib/constants";
import { extractPdfText } from "@/lib/pipeline/pdf";
import { cleanupRenderedPages, hasPdfRenderer, renderPdfPages } from "@/lib/pipeline/render";

import { makeEmptyPdf, makeManyPagePdf, makeTextPdf } from "../fixtures/pdf";

describe("PDF text extraction is page aware", () => {
  test("reads the text layer of a two-page document and keeps them apart", async () => {
    const result = await extractPdfText(
      makeTextPdf([
        ["FIRST PAGE BODY TEXT that is comfortably longer than the minimum.", "Name AYESHA SIDDIQUI"],
        ["SECOND PAGE BODY TEXT that is comfortably longer than the minimum."],
      ]),
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.total, 2);
    assert.equal(result.hasTextLayer, true);
    assert.equal(result.truncated, false);
    assert.deepEqual(
      result.pages.map((p) => p.page),
      [1, 2],
    );
    assert.match(result.pages[0]!.text, /FIRST PAGE/);
    assert.doesNotMatch(result.pages[0]!.text, /SECOND PAGE/);
    assert.match(result.pages[1]!.text, /SECOND PAGE/);
  });

  test("does not report an unread page as a text layer", async () => {
    const result = await extractPdfText(makeEmptyPdf(2));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.hasTextLayer, false);
    assert.deepEqual(result.pages, []);
  });

  test("caps how much it reads but still reports the real page count", async () => {
    const result = await extractPdfText(makeManyPagePdf(MAX_PDF_PAGES + 5));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.total, MAX_PDF_PAGES + 5, "the file is stored whole; only reading is capped");
    assert.equal(result.pages.length, MAX_PDF_PAGES);
    assert.equal(result.truncated, true);
  });

  test("reports a broken file as an error instead of throwing", async () => {
    const result = await extractPdfText(Buffer.from("this is not a pdf"));
    assert.equal(result.ok, false);
  });
});

describe("scanned PDF rasterisation degrades honestly", () => {
  test("feature detection answers a question rather than throwing", async () => {
    const available = await hasPdfRenderer();
    assert.equal(typeof available, "boolean");
  });

  test("refuses to render when no renderer is installed", async () => {
    const available = await hasPdfRenderer();
    const result = await renderPdfPages(makeEmptyPdf(1));

    if (!available) {
      assert.equal(result.ok, false, "a machine without a PDF renderer must say so, not pretend");
      return;
    }

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.pages.files.length, 1);
    await cleanupRenderedPages(result.pages);
  });
});
