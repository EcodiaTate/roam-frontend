// src/app/auth/callback/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * OAuth redirect landing page.
 *
 * After Google OAuth completes, Supabase redirects here with a code/token
 * in the URL hash. The Supabase client automatically exchanges it for a
 * session (because detectSessionInUrl: true). We just wait for the session
 * to appear, then redirect to /trip.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        router.replace("/trip");
      }
    });

    // Fallback: if session already exists (fast redirect), go immediately
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/trip");
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Signing you in…</div>
        <div style={{ color: "var(--roam-muted, #888)" }}>Please wait</div>
      </div>
    </div>
  );
}