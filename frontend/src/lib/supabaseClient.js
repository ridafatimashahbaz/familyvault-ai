import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // Never throw at import time — the app should still render the landing
  // page and a clear "not configured" message instead of a blank screen.
  console.warn(
    "[supabaseClient] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. " +
      "Copy frontend/.env.example to frontend/.env and fill them in."
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null;
