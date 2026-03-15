// src/hooks/useMapNavigationMode.ts
//
// Controls the MapLibre camera during active navigation.
//   - Heading-up 3D tracking with adaptive zoom
//   - Lookahead offset (user puck at bottom, road ahead visible)
//   - Smooth entry/exit transitions that can't be interrupted by tracking
//   - Manual pan detection with auto-resume
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { BBox4 } from "@/lib/types/geo";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type MapNavMode = {
  setActive: (active: boolean) => void;
  showOverview: () => void;
  recenter: () => void;
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

const NAV_ZOOM = 16;
const NAV_PITCH = 50;
const ENTRY_MS = 1200;
const EXIT_MS = 1000;
const RECENTER_MS = 800;
const OVERVIEW_MS = 800;
const TRACK_EASE_MS = 900;
const JUMP_THRESHOLD_M = 3;
const MANUAL_PAN_COOLDOWN_MS = 8000;
const LOOKAHEAD_FRACTION = 0.28;

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLng = (lng2 - lng1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLookaheadPadding(map: MLMap) {
  const h = map.getCanvas()?.clientHeight ?? 600;
  return { top: 0, bottom: Math.round(h * LOOKAHEAD_FRACTION), left: 0, right: 0 };
}

function adaptiveZoom(speed: number | null): number {
  if (speed == null) return NAV_ZOOM;
  const kph = speed * 3.6;
  if (kph > 110) return 13.5;
  if (kph > 80) return 14.0;
  if (kph > 50) return 14.8;
  if (kph > 20) return 15.5;
  return NAV_ZOOM;
}

function userBearing(pos: RoamPosition, fallback: number): number {
  if (pos.heading != null && pos.speed != null && pos.speed > 1) return pos.heading;
  return fallback;
}

/** Smooth ease-out-cubic curve */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// ──────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────

export function useMapNavigationMode({ mapRef, position, active, bbox }: Opts): MapNavMode {
  const [isTracking, setIsTracking] = useState(true);
  const isTrackingRef = useRef(true);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCameraPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const isActiveRef = useRef(active);
  const positionRef = useRef(position);
  const hasEnteredRef = useRef(false);

  // ── Transition lock ──
  // While a big camera animation (entry/exit/recenter/overview) is in progress,
  // the per-tick tracking effect must NOT fire or it will cancel the animation
  // and cause a snap/jump.
  const transitionLockRef = useRef(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Lock tracking for `ms` milliseconds (duration of a transition animation). */
  function lockTracking(ms: number) {
    transitionLockRef.current = true;
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => {
      transitionLockRef.current = false;
      transitionTimerRef.current = null;
    }, ms);
  }

  useEffect(() => { isActiveRef.current = active; }, [active]);
  useEffect(() => { positionRef.current = position; }, [position]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  // ── Manual pan detection ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active) return;

    const onMoveStart = (e: { originalEvent?: Event }) => {
      if (!e.originalEvent) return;

      isTrackingRef.current = false;
      setIsTracking(false);

      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = setTimeout(() => {
        cooldownTimerRef.current = null;
        if (isActiveRef.current) {
          isTrackingRef.current = true;
          setIsTracking(true);
        }
      }, MANUAL_PAN_COOLDOWN_MS);
    };

    map.on("movestart", onMoveStart);
    return () => {
      map.off("movestart", onMoveStart);
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, [mapRef, active]);

  // ── Enter / exit navigation mode ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (active) {
      hasEnteredRef.current = false;
      isTrackingRef.current = true;
      setIsTracking(true);
      lastCameraPosRef.current = null;

      const pos = positionRef.current;
      if (pos) {
        hasEnteredRef.current = true;
        lockTracking(ENTRY_MS + 100);
        map.flyTo({
          center: [pos.lng, pos.lat],
          bearing: userBearing(pos, 0),
          zoom: NAV_ZOOM,
          pitch: NAV_PITCH,
          padding: getLookaheadPadding(map),
          duration: ENTRY_MS,
          curve: 1.2,
          easing: easeOut,
        });
      }
      // If no position yet, the tracking effect will handle entry
      // once the first GPS fix arrives.
    } else {
      // ── Exit nav mode ──
      hasEnteredRef.current = false;
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      isTrackingRef.current = false;
      setIsTracking(false);
      lastCameraPosRef.current = null;

      lockTracking(EXIT_MS + 100);

      if (bbox) {
        // fitBounds with linear:false uses flyTo internally → single smooth arc
        // that handles zoom, center, pitch, and bearing all at once.
        try {
          map.fitBounds(
            [[bbox.minLng, bbox.minLat], [bbox.maxLng, bbox.maxLat]],
            {
              padding: 60,
              pitch: 0,
              bearing: 0,
              duration: EXIT_MS,
              linear: false,
              curve: 1.5,
              easing: easeOut,
            },
          );
        } catch {}
      } else {
        map.flyTo({
          pitch: 0,
          bearing: 0,
          padding: { top: 0, bottom: 0, left: 0, right: 0 },
          duration: EXIT_MS,
          easing: easeOut,
        });
      }
    }
  }, [mapRef, active, bbox]);

  // ── Continuous position tracking ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active || !position) return;

    // Don't interrupt a transition animation
    if (transitionLockRef.current) return;

    // Deferred entry: position arrived after active=true was set
    if (!hasEnteredRef.current) {
      hasEnteredRef.current = true;
      isTrackingRef.current = true;
      setIsTracking(true);
      lockTracking(ENTRY_MS + 100);

      map.flyTo({
        center: [position.lng, position.lat],
        bearing: userBearing(position, 0),
        zoom: NAV_ZOOM,
        pitch: NAV_PITCH,
        padding: getLookaheadPadding(map),
        duration: ENTRY_MS,
        curve: 1.2,
        easing: easeOut,
      });
      lastCameraPosRef.current = { lat: position.lat, lng: position.lng };
      return;
    }

    // Skip during manual pan cooldown
    if (!isTrackingRef.current) return;

    const bearing = userBearing(position, map.getBearing());
    const zoom = adaptiveZoom(position.speed);
    const padding = getLookaheadPadding(map);

    const last = lastCameraPosRef.current;
    const distM = last ? haversineM(last.lat, last.lng, position.lat, position.lng) : Infinity;
    lastCameraPosRef.current = { lat: position.lat, lng: position.lng };

    const duration = distM < JUMP_THRESHOLD_M ? 200 : TRACK_EASE_MS;

    map.easeTo({
      center: [position.lng, position.lat],
      bearing,
      zoom,
      pitch: NAV_PITCH,
      padding,
      duration,
      easing: (t) => t,
    });
  }, [mapRef, active, position]);

  // ── Overview ──
  const showOverview = useCallback(() => {
    const map = mapRef.current;
    if (!map || !bbox) return;

    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    isTrackingRef.current = false;
    setIsTracking(false);

    lockTracking(OVERVIEW_MS + 100);

    try {
      map.fitBounds(
        [[bbox.minLng, bbox.minLat], [bbox.maxLng, bbox.maxLat]],
        {
          padding: 60,
          pitch: 0,
          bearing: 0,
          duration: OVERVIEW_MS,
          linear: false,
          curve: 1.5,
          easing: easeOut,
        },
      );
    } catch {}
  }, [mapRef, bbox]);

  // ── Recenter ──
  const recenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const pos = positionRef.current;
    if (!pos) return;

    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }

    isTrackingRef.current = true;
    setIsTracking(true);
    lastCameraPosRef.current = null;

    lockTracking(RECENTER_MS + 100);

    map.flyTo({
      center: [pos.lng, pos.lat],
      bearing: userBearing(pos, 0),
      zoom: NAV_ZOOM,
      pitch: NAV_PITCH,
      padding: getLookaheadPadding(map),
      duration: RECENTER_MS,
      curve: 1.2,
      easing: easeOut,
    });
  }, [mapRef]);

  // ── Imperative activation ──
  const setActive = useCallback((a: boolean) => {
    isTrackingRef.current = a;
    setIsTracking(a);
    if (a) recenter();
  }, [recenter]);

  return { setActive, showOverview, recenter, isTracking };
}
