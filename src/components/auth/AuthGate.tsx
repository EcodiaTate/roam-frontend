// src/components/auth/AuthGate.tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth";
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";

/**
 * Wrap any page/section that requires authentication.
 *
 * While loading the initial session, shows a spinner.
 * If no session after load and device is offline, shows an offline screen
 * (can't redirect to login - sign-in requires network).
 * If no session and online, redirects to /login.
 * Otherwise renders children.
 *
 * NOTE: Offline use still works because the Supabase session JWT is
 * persisted in localStorage. As long as the user signed in at least
 * once, AuthGate will pass them through even without network.
 * The JWT may be expired, but we don't block on that - the sync
 * layer handles token refresh when connectivity returns.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();
  const { deviceOnline } = useNetworkStatus();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session && deviceOnline) {
      router.replace("/login");
    }
  }, [loading, session, deviceOnline, router]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--roam-bg, #0a0a0a)" }}>
        <div style={{ color: "var(--roam-muted, #888)", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  // No session + offline: can't sign in, show a friendly waiting screen
  if (!session && !deviceOnline) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--roam-bg, #0a0a0a)",
          padding: "0 32px",
          gap: 16,
          textAlign: "center",
        }}
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--roam-muted, #888)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--roam-text, #f0ece4)" }}>
          No connection
        </div>
        <div style={{ fontSize: 14, color: "var(--roam-muted, #888)", lineHeight: 1.5, maxWidth: 260 }}>
          Sign in requires internet. Once you&apos;ve signed in once, Roam works fully offline.
        </div>
      </div>
    );
  }

  if (!session) return null; // online, will redirect to /login

  return <>{children}</>;
}
