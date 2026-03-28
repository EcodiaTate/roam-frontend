// src/lib/hooks/useStopProximity.ts

import { useCallback, useEffect, useRef } from "react";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { TripStop } from "@/lib/types/trip";
import { roamNotify } from "@/lib/native/notifications";
import { haptic } from "@/lib/native/haptics";

/** Radius in meters - triggers notification when user is within this distance */
const PROXIMITY_RADIUS_M = 150;

/** Minimum ms between notifications for the same stop (prevent spam) */
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Haversine distance in meters between two lat/lng points.
 */
function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type ProximityEvent = {
  stop: TripStop;
  stopIndex: number;
  distance: number;
};

/**
 * Monitors GPS position against trip stops, fires a notification
 * when the user comes within ~150m of a stop.
 *
 * Guards against repeat prompts:
 *  - A 30-minute cooldown prevents re-firing for the same stop.
 */
export function useStopProximity(opts: {
  position: RoamPosition | null;
  stops: TripStop[];
  planId: string | null;
  enabled?: boolean;
  onArrival?: (event: ProximityEvent) => void;
}) {
  const { position, stops, planId, enabled = true, onArrival } = opts;

  // Track which stops we've already notified for (by stop id) + when
  const notifiedRef = useRef<Map<string, number>>(new Map());

  // Reset notifications when plan changes
  useEffect(() => {
    notifiedRef.current.clear();
  }, [planId]);

  const checkProximity = useCallback(() => {
    if (!enabled || !position || !planId || stops.length === 0) return;

    const now = Date.now();

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (!stop) continue;
      const stopId = stop.id ?? `stop-${i}`;
      const dist = haversineM(position.lat, position.lng, stop.lat, stop.lng);

      if (dist <= PROXIMITY_RADIUS_M) {
        const lastNotified = notifiedRef.current.get(stopId);
        if (lastNotified && now - lastNotified < COOLDOWN_MS) continue;

        notifiedRef.current.set(stopId, now);
        const stopName = stop.name?.trim() || `Stop ${i + 1}`;

        // Fire notification
        roamNotify.stopArrived(stopName);
        haptic.success();

        // Callback to parent
        onArrival?.({
          stop,
          stopIndex: i,
          distance: dist,
        });
      }
    }
  }, [enabled, position, planId, stops, onArrival]);

  // Run check whenever position updates
  useEffect(() => {
    checkProximity();
  }, [checkProximity]);
}
