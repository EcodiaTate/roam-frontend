// src/app/auth/callback/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * OAuth redirect landing page.
 *
 * Runs in two contexts:
 *
 * A) Inside SFSafariViewController (native Google OAuth sheet):
 *    window.Capacitor is absent. We immediately forward the full URL to the
 *    custom scheme - iOS intercepts it, closes the sheet, fires appUrlOpen
 *    in the main WebView, NativeBootstrap navigates back here with the code.
 *
 * B) Main WebView (web or after deep-link handoff from A):
 *    window.Capacitor is present (or we're on web). Supabase exchanges the
 *    code via detectSessionInUrl, onAuthStateChange fires → /trip.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // If Capacitor is absent we're inside the SFSafariViewController sheet.
    // Forward to the custom scheme so iOS closes the sheet and hands the
    // code to the main WebView via appUrlOpen.
    const hasCapacitor = !!(window as any).Capacitor;
    if (!hasCapacitor && (window.location.search || window.location.hash)) {
      window.location.href =
        "au.ecodia.roam://auth/callback" +
        window.location.search +
        window.location.hash;
      return;
    }

    // Main WebView: exchange code → session → navigate
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        router.replace("/trip");
      }
    });

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
