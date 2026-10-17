import type { NextRequest } from "next/server";

import { apiError, apiOk, handleApiError } from "@/lib/api";
import { clientIp, hasValidOrigin } from "@/lib/rate-limit";
import { registerSchema, registerUser } from "@/lib/services/users";

export async function POST(request: NextRequest) {
  try {
    if (!hasValidOrigin(request)) {
      return apiError("Cross-origin request blocked", 403);
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(
        "Please fix the highlighted fields",
        422,
        parsed.error.flatten().fieldErrors,
      );
    }

    const user = await registerUser(parsed.data, clientIp(request));
    return apiOk(user, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
