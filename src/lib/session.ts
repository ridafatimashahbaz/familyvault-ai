import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ApiRequestError } from "@/lib/api";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

/** Returns the signed-in user, or null. Safe to call from pages and routes. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  return {
    id,
    email: session?.user?.email ?? "",
    name: session?.user?.name ?? "",
  };
}

/**
 * Gate for server components and layouts. Every protected route calls this,
 * which is what keeps unauthenticated requests out - there is no edge
 * middleware in this app.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Gate for route handlers; throws a 401 instead of redirecting. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiRequestError(401, "You must be signed in");
  return user;
}
