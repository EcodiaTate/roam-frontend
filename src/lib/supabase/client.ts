// src/lib/supabase/client.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!SUPA_URL || !SUPA_ANON) {
  console.warn(
    "[Roam] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. " +
      "Auth and sync will not work.",
  );
}

/**
 * Single Supabase client for the entire frontend.
 *
 * Uses localStorage for session persistence (works in both browser and
 * Capacitor WebView). The `autoRefreshToken` + `persistSession` defaults
 * handle token rotation automatically.
 */
export const supabase: SupabaseClient = createClient(SUPA_URL, SUPA_ANON, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // needed for OAuth redirect flow
  },
});