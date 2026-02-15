// src/components/auth/AuthGate.tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth";

/**
 * Wrap any page/section that requires authentication.
 *
 * While loading the initial session, shows a spinner.
 * If no session after load, redirects to /login.
 * Otherwise renders children.
 *
 * Usage:
 *   <AuthGate>
 *     <TripPage />
 *   </AuthGate>
 *
 * NOTE: Offline use still works because the Supabase session JWT is
 * persisted in localStorage. As long as the user signed in at least
 * once, AuthGate will pass them through even without network.
 * The JWT may be expired, but we don't block on that — the sync
 * layer handles token refresh when connectivity returns.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login");
    }
  }, [loading, session, router]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: "var(--roam-muted, #888)", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (!session) return null; // will redirect

  return <>{children}</>;
}