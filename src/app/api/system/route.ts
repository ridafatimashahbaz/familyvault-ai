import { apiOk, handleApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { publicSystemInfo } from "@/lib/system-info";

export const runtime = "nodejs";

/**
 * Safe, non-technical instance info the interface may read: app name, upload /
 * expiry limits and the document taxonomy.
 *
 * Deliberately narrow. Encryption mode, OCR/AI engine state, storage paths,
 * MIME allowlists and secret checks used to be returned here; they are
 * operational details an end user must never see, so they no longer leave the
 * server. Requires a signed-in user.
 */
export async function GET() {
  try {
    await requireApiUser();
    return apiOk(publicSystemInfo());
  } catch (error) {
    return handleApiError(error);
  }
}
