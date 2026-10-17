import type { NextRequest } from "next/server";

import { apiError, apiOk, handleApiError } from "@/lib/api";
import { hasValidOrigin } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/session";
import { reprocessDocument } from "@/lib/services/documents";
import { toDocumentDetail } from "@/lib/serializers";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/**
 * Re-runs OCR, classification, extraction and summarisation on the stored
 * file. Useful after a document was uploaded while analysis failed, or after
 * an OCR language pack or API key has been added.
 */
export async function POST(request: NextRequest, context: Context) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    const { id } = await context.params;

    const outcome = await reprocessDocument(id, user.id);
    return apiOk({ document: toDocumentDetail(outcome.document), warnings: outcome.warnings });
  } catch (error) {
    return handleApiError(error);
  }
}
