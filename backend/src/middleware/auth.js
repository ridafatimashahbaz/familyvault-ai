import { supabaseAdmin, isSupabaseConfigured } from "../supabaseAdmin.js";

/**
 * Verifies the Supabase access token sent by the frontend in
 * `Authorization: Bearer <token>` and attaches req.userId.
 * Every protected route relies on this — no route trusts a user id
 * coming from the request body/query.
 */
export async function requireAuth(req, res, next) {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(503).json({
        error: "Server is not configured. Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.",
      });
    }

    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing or invalid Authorization header." });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Session expired or invalid. Please log in again." });
    }

    req.userId = data.user.id;
    req.userEmail = data.user.email;
    next();
  } catch (err) {
    console.error("[requireAuth] unexpected error:", err);
    res.status(500).json({ error: "Authentication check failed unexpectedly." });
  }
}
