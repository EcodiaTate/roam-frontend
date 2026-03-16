// src/lib/offline/presenceBeacon.ts
"use client";

/**
 * PresenceBeacon
 *
 * Periodically pings the backend with the user's GPS position
 * whenever the device has network connectivity. The ping is
 * ephemeral (upserts a single row, no accumulation).
 *
 * This enables dead-reckoning proximity awareness: even after
 * the user loses signal, other roamers can project their
 * last-known position forward using speed + heading.
 */

import { presenceApi } from "@/lib/api/presence";
import { networkMonitor } from "@/lib/offline/networkMonitor";
import { getCurrentPosition, type RoamPosition } from "@/lib/native/geolocation";

const PING_INTERVAL_MS = 30_000; // 30 seconds when online

class PresenceBeaconImpl {
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _started = false;
  private _lastPosition: RoamPosition | null = null;
  private _networkUnsub: (() => void) | null = null;

  /** Latest position used for the last successful ping */
  get lastPosition() {
    return this._lastPosition;
  }

  /**
   * Start the beacon. Call once at app boot (after auth).
   * Automatically pauses when offline and resumes when online.
   */
  start() {
    if (this._started) return;
    this._started = true;

    // Immediately attempt a ping
    void this._ping();

    // Set up interval
    this._timer = setInterval(() => {
      void this._ping();
    }, PING_INTERVAL_MS);

    // Listen for network changes — ping immediately on reconnect
    this._networkUnsub = networkMonitor.subscribe((online) => {
      if (online) void this._ping();
    });
  }

  /** Stop the beacon. */
  stop() {
    if (!this._started) return;
    this._started = false;

    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    this._networkUnsub?.();
    this._networkUnsub = null;
  }

  /** Manually set position (e.g. from existing geolocation watch) */
  updatePosition(pos: RoamPosition) {
    this._lastPosition = pos;
  }

  /* ── Internals ───────────────────────────────────────────────── */

  private async _ping() {
    if (!networkMonitor.online) return;

    try {
      // Use cached position if available and recent, otherwise get fresh
      let pos = this._lastPosition;
      if (!pos || Date.now() - pos.timestamp > 60_000) {
        try {
          pos = await getCurrentPosition();
          this._lastPosition = pos;
        } catch {
          // GPS unavailable — skip this ping
          return;
        }
      }

      const speed_kmh = pos.speed != null ? pos.speed * 3.6 : 0; // m/s → km/h
      const heading_deg = pos.heading ?? 0;

      await presenceApi.ping({
        lat: pos.lat,
        lng: pos.lng,
        speed_kmh: Math.max(0, speed_kmh),
        heading_deg: heading_deg < 0 ? heading_deg + 360 : heading_deg,
      });
    } catch (e) {
      // Non-fatal — we'll try again next interval
      console.debug("[PresenceBeacon] ping failed:", e);
    }
  }
}

/** Singleton */
export const presenceBeacon = new PresenceBeaconImpl();
