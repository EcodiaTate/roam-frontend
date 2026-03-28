// src/components/ui/OfflineStatusIndicator.tsx

import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";

/**
 * Persistent global offline status indicator.
 *
 * Always visible in the header — never dismissable.
 * Three states:
 *   - Online (Potable Green dot + "Connected")
 *   - Degraded (Solar Amber dot + "No server") — device online but backend unreachable
 *   - Offline (Emergency Red pulsing dot + "Offline")
 */
export function OfflineStatusIndicator() {
  const { online, deviceOnline, backendReachable } = useNetworkStatus();

  let stateClass: string;
  let label: string;

  if (!deviceOnline) {
    stateClass = "terra-offline-indicator--offline";
    label = "Offline";
  } else if (!backendReachable) {
    stateClass = "terra-offline-indicator--degraded";
    label = "No server";
  } else {
    stateClass = "terra-offline-indicator--online";
    label = "Connected";
  }

  return (
    <span
      className={`terra-offline-indicator ${stateClass}`}
      role="status"
      aria-live="polite"
      aria-label={`Network status: ${label}`}
    >
      <span className="terra-offline-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
