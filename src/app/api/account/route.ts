import type { NextRequest } from "next/server";

import { apiError, apiOk, handleApiError, parseJsonBody } from "@/lib/api";
import { hasValidOrigin } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/session";
import { getProfile, updateProfile, updateProfileSchema } from "@/lib/services/users";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    return apiOk(await getProfile(user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    const body = await parseJsonBody(request, updateProfileSchema);

    return apiOk(await updateProfile(user.id, body));
  } catch (error) {
    return handleApiError(error);
  }
}
