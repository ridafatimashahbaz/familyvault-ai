import type { NextRequest } from "next/server";

import { handleApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { getDocumentsWithExpiry } from "@/lib/services/documents";
import { toDocumentSummary } from "@/lib/serializers";
import { icsForEvents, toCalendarEvent, type CalendarEvent } from "@/lib/calendar";

export const runtime = "nodejs";

/**
 * A downloadable .ics of every tracked expiry. Download rather than a
 * subscribed feed: a subscription URL cannot authenticate to a session route,
 * so this is fetched with the browser's own session and saved locally.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser();

    const rows = await getDocumentsWithExpiry(user.id);
    const events = rows
      .map((row) => toCalendarEvent(toDocumentSummary(row)))
      .filter((event): event is CalendarEvent => event !== null);

    const body = icsForEvents(events, {
      baseUrl: request.nextUrl.origin,
      calendarName: "FamilyVault expiries",
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="familyvault-expiries.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
