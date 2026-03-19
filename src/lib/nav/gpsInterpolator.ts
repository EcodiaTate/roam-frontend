// src/lib/nav/gpsInterpolator.ts
//
// 60 fps GPS interpolation engine.
//
// Problem: GPS fires ~1 Hz. Between ticks the map puck sits still then jumps.
// Google Maps solves this by interpolating between the last two known positions
// at 60 fps, predicting ahead using velocity, and smoothly blending when a new
// fix arrives.
//
// This module provides a standalone interpolation loop (requestAnimationFrame)
// that:
//   1. Accepts raw Kalman-smoothed GPS fixes (~1 Hz)
//   2. Interpolates position at 60 fps between fixes using velocity prediction
//   3. When a new fix arrives, blends from the predicted position to the new
//      fix over a short window (avoids snap/jump)
//   4. Emits interpolated positions via a callback for map rendering
//
// The output should drive the map camera and user puck DIRECTLY, bypassing
// React state for zero-latency updates.

import type { RoamPosition } from "@/lib/native/geolocation";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type InterpolatedPosition = {
  lat: number;
  lng: number;
  heading: number;
  speed: number;      // m/s
  accuracy: number;
  altitude: number | null;
  timestamp: number;  // interpolated timestamp
};

export type OnFrameCallback = (pos: InterpolatedPosition) => void;

type Fix = {
  lat: number;
  lng: number;
  heading: number;   // degrees
  speed: number;     // m/s
  accuracy: number;
  altitude: number | null;
  receivedAt: number; // performance.now() when fix was received
  timestamp: number;  // GPS timestamp
};

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

/** How long to blend from predicted→actual when a new fix arrives (ms) */
const BLEND_DURATION_MS = 300;

/** Max age of a fix before we stop predicting ahead (ms) */
const MAX_PREDICTION_MS = 2000;

/** Speed below which we don't predict movement (m/s) */
const STATIONARY_THRESHOLD = 0.3;

/** Degrees per meter at equator (approximate) */
const DEG_PER_M = 1 / 111_320;

/** Heading interpolation: max degrees to turn per frame at 60fps */
const MAX_HEADING_STEP_PER_FRAME = 4; // ~240°/s max turn rate

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/** Shortest angular distance from a to b (signed, -180..+180) */
function angleDiff(a: number, b: number): number {
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Interpolate heading with wraparound */
function lerpHeading(from: number, to: number, t: number): number {
  const diff = angleDiff(from, to);
  return ((from + diff * t) % 360 + 360) % 360;
}

/** Clamp heading step per frame to avoid spinning */
function stepHeading(current: number, target: number): number {
  const diff = angleDiff(current, target);
  const clamped = Math.max(-MAX_HEADING_STEP_PER_FRAME, Math.min(MAX_HEADING_STEP_PER_FRAME, diff));
  return ((current + clamped) % 360 + 360) % 360;
}

/**
 * Predict position `dt` seconds ahead given a fix.
 * Uses simple dead reckoning: pos += velocity * dt
 */
function predict(fix: Fix, dt_s: number): { lat: number; lng: number } {
  if (fix.speed < STATIONARY_THRESHOLD || dt_s <= 0) {
    return { lat: fix.lat, lng: fix.lng };
  }
  const headingRad = (fix.heading * Math.PI) / 180;
  const distM = fix.speed * dt_s;
  const dLat = Math.cos(headingRad) * distM * DEG_PER_M;
  // Adjust for latitude (longitude degrees are narrower away from equator)
  const dLng = Math.sin(headingRad) * distM * DEG_PER_M / Math.cos((fix.lat * Math.PI) / 180);
  return {
    lat: fix.lat + dLat,
    lng: fix.lng + dLng,
  };
}

// ──────────────────────────────────────────────────────────────
// Interpolator class
// ──────────────────────────────────────────────────────────────

export class GpsInterpolator {
  private currentFix: Fix | null = null;
  private previousFix: Fix | null = null;
  private rafId: number | null = null;
  private onFrame: OnFrameCallback;
  private running = false;

  /** Swap the frame callback (e.g. when the consuming component mounts). */
  setOnFrame(cb: OnFrameCallback): void {
    this.onFrame = cb;
  }

  // Blend state: when a new fix arrives, we blend from the position we were
  // showing (predicted from old fix) to the new fix's position
  private blendStartPos: { lat: number; lng: number; heading: number } | null = null;
  private blendStartTime = 0;

  // The last emitted position (for blend source)
  private lastEmitted: InterpolatedPosition | null = null;

  constructor(onFrame: OnFrameCallback) {
    this.onFrame = onFrame;
  }

  /**
   * Feed a new Kalman-smoothed GPS fix into the interpolator.
   * Call this from the GPS watch callback (~1 Hz).
   */
  pushFix(pos: RoamPosition): void {
    const now = performance.now();

    const fix: Fix = {
      lat: pos.lat,
      lng: pos.lng,
      heading: pos.heading ?? this.currentFix?.heading ?? 0,
      speed: pos.speed ?? 0,
      accuracy: pos.accuracy ?? 10,
      altitude: pos.altitude,
      receivedAt: now,
      timestamp: pos.timestamp || Date.now(),
    };

    this.previousFix = this.currentFix;
    this.currentFix = fix;

    // Start blend from wherever we were showing to new fix position
    if (this.lastEmitted) {
      this.blendStartPos = {
        lat: this.lastEmitted.lat,
        lng: this.lastEmitted.lng,
        heading: this.lastEmitted.heading,
      };
      this.blendStartTime = now;
    }
  }

  /** Start the rAF loop. Safe to call multiple times. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  /** Stop the rAF loop. */
  stop(): void {
    this.running = false;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.currentFix = null;
    this.previousFix = null;
    this.blendStartPos = null;
    this.lastEmitted = null;
  }

  /** Whether the interpolator is running */
  get isRunning(): boolean {
    return this.running;
  }

  // ── Private: animation frame ──

  private tick = (): void => {
    if (!this.running) return;

    if (this.currentFix) {
      const now = performance.now();
      const pos = this.computePosition(now);
      this.lastEmitted = pos;
      this.onFrame(pos);
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private computePosition(now: number): InterpolatedPosition {
    const fix = this.currentFix!;
    const age_s = (now - fix.receivedAt) / 1000;

    // Clamp prediction: don't extrapolate if fix is too old
    const predictDt = Math.min(age_s, MAX_PREDICTION_MS / 1000);

    // Dead-reckon from the current fix
    const predicted = predict(fix, predictDt);

    // Target heading: use the fix's heading
    const targetHeading = fix.heading;

    // If we have a blend in progress (new fix just arrived), blend from
    // the old visual position to the new predicted position
    let lat = predicted.lat;
    let lng = predicted.lng;
    let heading = targetHeading;

    if (this.blendStartPos && (now - this.blendStartTime) < BLEND_DURATION_MS) {
      const t = (now - this.blendStartTime) / BLEND_DURATION_MS;
      // Ease-out cubic for smooth deceleration into the new position
      const ease = 1 - Math.pow(1 - t, 3);
      lat = this.blendStartPos.lat + (predicted.lat - this.blendStartPos.lat) * ease;
      lng = this.blendStartPos.lng + (predicted.lng - this.blendStartPos.lng) * ease;
      heading = lerpHeading(this.blendStartPos.heading, targetHeading, ease);
    } else {
      // No blend, or blend finished - clear blend state
      this.blendStartPos = null;

      // Step heading smoothly toward target (no abrupt rotation)
      if (this.lastEmitted) {
        heading = stepHeading(this.lastEmitted.heading, targetHeading);
      }
    }

    return {
      lat,
      lng,
      heading,
      speed: fix.speed,
      accuracy: fix.accuracy,
      altitude: fix.altitude,
      timestamp: fix.timestamp + (now - fix.receivedAt),
    };
  }
}
