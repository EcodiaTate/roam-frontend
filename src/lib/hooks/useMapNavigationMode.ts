// src/hooks/useMapNavigationMode.ts
"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { BBox4 } from "@/lib/types/geo";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type MapNavMode = {
  /** Enable/disable navigation camera tracking */
  setActive: (active: boolean) => void;
  /** Zoom out to see full route bbox */
  showOverview: () => void;
  /** Re-center on user and resume tracking */
  recenter: () => void;
  /** Whether camera is currently in user-tracking mode (vs overview/manual) */
  isTracking: boolean;
};

type Opts = {
  mapRef: React.RefObject<MLMap | null>;
  position: RoamPosition | null;
  active: boolean;
  bbox: BBox4 | null;
};

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

/** Zoom level during navigation tracking */
const NAV_ZOOM = 16;
/** Pitch for the slight 3D effect during nav */
const NAV_PITCH = 50;
/** Duration for smooth camera easing (ms) */
const EASE_DURATION = 600;
/** Fast ease for position updates (ms) */
const TRACK_DURATION = 1000;
/** If user manually pans, pause tracking for this long (ms) */
const MANUAL_PAN_COOLDOWN_MS = 8000;

// ──────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────

export function useMapNavigationMode({ mapRef, position, active, bbox }: Opts): MapNavMode {
  const isTrackingRef = useRef(true);
  const lastManualInteraction = useRef(0);
  const isActiveRef = useRef(active);
  isActiveRef.current = active;

  // ── Detect user manual interaction → pause tracking ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active) return;

    const onMoveStart = (e: any) => {
      // If the move was triggered programmatically (by us), ignore
      if (e.originalEvent) {
        // User-initiated pan/zoom/rotate
        lastManualInteraction.current = Date.now();
        isTrackingRef.current = false;
      }
    };

    map.on("movestart", onMoveStart);
    return () => {
      map.off("movestart", onMoveStart);
    };
  }, [mapRef, active]);

  // ── Enter/exit navigation camera mode ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (active) {
      // Enter nav mode: set pitch, disable compass rotation
      map.easeTo({
        pitch: NAV_PITCH,
        duration: EASE_DURATION,
      });
      isTrackingRef.current = true;
    } else {
      // Exit nav mode: reset to flat, north-up
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: EASE_DURATION,
      });
      isTrackingRef.current = false;

      // Refit to route bbox
      if (bbox) {
        setTimeout(() => {
          try {
            map.fitBounds(
              [
                [bbox.minLng, bbox.minLat],
                [bbox.maxLng, bbox.maxLat],
              ],
              { padding: 60, duration: EASE_DURATION },
            );
          } catch {}
        }, EASE_DURATION + 50);
      }
    }
  }, [mapRef, active, bbox]);

  // ── Track user position ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active || !position) return;

    // If user manually panned, wait for cooldown
    const timeSinceManual = Date.now() - lastManualInteraction.current;
    if (timeSinceManual < MANUAL_PAN_COOLDOWN_MS) {
      // Still in manual mode — just update the user-is-tracking flag
      // After cooldown expires, we'll resume tracking
      const remaining = MANUAL_PAN_COOLDOWN_MS - timeSinceManual;
      const timer = setTimeout(() => {
        isTrackingRef.current = true;
      }, remaining);
      return () => clearTimeout(timer);
    }

    if (!isTrackingRef.current) {
      isTrackingRef.current = true;
    }

    // Compute bearing from heading (if available and moving)
    const bearing = position.heading != null && position.speed != null && position.speed > 1
      ? position.heading
      : map.getBearing(); // keep current bearing if stationary

    // Adaptive zoom: zoom out slightly at high speed
    let zoom = NAV_ZOOM;
    if (position.speed != null) {
      const kph = position.speed * 3.6;
      if (kph > 110) zoom = 14;
      else if (kph > 80) zoom = 14.5;
      else if (kph > 50) zoom = 15;
      else if (kph > 20) zoom = 15.5;
    }

    // Offset center slightly below screen center so the route ahead is more visible
    // In heading-up mode with pitch, the camera naturally shows more ahead
    map.easeTo({
      center: [position.lng, position.lat],
      bearing,
      zoom,
      pitch: NAV_PITCH,
      duration: TRACK_DURATION,
      easing: (t: number) => t, // linear for smooth tracking
    });
  }, [mapRef, active, position]);

  // ── Overview: zoom out to full route ──
  const showOverview = useCallback(() => {
    const map = mapRef.current;
    if (!map || !bbox) return;

    isTrackingRef.current = false;
    lastManualInteraction.current = Date.now();

    map.easeTo({ pitch: 0, bearing: 0, duration: EASE_DURATION / 2 });

    setTimeout(() => {
      try {
        map.fitBounds(
          [
            [bbox.minLng, bbox.minLat],
            [bbox.maxLng, bbox.maxLat],
          ],
          { padding: 60, duration: EASE_DURATION },
        );
      } catch {}
    }, EASE_DURATION / 2 + 50);
  }, [mapRef, bbox]);

  // ── Recenter: snap back to user ──
  const recenter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !position) return;

    lastManualInteraction.current = 0;
    isTrackingRef.current = true;

    const bearing =
      position.heading != null && position.speed != null && position.speed > 1
        ? position.heading
        : 0;

    map.easeTo({
      center: [position.lng, position.lat],
      bearing,
      zoom: NAV_ZOOM,
      pitch: NAV_PITCH,
      duration: EASE_DURATION,
    });
  }, [mapRef, position]);

  // ── Imperative activation ──
  const setActive = useCallback(
    (a: boolean) => {
      // This is handled by the active prop reactively,
      // but exposed for programmatic control if needed
      isTrackingRef.current = a;
      if (a && position) {
        recenter();
      }
    },
    [recenter, position],
  );

  return {
    setActive,
    showOverview,
    recenter,
    isTracking: isTrackingRef.current,
  };
}