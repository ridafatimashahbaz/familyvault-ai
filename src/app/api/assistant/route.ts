import type { NextRequest } from "next/server";

import { apiError, apiOk, handleApiError, parseJsonBody } from "@/lib/api";
import { hasValidOrigin } from "@/lib/rate-limit";
import { requireApiUser } from "@/lib/session";
import { askSchema, askAssistant, clearAssistantHistory, listAssistantHistory } from "@/lib/services/assistant";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const user = await requireApiUser();
    return apiOk(await listAssistantHistory(user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    const { question } = await parseJsonBody(request, askSchema);

    return apiOk(await askAssistant(user.id, question));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!hasValidOrigin(request)) return apiError("Cross-origin request blocked", 403);

    const user = await requireApiUser();
    await clearAssistantHistory(user.id);

    return apiOk({ cleared: true });
  } catch (error) {
    return handleApiError(error);
  }
}
