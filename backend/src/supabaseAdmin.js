import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  // We don't throw here — the server should still boot so the rest of the
  // app (landing page, health check) works, and every route that needs
  // Supabase will fail with a clear 500 message instead of a silent crash.
  console.warn(
    "[supabaseAdmin] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. " +
      "Database/storage routes will return errors until this is configured."
  );
}

// Service-role client: used ONLY on the backend. Every query below is
// manually scoped with `.eq("user_id", req.userId)` because the service
// role bypasses Row Level Security — this file must never be imported
// into frontend code.
export const supabaseAdmin =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export const isSupabaseConfigured = () => Boolean(supabaseAdmin);
