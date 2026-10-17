/**
 * A hand-built, valid PDF with a real text layer.
 *
 * Only used by tests: it lets the pipeline be checked against multi-page
 * documents without committing a binary fixture, and every word in it is
 * invented.
 */

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function contentStream(lines: string[]): string {
  const body = lines
    .map((line, index) =>
      index === 0
        ? `BT /F1 12 Tf 50 800 Td (${escapeText(line)}) Tj ET`
        : `BT /F1 12 Tf 50 ${800 - index * 18} Td (${escapeText(line)}) Tj ET`,
    )
    .join("\n");

  return `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
}

/**
 * Builds a PDF with one page per entry in `pages`.
 *
 * Written with byte-exact xref offsets, which is the only part a reader is
 * strict about.
 */
export function makeTextPdf(pages: string[][]): Buffer {
  const objects: string[] = [];
  const firstPageObj = 3;
  const fontObj = firstPageObj + pages.length * 2;
  const kids = pages
    .map((_, index) => `${firstPageObj + index * 2} 0 R`)
    .join(" ");

  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

  pages.forEach((lines, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]` +
        ` /Resources << /Font << /F1 ${fontObj} 0 R >> >>` +
        ` /Contents ${firstPageObj + index * 2 + 1} 0 R >>`,
    );
    objects.push(contentStream(lines));
  });

  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefAt = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

/** A PDF with the right structure but nothing readable on any page. */
export function makeEmptyPdf(pageCount = 1): Buffer {
  return makeTextPdf(Array.from({ length: pageCount }, () => [""]));
}

/** `n` pages, each carrying enough text to count as a real text layer. */
export function makeManyPagePdf(pageCount: number): Buffer {
  return makeTextPdf(
    Array.from({ length: pageCount }, (_, index) => [
      `Synthetic page ${index + 1} of a long document.`,
      `This line exists so the reader has something to find on page ${index + 1}.`,
      `Date of Expiry 31-12-20${String(30 + (index % 5)).padStart(2, "0")}`,
    ]),
  );
}
