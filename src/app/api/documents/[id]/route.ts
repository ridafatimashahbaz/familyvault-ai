import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiRequestError, apiError, apiOk, handleApiError, parseJsonBody } from "@/lib/api";
import { DOC_TYPE_MAP, MAX_TEXT_EDIT_CHARS } from "@/lib/constants";
import { hasValidOrigin } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/session";
import { deleteDocument, getDocumentForUser, updateDocument } from "@/lib/services/documents";
import { toDocumentDetail } from "@/lib/serializers";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** Absent means "leave unchanged"; null or "" means "clear this date". */
const optionalDate = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value, ctx): Date | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date" });
      return undefined;
    }
    return date;
  });

const patchSchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(200).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  docType: z.string().trim().optional(),
  familyMemberId: z.string().trim().nullable().optional(),
  issueDate: optionalDate,
  expiryDate: optionalDate,
  noExpiry: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  text: z
    .string()
    .max(MAX_TEXT_EDIT_CHARS, `The extracted text must be under ${MAX_TEXT_EDIT_CHARS.toLocaleString()} characters`)
    .optional(),
  dateReview: z
    .object({
      key: z.string().min(3).max(120),
      action: z.enum(["confirmed", "ignored", "expiry"]),
      iso: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date as YYYY-MM-DD")
        .optional(),
    })
    .optional(),
});

export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;

    return apiOk(toDocumentDetail(await getDocumentForUser(id, user.id)));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    const { id } = await context.params;
    // A JSON-escaped transcription is several times its character count, so the
    // byte ceiling is looser than MAX_TEXT_EDIT_CHARS; Zod still enforces the
    // real limit and the service re-checks it.
    const body = await parseJsonBody(request, patchSchema, MAX_TEXT_EDIT_CHARS * 6 + 4096);

    if (body.docType && !DOC_TYPE_MAP[body.docType]) {
      throw new ApiRequestError(422, `"${body.docType}" is not a known document type`);
    }

    const updated = await updateDocument(id, user.id, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.docType !== undefined ? { docType: body.docType } : {}),
      ...(body.familyMemberId !== undefined ? { familyMemberId: body.familyMemberId } : {}),
      ...(body.issueDate !== undefined ? { issueDate: body.issueDate } : {}),
      ...(body.expiryDate !== undefined ? { expiryDate: body.expiryDate } : {}),
      ...(body.noExpiry !== undefined ? { noExpiry: body.noExpiry } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.text !== undefined ? { text: body.text } : {}),
      ...(body.dateReview !== undefined ? { dateReview: body.dateReview } : {}),
    });

    return apiOk(toDocumentDetail(updated));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    const { id } = await context.params;

    await deleteDocument(id, user.id);
    return apiOk({ deleted: id });
  } catch (error) {
    return handleApiError(error);
  }
}
