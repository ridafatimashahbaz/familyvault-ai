import type { NextRequest } from "next/server";

import { apiError, apiOk, handleApiError, parseJsonBody } from "@/lib/api";
import { hasValidOrigin } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/session";
import { changePassword, changePasswordSchema } from "@/lib/services/users";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    const body = await parseJsonBody(request, changePasswordSchema);

    await changePassword(user.id, body);
    return apiOk({ changed: true });
  } catch (error) {
    return handleApiError(error);
  }
}
