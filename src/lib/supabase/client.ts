// src/lib/supabase/client.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Provide validly-shaped dummy strings so the Next.js build step doesn't crash
// when pre-rendering pages (Supabase throws an error on empty strings).
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://build-dummy.supabase.co";
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key-for-build";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn(
    "[Roam] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. " +
      "Auth and sync will not work. (Using dummy values to allow build to pass).",
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