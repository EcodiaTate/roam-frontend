// src/lib/native/geolocation.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Geolocation, type Position, type WatchPositionCallback } from "@capacitor/geolocation";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { hasPlugin, isNative } from "./platform";

/* ── Types ───────────────────────────────────────────────────────────── */

export type RoamPosition = {
  lat: number;
  lng: number;
  accuracy: number;       // meters
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;  // degrees from north (0-360)
  speed: number | null;    // meters/sec
  timestamp: number;       // ms epoch
};

export type GeoState = {
  /** Latest position (null until first fix) */
  position: RoamPosition | null;
  /** True while waiting for first fix */
  loading: boolean;
  /** Permission status */
  permission: "granted" | "denied" | "prompt" | "unknown";
  /** Error message if any */
  error: string | null;
  /** Whether we're actively tracking */
  tracking: boolean;
};

function toRoamPos(p: Position): RoamPosition {
  const c = p.coords;

  return {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: c.accuracy,
    altitude: c.altitude ?? null,
    altitudeAccuracy: c.altitudeAccuracy ?? null,
    heading: c.heading ?? null,
    speed: c.speed ?? null,
    timestamp: p.timestamp,
  };
}


/* ── Permission helper ───────────────────────────────────────────────── */

export async function requestLocationPermission(): Promise<"granted" | "denied" | "prompt"> {
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location === "granted" || status.coarseLocation === "granted") {
      return "granted";
    }
    if (status.location === "denied") {
      return "denied";
    }
    // Prompt
    const req = await Geolocation.requestPermissions();
    if (req.location === "granted" || req.coarseLocation === "granted") {
      return "granted";
    }
    return "denied";
  } catch {
    return "denied";
  }
}

/* ── One-shot position ───────────────────────────────────────────────── */

export async function getCurrentPosition(): Promise<RoamPosition> {
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 15000,
  });
  return toRoamPos(pos);
}

/* ── Hook: useGeolocation ────────────────────────────────────────────── */

/**
 * Live geolocation tracking hook.
 *
 * Usage:
 *   const { position, loading, error, startTracking, stopTracking } = useGeolocation();
 *
 * Options:
 *   autoStart: begin tracking on mount (default false)
 *   highAccuracy: GPS-level accuracy (default true, uses more battery)
 *   hapticOnFix: vibrate on first fix (default true on native)
 */
export function useGeolocation(opts?: {
  autoStart?: boolean;
  highAccuracy?: boolean;
  hapticOnFix?: boolean;
}) {
  const autoStart = opts?.autoStart ?? false;
  const highAccuracy = opts?.highAccuracy ?? true;
  const hapticOnFix = opts?.hapticOnFix ?? isNative;

  const [state, setState] = useState<GeoState>({
    position: null,
    loading: false,
    permission: "unknown",
    error: null,
    tracking: false,
  });

  const watchIdRef = useRef<string | null>(null);
  const gotFirstFix = useRef(false);

  const startTracking = useCallback(async () => {
    // Already tracking
    if (watchIdRef.current) return;

    setState((s) => ({ ...s, loading: true, error: null }));

    // Check permission
    const perm = await requestLocationPermission();
    if (perm === "denied") {
      setState((s) => ({
        ...s,
        loading: false,
        permission: "denied",
        error: "Location permission denied. Enable it in device settings.",
      }));
      return;
    }

    setState((s) => ({ ...s, permission: "granted" }));
    gotFirstFix.current = false;

    try {
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: highAccuracy },
        (pos, err) => {
          if (err) {
            setState((s) => ({ ...s, error: err.message, loading: false }));
            return;
          }
          if (!pos) return;

          const rp = toRoamPos(pos);

          // Haptic buzz on first fix
          if (!gotFirstFix.current && hapticOnFix && hasPlugin("Haptics")) {
            gotFirstFix.current = true;
            Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
          }

          setState((s) => ({
            ...s,
            position: rp,
            loading: false,
            tracking: true,
            error: null,
          }));
        },
      );

      watchIdRef.current = id;
      setState((s) => ({ ...s, tracking: true }));
    } catch (e: any) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e?.message ?? "Failed to start location tracking",
      }));
    }
  }, [highAccuracy, hapticOnFix]);

  const stopTracking = useCallback(async () => {
    if (watchIdRef.current) {
      try {
        await Geolocation.clearWatch({ id: watchIdRef.current });
      } catch {}
      watchIdRef.current = null;
    }
    setState((s) => ({ ...s, tracking: false, loading: false }));
  }, []);

  // Auto-start
  useEffect(() => {
    if (autoStart) startTracking();
    return () => {
      stopTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...state,
    startTracking,
    stopTracking,
  };
}