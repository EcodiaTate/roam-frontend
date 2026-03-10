// src/components/auth/SyncBootstrap.tsx
"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/supabase/auth";
import { networkMonitor } from "@/lib/offline/networkMonitor";
import { planSync } from "@/lib/offline/planSync";

/**
 * Invisible component mounted at the root layout level.
 *
 * Responsibilities:
 *   1. Start NetworkMonitor on mount (always, regardless of auth).
 *   2. Start PlanSync when user is authenticated.
 *   3. Stop PlanSync on sign-out.
 *
 * Renders nothing.
 */
export function SyncBootstrap() {
  const { user, loading } = useAuth();

  // Start network monitor once
  useEffect(() => {
    networkMonitor.start();
    return () => networkMonitor.stop();
  }, []);

  // Start/stop plan sync based on auth state
  useEffect(() => {
    if (loading) return;

    if (user?.id) {
      planSync.start(user.id);
    } else {
      planSync.stop();
    }

    return () => planSync.stop();
  }, [user?.id, loading]);

  return null;
}