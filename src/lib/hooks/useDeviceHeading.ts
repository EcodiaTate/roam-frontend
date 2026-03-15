// src/lib/hooks/useDeviceHeading.ts
//
// Returns the device compass heading (degrees from north, 0-360) using the
// DeviceOrientation API. On iOS 13+ this requires a user-gesture permission
// request which is handled automatically on first activation.
"use client";

import { useEffect, useRef, useState } from "react";

/** Minimum change in degrees before we emit a new value (reduces re-renders). */
const THRESHOLD_DEG = 2;

/**
 * Returns the device's compass heading in degrees (0-360, null if unavailable).
 * Only listens while `enabled` is true.
 */
export function useDeviceHeading(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  const lastEmitted = useRef<number | null>(null);
  const permissionGranted = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // Request iOS 13+ permission if needed
    const doe = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (doe.requestPermission && !permissionGranted.current) {
      doe.requestPermission().then((state) => {
        if (state === "granted") permissionGranted.current = true;
      }).catch(() => {});
    }

    function onOrientation(e: DeviceOrientationEvent) {
      // webkitCompassHeading (iOS): degrees from north
      // e.alpha (Android/standard): degrees from an arbitrary reference
      const raw =
        (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading ??
        (e.alpha != null ? (360 - e.alpha) % 360 : null);

      if (raw == null) return;

      const prev = lastEmitted.current;
      if (prev != null) {
        let delta = Math.abs(raw - prev);
        if (delta > 180) delta = 360 - delta;
        if (delta < THRESHOLD_DEG) return;
      }

      lastEmitted.current = raw;
      setHeading(Math.round(raw));
    }

    window.addEventListener("deviceorientation", onOrientation, true);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation, true);
    };
  }, [enabled]);

  // Clear heading when disabled
  useEffect(() => {
    if (!enabled) {
      setHeading(null);
      lastEmitted.current = null;
    }
  }, [enabled]);

  return heading;
}
