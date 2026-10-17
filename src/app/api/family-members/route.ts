import type { NextRequest } from "next/server";

import { apiError, apiOk, handleApiError, readJson } from "@/lib/api";
import { hasValidOrigin } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/session";
import { createFamilyMember, listFamilyMembers } from "@/lib/services/family-members";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();
    const includeArchived = request.nextUrl.searchParams.get("archived") === "1";

    return apiOk(await listFamilyMembers(user.id, { includeArchived }));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    const body = await readJson<unknown>(request);

    return apiOk(await createFamilyMember(user.id, body), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
