import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiRequestError, apiError, apiOk, handleApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { hasValidOrigin } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/session";
import { maxUploadBytes } from "@/lib/security/upload";
import { listDocuments, uploadDocument } from "@/lib/services/documents";
import { toDocumentSummary } from "@/lib/serializers";

export const runtime = "nodejs";
// OCR of a full-page scan can take tens of seconds; do not let a platform
// default cut the upload off mid-analysis.
export const maxDuration = 60;

const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().optional(),
  docType: z.string().trim().optional(),
  member: z.string().trim().optional(),
  status: z.string().trim().optional(),
  expiry: z.enum(["expired", "expiring", "valid", "none", "tracked"]).optional(),
  sort: z.enum(["newest", "oldest", "name", "expiry", "size"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  page: z.coerce.number().int().min(1).default(1),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();

    const parsed = listQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return apiError("Invalid filters", 422, parsed.error.flatten().fieldErrors);
    }

    const { page, limit, member, q, ...filters } = parsed.data;
    const result = await listDocuments({
      userId: user.id,
      query: q,
      familyMemberId: member,
      ...filters,
      limit,
      offset: (page - 1) * limit,
    });

    return apiOk({
      items: result.items.map(toDocumentSummary),
      total: result.total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(result.total / limit)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();

    const form = await request.formData().catch(() => null);
    if (!form) throw new ApiRequestError(400, "Expected a multipart form upload");

    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiRequestError(422, "Choose a file to upload");
    if (file.size === 0) throw new ApiRequestError(422, "That file is empty");
    if (file.size > maxUploadBytes()) {
      throw new ApiRequestError(413, `Files must be ${env().MAX_UPLOAD_MB} MB or smaller`);
    }

    const outcome = await uploadDocument({
      userId: user.id,
      filename: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      familyMemberId: textOrNull(form.get("familyMemberId")),
      title: textOrNull(form.get("title")),
      notes: textOrNull(form.get("notes")),
      tags: readTags(form),
    });

    return apiOk({ document: toDocumentSummary(outcome.document), warnings: outcome.warnings }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

function textOrNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Accepts repeated `tags` fields and a single comma-separated one. */
function readTags(form: FormData): string[] {
  const raw = form
    .getAll("tags")
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []));

  return [...new Set(raw.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}
