import type { NextRequest } from "next/server";

import { apiError, handleApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { DecryptionError } from "@/lib/security/crypto";
import { getDocumentFile } from "@/lib/services/documents";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Streams the decrypted original file.
 *
 * The blob is decrypted in memory per request and never written to a temp
 * path, so plaintext never touches the disk. The content type comes from the
 * magic-byte detection performed at upload, not from anything the client sent,
 * and SVG and HTML are rejected at upload - which together make inline display
 * safe. `?download=1` switches to an attachment.
 */
export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;

  try {
    const user = await requireApiUser();
    const { buffer, document } = await getDocumentFile(id, user.id);
    const asAttachment = request.nextUrl.searchParams.get("download") === "1";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": contentDisposition(asAttachment, document.originalName),
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        // Decrypted content must never be cached by a shared or browser cache.
        "Cache-Control": "private, no-store, must-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof DecryptionError) {
      console.error(`[documents] could not decrypt ${id}`, error);
      return apiError(error.message, 500);
    }
    return handleApiError(error);
  }
}

/** RFC 6266 / 5987: an ASCII fallback plus a UTF-8 filename for real names. */
function contentDisposition(attachment: boolean, filename: string): string {
  const type = attachment ? "attachment" : "inline";
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);

  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
