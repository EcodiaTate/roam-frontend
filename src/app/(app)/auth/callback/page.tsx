// src/app/auth/callback/page.tsx

import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase/client";

/**
 * OAuth redirect landing page.
 *
 * Runs in two contexts:
 *
 * A) Inside in-app browser (SFSafariViewController / Chrome Custom Tab):
 *    Capacitor.isNativePlatform() returns false because the browser is a
 *    separate process. We redirect to the au.ecodia.roam:// custom scheme
 *    so the OS hands the URL back to the app via appUrlOpen, which closes
 *    the in-app browser and navigates the main WebView here (context B).
 *
 * B) Main WebView (web or after deep-link handoff from A):
 *    Capacitor is present (native) or we're on web. Supabase exchanges the
 *    code via detectSessionInUrl, onAuthStateChange fires → /trip.
 */
export default function AuthCallbackPage() {
  const router = useNavigate();

  useEffect(() => {
    const params = window.location.search || window.location.hash;

    // If we're NOT inside the Capacitor WebView and we have OAuth params,
    // we're in the in-app browser - redirect to the custom scheme so the
    // OS routes us back to the app.
    if (!Capacitor.isNativePlatform() && params) {
      window.location.href =
        "au.ecodia.roam://auth/callback" +
        window.location.search +
        window.location.hash;
      return;
    }

    // Main WebView (native or web): exchange code → session → navigate
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        closeBrowserAndNavigate();
      }
    });

    // Session may already be established by the time we mount
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) closeBrowserAndNavigate();
    });

    function closeBrowserAndNavigate() {
      // On native, close the in-app browser if it's still open
      if (Capacitor.isNativePlatform()) {
        import("@capacitor/browser")
          .then(({ Browser }) => Browser.close())
          .catch(() => {});
      }
      router("/trip", { replace: true });
    }

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
