// src/lib/hooks/useNearbyRoamers.ts
"use client";

/**
 * useNearbyRoamers
 *
 * Polls the presence/nearby endpoint when online to detect
 * other roamers predicted to be within range. Triggers
 * notifications when a new roamer is first detected.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { presenceApi } from "@/lib/api/presence";
import { networkMonitor } from "@/lib/offline/networkMonitor";
import { presenceBeacon } from "@/lib/offline/presenceBeacon";
import { roamNotify } from "@/lib/native/notifications";
import type { NearbyRoamer } from "@/lib/types/peer";
import { cardinalDir } from "@/lib/nav/geo";

const POLL_INTERVAL_MS = 60_000; // check every 60s default
const POLL_INTERVAL_SHARED_MS = 20_000; // 20s on shared trips
const STALE_PRESENCE_MS = 5 * 60_000; // drop roamers idle > 5 min

type NearbyState = {
  roamers: NearbyRoamer[];
  loading: boolean;
  lastChecked: string | null;
};

export function useNearbyRoamers(opts?: { radiusKm?: number; enabled?: boolean; sharedTrip?: boolean }) {
  const radiusKm = opts?.radiusKm ?? 50;
  const enabled = opts?.enabled ?? true;
  const intervalMs = opts?.sharedTrip ? POLL_INTERVAL_SHARED_MS : POLL_INTERVAL_MS;

  const [state, setState] = useState<NearbyState>({
    roamers: [],
    loading: false,
    lastChecked: null,
  });

  const seenRef = useRef(new Set<string>());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!networkMonitor.online) return;

    const pos = presenceBeacon.lastPosition;
    if (!pos) return;

    setState((s) => ({ ...s, loading: true }));

    try {
      const res = await presenceApi.nearby({
        lat: pos.lat,
        lng: pos.lng,
        radius_km: radiusKm,
      });

      // Drop roamers whose last ping is too old - they're no
      // longer navigating and we shouldn't surface stale positions
      const now = Date.now();
      const activeRoamers = res.roamers.filter(
        (r) => now - new Date(r.last_pinged_at).getTime() < STALE_PRESENCE_MS,
      );

      // Notify for newly detected roamers
      for (const r of activeRoamers) {
        if (!seenRef.current.has(r.user_id)) {
          seenRef.current.add(r.user_id);
          roamNotify.nearbyRoamer(r.distance_km, cardinalDir(r.heading_deg));
        }
      }

      // Clean up stale seen entries (roamers who left range)
      const currentIds = new Set(activeRoamers.map((r) => r.user_id));
      for (const id of seenRef.current) {
        if (!currentIds.has(id)) seenRef.current.delete(id);
      }

      setState({
        roamers: activeRoamers,
        loading: false,
        lastChecked: new Date().toISOString(),
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [radiusKm]);

  useEffect(() => {
    if (!enabled) return;

    // Initial poll
    void poll();

    timerRef.current = setInterval(() => {
      void poll();
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, poll, intervalMs]);

  return state;
}

// cardinalDir imported from @/lib/nav/geo
