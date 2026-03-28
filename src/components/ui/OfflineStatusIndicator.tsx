// src/components/ui/OfflineStatusIndicator.tsx

import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";

/**
 * Persistent global offline status indicator.
 *
 * Always visible in the header - never dismissable.
 * Three states:
 *   - Online: hidden (show nothing)
 *   - Degraded (Solar Amber dot + "No server") - device online but backend unreachable
 *   - Offline (Emergency Red pulsing dot + "OFFLINE MODE" + optional region/version subtitle)
 */
export function OfflineStatusIndicator({
  offlineRegion,
  offlineVersion,
}: {
  /** e.g. "NT Region" */
  offlineRegion?: string;
  /** e.g. "v24.2" */
  offlineVersion?: string;
}) {
  const { deviceOnline, backendReachable } = useNetworkStatus();

  // Online - show nothing
  if (deviceOnline && backendReachable) return null;

  let stateClass: string;
  let label: string;

  if (!deviceOnline) {
    stateClass = "terra-offline-indicator--offline";
    label = "Offline Mode";
  } else {
    stateClass = "terra-offline-indicator--degraded";
    label = "No Server";
  }

  const hasSubtitle = !deviceOnline && (offlineRegion || offlineVersion);
  const subtitle = hasSubtitle
    ? [offlineRegion, offlineVersion].filter(Boolean).join(" ")
    : null;

  return (
    <span
      className={`terra-offline-indicator-enhanced ${stateClass}`}
      role="status"
      aria-live="polite"
      aria-label={`Network status: ${label}${subtitle ? `, ${subtitle}` : ""}`}
    >
      <span className="terra-offline-dot" aria-hidden="true" />
      <span className="terra-offline-content">
        <span className="terra-offline-label">{label}</span>
        {subtitle && (
          <span className="terra-offline-subtitle">{subtitle}</span>
        )}
      </span>
    </span>
  );
}
