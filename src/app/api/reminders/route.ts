import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiOk, handleApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { requireApiUser } from "@/lib/session";
import { countUntrackedExpiries, getExpiringDocuments } from "@/lib/services/documents";
import { toDocumentSummary } from "@/lib/serializers";

export const runtime = "nodejs";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

/**
 * Expiry reminders: everything already expired plus everything expiring inside
 * the warning window. Split into two lists so the UI can show "needs action
 * now" separately from "coming up".
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();

    const parsed = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return apiError("Invalid reminder window", 422, parsed.error.flatten().fieldErrors);
    }

    const warningDays = parsed.data.days ?? env().EXPIRY_WARNING_DAYS;
    const rows = await getExpiringDocuments(user.id, warningDays);
    const items = rows.map(toDocumentSummary);

    return apiOk({
      warningDays,
      expired: items.filter((d) => d.isExpired),
      upcoming: items.filter((d) => !d.isExpired),
      // Documents the user has explicitly marked as never expiring, so the
      // reminders page can explain why a lifelong document is absent.
      untracked: await countUntrackedExpiries(user.id),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
