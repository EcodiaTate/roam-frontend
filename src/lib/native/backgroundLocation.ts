// src/lib/native/backgroundLocation.ts
//
// Background-capable GPS tracking for active navigation.
//
// This wraps @capacitor/geolocation specifically for the active navigation
// use case where we need continuous position updates even when the screen
// is off or the user switches to Spotify.
//
// Different from useGeolocation hook:
//   - useGeolocation is for general map centering (foreground only)
//   - backgroundLocation is for active TBT navigation (background-capable)
//
// iOS requirements (in Info.plist):
//   NSLocationAlwaysAndWhenInUseUsageDescription
//   UIBackgroundModes: ["location", "audio"]
//
// Android requirements (in AndroidManifest.xml):
//   ACCESS_FINE_LOCATION, ACCESS_BACKGROUND_LOCATION,
//   FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION

import { Geolocation } from "@capacitor/geolocation";
import { isNative } from "./platform";
import type { RoamPosition } from "./geolocation";

let watchId: string | null = null;
let lastPosition: RoamPosition | null = null;

export type PositionCallback = (pos: RoamPosition) => void;
export type ErrorCallback = (err: any) => void;

/**
 * Start continuous background-capable GPS tracking.
 *
 * Calls onPosition every ~1 second with high-accuracy GPS data.
 * On iOS, this keeps GPS alive in the background if Info.plist
 * is configured correctly.
 *
 * Safe to call multiple times — if already tracking, does nothing.
 */
export async function startBackgroundTracking(
  onPosition: PositionCallback,
  onError?: ErrorCallback,
): Promise<void> {
  if (watchId !== null) return; // already tracking

  // Check permissions first
  try {
    const status = await Geolocation.checkPermissions();
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      const req = await Geolocation.requestPermissions();
      if (req.location !== "granted" && req.coarseLocation !== "granted") {
        onError?.(new Error("Location permission denied"));
        return;
      }
    }
  } catch (e) {
    onError?.(e);
    return;
  }

  try {
    watchId = await Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
      (position, err) => {
        if (err) {
          onError?.(err);
          return;
        }
        if (!position) return;

        const rp: RoamPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy ?? 999,
          altitude: position.coords.altitude ?? null,
          altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
          heading: position.coords.heading ?? null,
          speed: position.coords.speed ?? null,
          timestamp: position.timestamp,
        };

        lastPosition = rp;
        onPosition(rp);
      },
    );
  } catch (e) {
    onError?.(e);
  }
}

/**
 * Stop background GPS tracking.
 * Safe to call multiple times or when not tracking.
 */
export async function stopBackgroundTracking(): Promise<void> {
  if (watchId !== null) {
    try {
      await Geolocation.clearWatch({ id: watchId });
    } catch {
      // ignore — watch may already be cleared
    }
    watchId = null;
  }
  lastPosition = null;
}

/**
 * Whether we're currently tracking in background mode.
 */
export function isBackgroundTracking(): boolean {
  return watchId !== null;
}

/**
 * Get the last known position from background tracking.
 * Returns null if not tracking or no position received yet.
 */
export function getLastBackgroundPosition(): RoamPosition | null {
  return lastPosition;
}