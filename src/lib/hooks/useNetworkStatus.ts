// src/lib/hooks/useNetworkStatus.ts

import { useEffect, useSyncExternalStore } from "react";
import { networkMonitor } from "@/lib/offline/networkMonitor";

// Stable selector functions - defined outside the component so they never
// change identity, preventing useSyncExternalStore from re-subscribing.
const subscribe = (cb: () => void) => networkMonitor.subscribe(cb);
const getOnline = () => networkMonitor.online;
const getDeviceOnline = () => networkMonitor.deviceOnline;
const getBackendReachable = () => networkMonitor.backendReachable;
const ssrOnline = () => true;
const ssrOffline = () => false;

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
  useEffect(() => {
    networkMonitor.start();
  }, []);

  const online = useSyncExternalStore(subscribe, getOnline, ssrOnline);
  const deviceOnline = useSyncExternalStore(subscribe, getDeviceOnline, ssrOnline);
  const backendReachable = useSyncExternalStore(subscribe, getBackendReachable, ssrOffline);

  return { online, deviceOnline, backendReachable };
}
