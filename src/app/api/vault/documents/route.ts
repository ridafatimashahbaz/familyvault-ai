import { apiError, apiOk, handleApiError } from "@/lib/api";
import { clientIp, hasValidOrigin, rateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/session";
import { listVaultDocuments } from "@/lib/services/vault-documents";

export const runtime = "nodejs";

/**
 * Private-document inventory (Phase 1, Day 2 Stage C).
 *
 * Lists the caller's encrypted objects — opaque ids, byte sizes and write times
 * and nothing else. This is the structural half of the contract the browser
 * needs in order to fetch and decrypt documents on a new device; the server
 * cannot derive a file name, a title or a document type from it because it never
 * stored one.
 *
 * Read-only and session-scoped: identity comes from `requireApiUser`, never from
 * the query string. Writes live on `/api/vault/documents/[id]`.
 */
const RATE_WINDOW_MS = 15 * 60_000;
const RATE_LIMIT_PER_USER = 120;
const RATE_LIMIT_PER_IP = 300;

export async function GET(request: Request) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();

    // Listing walks the filesystem, so it is rate-limited like the writes are.
    if (!rateLimit(`vault-documents-list:user:${user.id}`, RATE_LIMIT_PER_USER, RATE_WINDOW_MS).ok) {
      return apiError("Too many requests. Please wait and try again.", 429);
    }
    if (!rateLimit(`vault-documents-list:ip:${clientIp(request)}`, RATE_LIMIT_PER_IP, RATE_WINDOW_MS).ok) {
      return apiError("Too many requests. Please wait and try again.", 429);
    }

    return apiOk({ items: await listVaultDocuments(user.id) });
  } catch (error) {
    return handleApiError(error);
  }
}
