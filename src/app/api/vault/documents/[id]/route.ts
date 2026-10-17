import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiOk, handleApiError, parseJsonBody } from "@/lib/api";
import { clientIp, hasValidOrigin, rateLimit } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/session";
import {
  deleteVaultDocument,
  readVaultDocument,
  vaultMaxBodyBytes,
  writeVaultDocument,
} from "@/lib/services/vault-documents";

export const runtime = "nodejs";

/**
 * One private document (Phase 1, Day 2 Stage C).
 *
 * The whole object is ciphertext produced in the browser: `content` under a
 * per-document key, that key wrapped under the vault key, and the document's
 * metadata encrypted too. The server routes it, stores it and hands it back
 * without ever holding a key that opens it, and it does not run OCR, an AI
 * summary or a preview over these bytes — there is nothing to run them on.
 *
 * Guards, in order: same-origin → session identity → rate limit → bounded body
 * → storage. The `id` in the path is *not* authority: it is pattern-checked and
 * resolved inside the caller's own directory, so another account's object cannot
 * be named even by guessing its id.
 */

type Context = { params: Promise<{ id: string }> };

const RATE_WINDOW_MS = 15 * 60_000;
const WRITE_LIMIT_PER_USER = 30;
const WRITE_LIMIT_PER_IP = 60;
const READ_LIMIT_PER_USER = 120;
const READ_LIMIT_PER_IP = 300;

const bodySchema = z.object({ record: z.unknown() }).strict();

export async function GET(request: NextRequest, context: Context) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    if (!rateLimit(`vault-document:user:${user.id}`, READ_LIMIT_PER_USER, RATE_WINDOW_MS).ok) {
      return apiError("Too many requests. Please wait and try again.", 429);
    }
    if (!rateLimit(`vault-document:ip:${clientIp(request)}`, READ_LIMIT_PER_IP, RATE_WINDOW_MS).ok) {
      return apiError("Too many requests. Please wait and try again.", 429);
    }

    const { id } = await context.params;
    return apiOk({ record: await readVaultDocument(user.id, id) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Creates or replaces one encrypted object in the caller's own store. */
export async function PUT(request: NextRequest, context: Context) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    if (!rateLimit(`vault-document-write:user:${user.id}`, WRITE_LIMIT_PER_USER, RATE_WINDOW_MS).ok) {
      return apiError("Too many private document saves. Please wait and try again.", 429);
    }
    if (!rateLimit(`vault-document-write:ip:${clientIp(request)}`, WRITE_LIMIT_PER_IP, RATE_WINDOW_MS).ok) {
      return apiError("Too many private document saves. Please wait and try again.", 429);
    }

    const { id } = await context.params;
    const body = await parseJsonBody(request, bodySchema, vaultMaxBodyBytes());
    const stored = await writeVaultDocument(user.id, body.record, id);

    return apiOk(stored);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    if (!rateLimit(`vault-document-write:user:${user.id}`, WRITE_LIMIT_PER_USER, RATE_WINDOW_MS).ok) {
      return apiError("Too many private document changes. Please wait and try again.", 429);
    }

    const { id } = await context.params;
    await deleteVaultDocument(user.id, id);
    return apiOk({ deleted: id });
  } catch (error) {
    return handleApiError(error);
  }
}
