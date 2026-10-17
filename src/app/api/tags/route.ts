import { apiOk, handleApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { listTags } from "@/lib/services/documents";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    return apiOk(await listTags(user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
