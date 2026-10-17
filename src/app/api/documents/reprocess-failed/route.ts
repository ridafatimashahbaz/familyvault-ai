import type { NextRequest } from "next/server";

import { apiError, apiOk, handleApiError } from "@/lib/api";
import { hasValidOrigin } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/session";
import { listFailedDocumentIds, reprocessDocument } from "@/lib/services/documents";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Re-runs processing for a batch of failed documents. Documents are handled
 * oldest-first and the batch is capped, so pressing the button a few times
 * clears a backlog without one request running past its time limit. A document
 * that fails again simply stays failed.
 */
export async function POST(request: NextRequest) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    const ids = await listFailedDocumentIds(user.id);

    let succeeded = 0;
    for (const id of ids) {
      try {
        await reprocessDocument(id, user.id);
        succeeded += 1;
      } catch {
        // Left failed on purpose; the reason is stored on the document.
      }
    }

    return apiOk({ attempted: ids.length, succeeded, failed: ids.length - succeeded });
  } catch (error) {
    return handleApiError(error);
  }
}
