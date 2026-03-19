// src/lib/nav/gpsSmooth.ts
//
// 1-D Kalman filter applied independently to lat and lng.
// Smooths noisy GPS positions so the map puck doesn't jitter and
// off-route detection isn't triggered by GPS noise.
//
// Algorithm: standard 1-D Kalman with position + velocity state.
//   - Process noise Q: how much the true position can change per second
//   - Measurement noise R: how noisy the GPS is (use accuracy_m as proxy)

import type { RoamPosition } from "@/lib/native/geolocation";

// ──────────────────────────────────────────────────────────────
// Kalman filter state per axis
// ──────────────────────────────────────────────────────────────

type KalmanAxis = {
  /** Estimated position (degrees) */
  x: number;
  /** Estimated velocity (degrees/second) */
  v: number;
  /** Covariance matrix: [[p00, p01], [p10, p11]] */
  p00: number;
  p01: number;
  p10: number;
  p11: number;
  /** Last update time (ms epoch) */
  lastT: number;
};

function initAxis(x: number): KalmanAxis {
  return { x, v: 0, p00: 1, p01: 0, p10: 0, p11: 1, lastT: 0 };
}

/**
 * Update a Kalman axis with a new GPS measurement.
 *
 * @param axis  Current state
 * @param z     New measurement (degrees)
 * @param t     Measurement timestamp (ms)
 * @param r     Measurement noise variance (higher = trust less)
 */
// Process noise constants (hoisted outside function to avoid re-evaluation)
const Q_pos = 3e-10;     // position process noise (degrees²/s)
const Q_vel = 8e-10;     // velocity process noise (degrees²/s²)

/**
 * Update a Kalman axis with a new GPS measurement.
 * Mutates `axis` in place and returns it to avoid object allocation on every tick.
 */
function updateAxis(axis: KalmanAxis, z: number, t: number, r: number): KalmanAxis {
  const dt = axis.lastT > 0 ? Math.min((t - axis.lastT) / 1000, 5) : 0.1;

  // ── Predict ──
  const xPred = axis.x + axis.v * dt;
  const vPred = axis.v;

  const dt2 = dt * dt;
  const p00Pred = axis.p00 + dt * (axis.p10 + axis.p01) + dt2 * axis.p11 + Q_pos * dt;
  const p01Pred = axis.p01 + dt * axis.p11;
  const p10Pred = axis.p10 + dt * axis.p11;
  const p11Pred = axis.p11 + Q_vel * dt;

  // ── Update ──
  const y = z - xPred;
  const S = p00Pred + r;
  const K0 = p00Pred / S;
  const K1 = p10Pred / S;

  // Mutate in place - avoids GC pressure in this hot path (~1 Hz)
  axis.x = xPred + K0 * y;
  axis.v = vPred + K1 * y;
  axis.p00 = (1 - K0) * p00Pred;
  axis.p01 = (1 - K0) * p01Pred;
  axis.p10 = p10Pred - K1 * p00Pred;
  axis.p11 = p11Pred - K1 * p01Pred;
  axis.lastT = t;

  return axis;
}

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

export type GpsSmoother = {
  lat: KalmanAxis;
  lng: KalmanAxis;
  /** Smoothed heading (exponential moving average) */
  headingEma: number | null;
};

export function createGpsSmoother(): GpsSmoother {
  return {
    lat: initAxis(0),
    lng: initAxis(0),
    headingEma: null,
  };
}

/**
 * Feed a raw GPS position through the Kalman filter.
 * Returns a smoothed RoamPosition.
 *
 * The original position's metadata (accuracy, altitude, speed, timestamp)
 * are preserved - only lat/lng/heading are smoothed.
 */
export function smoothPosition(smoother: GpsSmoother, pos: RoamPosition): {
  smoothed: RoamPosition;
  smoother: GpsSmoother;
} {
  const t = pos.timestamp || Date.now();

  // Convert accuracy to measurement noise variance.
  // GPS accuracy of 5m → low noise; 50m → high noise
  // Use a minimum floor so we don't over-trust implausibly accurate readings.
  const accuracyM = Math.max(pos.accuracy ?? 10, 3);
  // Convert metres of accuracy to degrees (rough: 1 deg lat ≈ 111,000 m)
  const accuracyDeg = accuracyM / 111_000;
  const r = accuracyDeg * accuracyDeg;  // variance = σ²

  // Initialize axes on first call
  if (smoother.lat.lastT === 0) {
    smoother.lat = initAxis(pos.lat);
    smoother.lat.lastT = t;
  }
  if (smoother.lng.lastT === 0) {
    smoother.lng = initAxis(pos.lng);
    smoother.lng.lastT = t;
  }

  // updateAxis mutates in place - no allocation
  updateAxis(smoother.lat, pos.lat, t, r);
  updateAxis(smoother.lng, pos.lng, t, r);

  // Speed-adaptive heading EMA
  if (pos.heading != null && pos.speed != null && pos.speed > 0.5) {
    if (smoother.headingEma === null) {
      smoother.headingEma = pos.heading;
    } else {
      let diff = pos.heading - smoother.headingEma;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      const alpha = Math.min(0.7, 0.3 + (pos.speed / 30));
      smoother.headingEma = (smoother.headingEma + alpha * diff + 360) % 360;
    }
  }

  // Reuse a single object for the smoothed position to reduce GC pressure
  const smoothed: RoamPosition = {
    ...pos,
    lat: smoother.lat.x,
    lng: smoother.lng.x,
    heading: smoother.headingEma,
  };

  return { smoothed, smoother };
}
