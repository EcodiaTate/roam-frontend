// src/lib/hooks/useStopProximity.ts
"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { TripStop } from "@/lib/types/trip";
import { roamNotify } from "@/lib/native/notifications";
import { recordArrival, getMemoryForStop } from "@/lib/offline/memoriesStore";
import { haptic } from "@/lib/native/haptics";

/** Radius in meters — triggers notification when user is within this distance */
const PROXIMITY_RADIUS_M = 150;

/** Minimum ms between notifications for the same stop (prevent spam) */
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/** localStorage key for the global opt-out setting */
export const MEMORY_PROMPTS_KEY = "roam_memory_prompts";

/** Session-storage key for stops the user dismissed this session */
const DISMISSED_KEY = "roam_proximity_dismissed";

/**
 * Read the global memory-prompts preference.
 * Defaults to true (prompts enabled) if never set.
 */
export function getMemoryPromptsEnabled(): boolean {
  try {
    return localStorage.getItem(MEMORY_PROMPTS_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Toggle the global memory-prompts preference. */
export function setMemoryPromptsEnabled(on: boolean): void {
  try {
    if (on) {
      localStorage.removeItem(MEMORY_PROMPTS_KEY);
    } else {
      localStorage.setItem(MEMORY_PROMPTS_KEY, "off");
    }
  } catch {
    // storage unavailable
  }
}

/** Mark a stop as dismissed for this session so it won't re-prompt. */
export function dismissProximityStop(planId: string, stopId: string): void {
  try {
    const key = `${planId}:${stopId}`;
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    const set: string[] = raw ? JSON.parse(raw) : [];
    if (!set.includes(key)) set.push(key);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(set));
  } catch {
    // storage unavailable
  }
}

function isDismissedThisSession(planId: string, stopId: string): boolean {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const set: string[] = JSON.parse(raw);
    return set.includes(`${planId}:${stopId}`);
  } catch {
    return false;
  }
}

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
 * Monitors GPS position against trip stops, fires a notification + records
 * arrival when the user comes within ~150m of a stop.
 *
 * Guards against repeat prompts:
 *  - Stops the user has already dismissed this session are skipped.
 *  - Stops that already have a note or photos are skipped (arrival is still recorded).
 *  - A 30-minute cooldown prevents re-firing for the same stop.
 *  - The global "memory prompts" setting can disable all prompts.
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

    // Check global opt-out
    if (!getMemoryPromptsEnabled()) return;

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

        // Always record arrival (idempotent — won't overwrite existing)
        recordArrival({
          planId,
          stopId,
          stopName: stop.name ?? null,
          stopIndex: i,
          lat: stop.lat,
          lng: stop.lng,
        }).catch(() => {}); // best-effort

        // Skip prompt if user dismissed this stop this session
        if (isDismissedThisSession(planId, stopId)) continue;

        // Check if stop already has content — don't prompt again
        getMemoryForStop(planId, stopId).then((mem) => {
          if (mem && (mem.note || mem.photos.length > 0)) return;

          // Fire notification
          roamNotify.stopArrived(stopName);
          haptic.success();

          // Callback to parent (opens memory sheet)
          onArrival?.({
            stop,
            stopIndex: i,
            distance: dist,
          });
        }).catch(() => {
          // IDB read failed — still fire prompt as fallback
          roamNotify.stopArrived(stopName);
          haptic.success();
          onArrival?.({ stop, stopIndex: i, distance: dist });
        });
      }
    }
  }, [enabled, position, planId, stops, onArrival]);

  // Run check whenever position updates
  useEffect(() => {
    checkProximity();
  }, [checkProximity]);
}
