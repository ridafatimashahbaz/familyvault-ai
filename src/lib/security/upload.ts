import path from "node:path";

import { env } from "@/lib/env";

/**
 * Upload validation.
 *
 * Files are identified by their magic bytes, never by the browser-supplied
 * MIME type or extension, so a renamed executable cannot be smuggled in.
 * SVG is deliberately excluded: it is an XML document that can carry script,
 * which would be a stored-XSS vector once rendered in an <img> or iframe.
 */

export type FileKind = "image" | "pdf";

export type DetectedFile = {
  mimeType: string;
  extension: string;
  kind: FileKind;
  /** tesseract.js can rasterise and read this format. */
  ocrCapable: boolean;
  /** A browser can render this format inline. */
  previewCapable: boolean;
};

type Signature = {
  test: (b: Buffer) => boolean;
  result: DetectedFile;
};

const startsWith = (b: Buffer, bytes: number[], offset = 0) =>
  b.length >= offset + bytes.length && bytes.every((v, i) => b[offset + i] === v);

const asciiAt = (b: Buffer, text: string, offset = 0) =>
  b.length >= offset + text.length && b.subarray(offset, offset + text.length).toString("ascii") === text;

const HEIC_BRANDS = ["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"];

const SIGNATURES: Signature[] = [
  { test: (b) => startsWith(b, [0xff, 0xd8, 0xff]), result: { mimeType: "image/jpeg", extension: "jpg", kind: "image", ocrCapable: true, previewCapable: true } },
  { test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), result: { mimeType: "image/png", extension: "png", kind: "image", ocrCapable: true, previewCapable: true } },
  { test: (b) => asciiAt(b, "GIF87a") || asciiAt(b, "GIF89a"), result: { mimeType: "image/gif", extension: "gif", kind: "image", ocrCapable: true, previewCapable: true } },
  { test: (b) => asciiAt(b, "RIFF") && asciiAt(b, "WEBP", 8), result: { mimeType: "image/webp", extension: "webp", kind: "image", ocrCapable: true, previewCapable: true } },
  { test: (b) => asciiAt(b, "BM"), result: { mimeType: "image/bmp", extension: "bmp", kind: "image", ocrCapable: true, previewCapable: true } },
  { test: (b) => startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a]), result: { mimeType: "image/tiff", extension: "tiff", kind: "image", ocrCapable: true, previewCapable: false } },
  { test: (b) => asciiAt(b, "ftyp", 4) && HEIC_BRANDS.includes(b.subarray(8, 12).toString("ascii")), result: { mimeType: "image/heic", extension: "heic", kind: "image", ocrCapable: false, previewCapable: false } },
  { test: (b) => asciiAt(b, "%PDF"), result: { mimeType: "application/pdf", extension: "pdf", kind: "pdf", ocrCapable: true, previewCapable: true } },
];

export function detectFileType(buffer: Buffer): DetectedFile | null {
  for (const signature of SIGNATURES) {
    if (signature.test(buffer)) return signature.result;
  }
  return null;
}

export function maxUploadBytes(): number {
  return env().MAX_UPLOAD_MB * 1024 * 1024;
}

export const ACCEPTED_MIME_TYPES = SIGNATURES.map((s) => s.result.mimeType);

export const ACCEPTED_EXTENSIONS = SIGNATURES.map((s) => s.result.extension);

/** Keeps a display name but removes anything that could act as a path. */
export function sanitizeFilename(name: string): string {
  const base = path.basename(name ?? "").replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_");
  const trimmed = base.slice(0, 180).trim();
  return trimmed || "untitled";
}

export type UploadCheck =
  | { ok: true; detected: DetectedFile; filename: string }
  | { ok: false; message: string };

export function validateUpload(
  filename: string,
  sizeBytes: number,
  buffer: Buffer,
): UploadCheck {
  if (buffer.length === 0 || sizeBytes === 0) {
    return { ok: false, message: "The file is empty." };
  }

  const limit = maxUploadBytes();
  if (buffer.length > limit) {
    return {
      ok: false,
      message: `The file is ${(buffer.length / 1048576).toFixed(1)} MB. The limit is ${env().MAX_UPLOAD_MB} MB.`,
    };
  }

  const detected = detectFileType(buffer);
  if (!detected) {
    return {
      ok: false,
      message:
        "Unsupported file type. Upload a photo or scan (JPG, PNG, WEBP, GIF, BMP, TIFF, HEIC) or a PDF.",
    };
  }

  return { ok: true, detected, filename: sanitizeFilename(filename) };
}
