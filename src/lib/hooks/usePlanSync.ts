// src/lib/hooks/usePlanSync.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { planSync } from "@/lib/offline/planSync";
import { getPendingCount } from "@/lib/offline/syncQueue";
import { networkMonitor } from "@/lib/offline/networkMonitor";

/**
 * Hook for components that need to interact with the sync system.
 *
 * Provides:
 *   - online: current network status
 *   - pendingCount: number of queued sync ops
 *   - syncing: true while drain is in progress
 *   - forceDrain: manually trigger a queue drain
 *   - createInvite: create an invite code for a plan
 *   - redeemInvite: redeem an invite code
 */
export function usePlanSync() {
  const [online, setOnline] = useState(networkMonitor.online);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Subscribe to network changes
  useEffect(() => {
    const unsub = networkMonitor.subscribe((isOnline) => setOnline(isOnline));
    return unsub;
  }, []);

  // Subscribe to sync events + refresh pending count
  useEffect(() => {
    const refreshCount = () => {
      getPendingCount().then(setPendingCount).catch(() => {});
    };

    refreshCount();

    const unsub = planSync.subscribe((event) => {
      if (event === "drain_start") setSyncing(true);
      if (event === "drain_end" || event === "error") {
        setSyncing(false);
        refreshCount();
      }
      if (event === "pull_complete") refreshCount();
    });

    // Also refresh count periodically when online
    const interval = setInterval(refreshCount, 10_000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const forceDrain = useCallback(async () => {
    await planSync.drainQueue();
  }, []);

  const createInvite = useCallback(async (planId: string) => {
    return planSync.createInviteCode(planId);
  }, []);

  const redeemInvite = useCallback(async (code: string) => {
    return planSync.redeemInviteCode(code);
  }, []);

  return {
    online,
    syncing,
    pendingCount,
    forceDrain,
    createInvite,
    redeemInvite,
  };
}