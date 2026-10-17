import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiOk, handleApiError, parseJsonBody } from "@/lib/api";
import { clientIp, hasValidOrigin, rateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/session";
import { getVaultMaterial, putVaultMaterial } from "@/lib/services/vault";

export const runtime = "nodejs";

/**
 * Vault-material API (Day 1, Phase 1).
 *
 * A single, per-user resource: the wrapped key material for the browser-side
 * end-to-end vault. Two things make this safe:
 *
 *  - Identity comes only from the session (`requireApiUser`); the client can
 *    never name the user whose material is read or written.
 *  - The body carries *wrapped* blobs only. The service validates the exact
 *    vault shape and rejects anything else, so no raw key ever reaches the
 *    database. Responses likewise contain only wrapped material.
 *
 * The wrapping format is fixed-size (48-byte ciphertexts), so an 8 KiB body
 * cap is enforced while it is read — an oversized body is rejected with 413
 * before it is parsed or buffered.
 *
 * This route does not touch the existing document workflow and is not yet
 * wired into any UI.
 */

// Well above a legitimate material payload (~1 KiB) with room to spare.
const MAX_BODY_BYTES = 8 * 1024;
const RATE_WINDOW_MS = 15 * 60_000;
const RATE_LIMIT_PER_USER = 30;
const RATE_LIMIT_PER_IP = 60;

const bodySchema = z.object({ material: z.unknown() }).strict();

/** Returns the caller's vault material, or `{ material: null }` if none exists. */
export async function GET() {
  try {
    const user = await requireApiUser();
    const material = await getVaultMaterial(user.id);
    return apiOk({ material });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Creates or replaces the caller's vault material. */
export async function PUT(request: NextRequest) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();

    // Per-user cap (identity from the session only) plus a coarser network-level
    // safeguard. Both run before the body is read or anything is written.
    if (!rateLimit(`vault-material:user:${user.id}`, RATE_LIMIT_PER_USER, RATE_WINDOW_MS).ok) {
      return apiError("Too many vault updates. Please wait and try again.", 429);
    }
    if (!rateLimit(`vault-material:ip:${clientIp(request)}`, RATE_LIMIT_PER_IP, RATE_WINDOW_MS).ok) {
      return apiError("Too many vault updates. Please wait and try again.", 429);
    }

    const body = await parseJsonBody(request, bodySchema, MAX_BODY_BYTES);
    const material = await putVaultMaterial(user.id, body.material);

    return apiOk({ material });
  } catch (error) {
    return handleApiError(error);
  }
}
