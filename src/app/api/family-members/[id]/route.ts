import type { NextRequest } from "next/server";

import { apiError, apiOk, handleApiError, readJson } from "@/lib/api";
import { hasValidOrigin } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/session";
import { deleteFamilyMember, updateFamilyMember } from "@/lib/services/family-members";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    const { id } = await context.params;
    const body = await readJson<unknown>(request);

    return apiOk(await updateFamilyMember(id, user.id, body));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Removes a profile. The schema sets documents.familyMemberId to null on
 * delete, so the documents themselves are kept and simply become unfiled.
 */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    const { id } = await context.params;

    await deleteFamilyMember(id, user.id);
    return apiOk({ deleted: id });
  } catch (error) {
    return handleApiError(error);
  }
}
