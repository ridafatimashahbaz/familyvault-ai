import { apiOk, handleApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { getDashboardStats } from "@/lib/services/documents";
import { toDocumentSummary } from "@/lib/serializers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    const stats = await getDashboardStats(user.id);

    return apiOk({ ...stats, recent: stats.recent.map(toDocumentSummary) });
  } catch (error) {
    return handleApiError(error);
  }
}
