// src/lib/hooks/useNetworkStatus.ts
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { networkMonitor } from "@/lib/offline/networkMonitor";

/**
 * React hook that reactively tracks online/offline state.
 *
 * Returns `{ online, deviceOnline, backendReachable }`.
 *   - `online` = device has network AND backend is reachable
 *   - `deviceOnline` = device has any connectivity at all
 *   - `backendReachable` = Roam API responded to /health
 *
 * Starts the network monitor on first mount (idempotent).
 */
export function useNetworkStatus() {
  // Ensure the monitor is running (idempotent — safe to call many times)
  useEffect(() => {
    networkMonitor.start();
  }, []);

  // Subscribe to the singleton's changes via useSyncExternalStore
  // so React re-renders on transitions.
  const online = useSyncExternalStore(
    (cb) => networkMonitor.subscribe(cb),
    () => networkMonitor.online,
    () => true, // SSR snapshot: assume online
  );

  const deviceOnline = useSyncExternalStore(
    (cb) => networkMonitor.subscribe(cb),
    () => networkMonitor.deviceOnline,
    () => true,
  );

  const backendReachable = useSyncExternalStore(
    (cb) => networkMonitor.subscribe(cb),
    () => networkMonitor.backendReachable,
    () => false,
  );

  return { online, deviceOnline, backendReachable };
}
