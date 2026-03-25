// src/components/auth/SyncBootstrap.tsx

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/supabase/auth";
import { networkMonitor } from "@/lib/offline/networkMonitor";
import { planSync } from "@/lib/offline/planSync";
import { presenceBeacon } from "@/lib/offline/presenceBeacon";
import { syncMemoriesToCloud } from "@/lib/offline/memoriesStore";
import { syncSavedPlacesToCloud } from "@/lib/offline/savedPlacesSync";
import { emergencySyncOnce } from "@/lib/offline/emergencySync";

/**
 * Invisible component mounted at the root layout level.
 *
 * Responsibilities:
 *   1. Start NetworkMonitor on mount (always, regardless of auth).
 *   2. Start PlanSync when user is authenticated.
 *   3. Start PresenceBeacon when user is authenticated (dead-reckoning pings).
 *   4. Sync dirty memories to cloud on auth + reconnect.
 *   5. Sync saved places to cloud on auth + reconnect.
 *   6. Sync emergency contacts to cloud on auth + reconnect.
 *   7. Stop PlanSync + PresenceBeacon on sign-out.
 *
 * Renders nothing.
 */
export function SyncBootstrap() {
  const { user, loading } = useAuth();
  const networkUnsubRef = useRef<(() => void) | null>(null);

  // Start network monitor once
  useEffect(() => {
    networkMonitor.start();
    return () => networkMonitor.stop();
  }, []);

  // Start/stop plan sync + presence beacon based on auth state
  // Also set up memory + saved places sync on reconnect
  useEffect(() => {
    if (loading) return;

    if (user?.id) {
      planSync.start(user.id);
      presenceBeacon.start();

      // Initial sync of dirty memories + saved places + emergency contacts
      syncMemoriesToCloud().catch(() => {});
      syncSavedPlacesToCloud().catch(() => {});
      emergencySyncOnce(user).catch(() => {});

      // Re-sync whenever network comes back
      networkUnsubRef.current = networkMonitor.subscribe((isOnline) => {
        if (isOnline) {
          syncMemoriesToCloud().catch(() => {});
          syncSavedPlacesToCloud().catch(() => {});
          emergencySyncOnce(user).catch(() => {});
        }
      });
    } else {
      planSync.stop();
      presenceBeacon.stop();
      networkUnsubRef.current?.();
      networkUnsubRef.current = null;
    }

    return () => {
      planSync.stop();
      presenceBeacon.stop();
      networkUnsubRef.current?.();
      networkUnsubRef.current = null;
    };
  }, [user?.id, loading]);

  return null;
}