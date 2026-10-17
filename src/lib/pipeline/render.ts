import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { MAX_PDF_PAGES } from "@/lib/constants";

const run = promisify(execFile);

/**
 * Turning a scanned PDF into page images so OCR can read it.
 *
 * Tesseract cannot read a PDF, and the usual Node workaround pulls in a native
 * canvas build — which makes the image heavier, the deploy fragile and the
 * `npm ci` platform-dependent. Instead this uses poppler's `pdftoppm` when the
 * host has it (the Docker image installs it) and simply reports that rendering
 * is unavailable when it does not. Nothing is pretended: an unrendered scan
 * still stores, downloads and warns honestly.
 *
 * Pages are written to a private temp directory and read back one at a time, so
 * a 40-page scan costs one page of memory rather than 40. The directory is
 * removed by the caller in a `finally`.
 *
 * `execFile` with a fixed argument array is used deliberately: no shell, so no
 * interpretation of anything derived from the uploaded file.
 */

const RENDER_TIMEOUT_MS = 120_000;
/** 200 DPI keeps a page readable for OCR while staying near 1.5 MB. */
const RENDER_DPI = 200;

export type RenderedPages = { dir: string; files: string[] };

let rendererCheck: Promise<boolean> | null = null;

/**
 * True when `pdftoppm` is installed. Cached: this does not change mid-process.
 *
 * Only a missing binary counts as unavailable. `pdftoppm -v` writes its version
 * to stderr and some builds exit non-zero anyway — that still proves the
 * renderer is there, and the real render call reports its own failures.
 */
export function hasPdfRenderer(): Promise<boolean> {
  if (!rendererCheck) {
    rendererCheck = run("pdftoppm", ["-v"], { timeout: 10_000 })
      .then(() => true)
      .catch((error: unknown) =>
        typeof error === "object" && error !== null && "code" in error
          ? error.code !== "ENOENT"
          : true,
      );
  }
  return rendererCheck;
}

function pageNumberOf(file: string): number {
  const match = /-(\d+)\.png$/.exec(file);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Rasterises the first `maxPages` pages of a PDF into PNG files.
 * Returns `{ ok: false }` — never throws — when there is no renderer, so the
 * pipeline records the limitation and carries on with what it has.
 */
export async function renderPdfPages(
  buffer: Buffer,
  maxPages = MAX_PDF_PAGES,
): Promise<{ ok: true; pages: RenderedPages } | { ok: false; reason: string }> {
  if (!(await hasPdfRenderer())) {
    return { ok: false, reason: "no-pdf-renderer" };
  }

  const dir = await mkdtemp(path.join(tmpdir(), "fv-pdf-"));

  try {
    const source = path.join(dir, "document.pdf");
    const prefix = path.join(dir, "page");
    // 0600: this is somebody's medical report, on a shared machine's temp dir.
    await writeFile(source, buffer, { mode: 0o600 });

    await run(
      "pdftoppm",
      ["-png", "-r", String(RENDER_DPI), "-f", "1", "-l", String(maxPages), source, prefix],
      { timeout: RENDER_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
    );

    const entries = await readdir(dir);
    const files = entries
      .filter((name) => name.startsWith("page-") && name.endsWith(".png"))
      .sort((a, b) => pageNumberOf(a) - pageNumberOf(b))
      .map((name) => path.join(dir, name));

    // Only names we produced are returned, so nothing outside this directory
    // can be read back through the result.
    if (files.length === 0) {
      return { ok: false, reason: "renderer-produced-nothing" };
    }

    return { ok: true, pages: { dir, files } };
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    return { ok: false, reason: error instanceof Error ? error.message.slice(0, 200) : "render-failed" };
  }
}

export async function readRenderedPage(file: string): Promise<Buffer> {
  return readFile(file);
}

export async function cleanupRenderedPages(pages: RenderedPages): Promise<void> {
  await rm(pages.dir, { recursive: true, force: true }).catch(() => undefined);
}
