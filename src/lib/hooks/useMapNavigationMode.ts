// src/hooks/useMapNavigationMode.ts
//
// Controls the MapLibre camera during active navigation.
//   - Heading-up 3D tracking with adaptive zoom
//   - Lookahead offset (user puck at bottom, road ahead visible)
//   - Smooth entry/exit transitions that can't be interrupted by tracking
//   - Manual pan detection with auto-resume
//   - 60 fps interpolated camera driven by GpsInterpolator (no easeTo jitter)
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { BBox4 } from "@/lib/types/geo";
import type { InterpolatedPosition } from "@/lib/nav/gpsInterpolator";
import { useDeviceHeading } from "@/lib/hooks/useDeviceHeading";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type MapNavMode = {
  setActive: (active: boolean) => void;
  showOverview: () => void;
  recenter: () => void;
  isTracking: boolean;
  /**
   * Called by the GpsInterpolator on every animation frame (~60 fps).
   * Drives the camera and user puck directly — bypasses React state.
   */
  onInterpolatedFrame: (pos: InterpolatedPosition) => void;
};

type Opts = {
  mapRef: React.RefObject<MLMap | null>;
  /** Smoothed GPS position for entry/recenter animations (still ~1 Hz) */
  position: RoamPosition | null;
  active: boolean;
  bbox: BBox4 | null;
};

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const NAV_ZOOM = 17.5;
const NAV_PITCH = 65;
const ENTRY_MS = 1200;
const EXIT_MS = 1000;
const RECENTER_MS = 800;
const OVERVIEW_MS = 800;
const MANUAL_PAN_COOLDOWN_MS = 8000;
const LOOKAHEAD_FRACTION = 0.25;

// Zoom is smoothed toward the target over multiple frames to avoid steps
const ZOOM_LERP_RATE = 0.05; // 5% per frame → smooth ~300ms convergence

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

// Cache lookahead padding to avoid recalculating on every 60fps frame.
// Only recalculates when canvas height actually changes.
let _cachedHeight = 0;
let _cachedPadding = { top: 150, bottom: 0, left: 0, right: 0 };

function getLookaheadPadding(map: MLMap) {
  const h = map.getCanvas()?.clientHeight ?? 600;
  if (h !== _cachedHeight) {
    _cachedHeight = h;
    _cachedPadding = { top: Math.round(h * LOOKAHEAD_FRACTION), bottom: 0, left: 0, right: 0 };
  }
  return _cachedPadding;
}

function adaptiveZoom(speed: number): number {
  const kph = speed * 3.6;
  if (kph > 110) return 15.0;
  if (kph > 80) return 15.5;
  if (kph > 50) return 16.0;
  if (kph > 20) return 16.8;
  return NAV_ZOOM;
}

function userBearing(
  pos: RoamPosition,
  compassHeading: number | null,
  fallback: number,
): number {
  if (pos.heading != null && pos.speed != null && pos.speed > 1) return pos.heading;
  if (compassHeading != null) return compassHeading;
  return fallback;
}

/** Smooth ease-out-cubic curve */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// ──────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────

export function useMapNavigationMode({ mapRef, position, active, bbox }: Opts): MapNavMode {
  const compassHeading = useDeviceHeading(active);
  const compassRef = useRef(compassHeading);
  useEffect(() => { compassRef.current = compassHeading; }, [compassHeading]);

  const [isTracking, setIsTracking] = useState(true);
  const isTrackingRef = useRef(true);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(active);
  const positionRef = useRef(position);
  const hasEnteredRef = useRef(false);

  // Smoothed zoom to avoid steppy zoom changes
  const currentZoomRef = useRef(NAV_ZOOM);

  // ── Transition lock ──
  // While a big camera animation (entry/exit/recenter/overview) is in progress,
  // the per-frame tracking must NOT fire or it will cancel the animation.
  const transitionLockRef = useRef(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: syncs tracking state with map animation on active toggle
      setIsTracking(true);
      currentZoomRef.current = NAV_ZOOM;

      const pos = positionRef.current;
      if (pos) {
        hasEnteredRef.current = true;
        lockTracking(ENTRY_MS + 100);
        map.flyTo({
          center: [pos.lng, pos.lat],
          bearing: userBearing(pos, compassRef.current, 0),
          zoom: NAV_ZOOM,
          pitch: NAV_PITCH,
          padding: getLookaheadPadding(map),
          duration: ENTRY_MS,
          curve: 1.2,
          easing: easeOut,
        });
      }
    } else {
      // ── Exit nav mode ──
      hasEnteredRef.current = false;
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      isTrackingRef.current = false;
      setIsTracking(false);

      lockTracking(EXIT_MS + 100);

      if (bbox) {
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

  // ── Deferred entry: first GPS fix arrives after active=true ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active || !position) return;
    if (transitionLockRef.current) return;

    if (!hasEnteredRef.current) {
      hasEnteredRef.current = true;
      isTrackingRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: deferred entry when first GPS fix arrives after active=true
      setIsTracking(true);
      lockTracking(ENTRY_MS + 100);

      map.flyTo({
        center: [position.lng, position.lat],
        bearing: userBearing(position, compassRef.current, 0),
        zoom: NAV_ZOOM,
        pitch: NAV_PITCH,
        padding: getLookaheadPadding(map),
        duration: ENTRY_MS,
        curve: 1.2,
        easing: easeOut,
      });
    }
    // NOTE: No continuous tracking here. That's handled by onInterpolatedFrame.
  }, [mapRef, active, position]);

  // ── 60 fps interpolated frame handler ──
  // Called directly by the GpsInterpolator on every rAF tick.
  // Uses jumpTo (instant, zero-duration) for jitter-free tracking.
  const onInterpolatedFrame = useCallback((pos: InterpolatedPosition) => {
    const map = mapRef.current;
    if (!map || !isActiveRef.current) return;

    // Don't interrupt a transition animation
    if (transitionLockRef.current) return;
    // Don't track during manual pan cooldown
    if (!isTrackingRef.current) return;

    // Smoothly interpolate zoom toward target (avoids steppy zoom changes)
    const targetZoom = adaptiveZoom(pos.speed);
    currentZoomRef.current += (targetZoom - currentZoomRef.current) * ZOOM_LERP_RATE;

    // Use compass heading when stationary, interpolated heading when moving
    const bearing = pos.speed > 1
      ? pos.heading
      : (compassRef.current ?? pos.heading);

    // jumpTo is instant (no animation queue, no cancellation, no jitter)
    map.jumpTo({
      center: [pos.lng, pos.lat],
      bearing,
      zoom: currentZoomRef.current,
      pitch: NAV_PITCH,
      padding: getLookaheadPadding(map),
    });
  }, [mapRef]);

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

    lockTracking(RECENTER_MS + 100);

    map.flyTo({
      center: [pos.lng, pos.lat],
      bearing: userBearing(pos, compassRef.current, 0),
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

  return { setActive, showOverview, recenter, isTracking, onInterpolatedFrame };
}
