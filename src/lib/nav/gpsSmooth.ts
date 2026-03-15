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
function updateAxis(axis: KalmanAxis, z: number, t: number, r: number): KalmanAxis {
  // dt in seconds; clamp to avoid huge jumps after pause
  const dt = axis.lastT > 0 ? Math.min((t - axis.lastT) / 1000, 5) : 0.1;

  // Process noise (tune this for GPS smoothness vs. responsiveness)
  // Lower Q = smoother but more lag; higher Q = more jitter but more responsive
  const Q_pos = 0.5e-10;   // position process noise (degrees²/s)
  const Q_vel = 2e-10;     // velocity process noise (degrees²/s²)

  // ── Predict ──
  const xPred = axis.x + axis.v * dt;
  const vPred = axis.v;

  // Predicted covariance (constant acceleration model)
  const dt2 = dt * dt;
  const p00Pred = axis.p00 + dt * (axis.p10 + axis.p01) + dt2 * axis.p11 + Q_pos * dt;
  const p01Pred = axis.p01 + dt * axis.p11;
  const p10Pred = axis.p10 + dt * axis.p11;
  const p11Pred = axis.p11 + Q_vel * dt;

  // ── Update ──
  // Innovation (residual)
  const y = z - xPred;

  // Innovation covariance
  const S = p00Pred + r;

  // Kalman gain
  const K0 = p00Pred / S;  // gain for position
  const K1 = p10Pred / S;  // gain for velocity

  // Updated state
  const xNew = xPred + K0 * y;
  const vNew = vPred + K1 * y;

  // Updated covariance (Joseph form for numerical stability)
  const p00New = (1 - K0) * p00Pred;
  const p01New = (1 - K0) * p01Pred;
  const p10New = p10Pred - K1 * p00Pred;
  const p11New = p11Pred - K1 * p01Pred;

  return { x: xNew, v: vNew, p00: p00New, p01: p01New, p10: p10New, p11: p11New, lastT: t };
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
 * are preserved — only lat/lng/heading are smoothed.
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
  let latAxis = smoother.lat.lastT === 0 ? initAxis(pos.lat) : smoother.lat;
  let lngAxis = smoother.lng.lastT === 0 ? initAxis(pos.lng) : smoother.lng;

  latAxis = updateAxis({ ...latAxis, lastT: latAxis.lastT || t }, pos.lat, t, r);
  lngAxis = updateAxis({ ...lngAxis, lastT: lngAxis.lastT || t }, pos.lng, t, r);

  // Smooth heading with exponential moving average (alpha=0.3 → 30% new, 70% old)
  // Only update when moving (avoids wild heading swings when stationary)
  let headingEma = smoother.headingEma;
  if (pos.heading != null && pos.speed != null && pos.speed > 0.5) {
    if (headingEma === null) {
      headingEma = pos.heading;
    } else {
      // Handle wraparound (e.g. 350° → 10° should average near 0°, not 180°)
      let diff = pos.heading - headingEma;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      headingEma = (headingEma + 0.3 * diff + 360) % 360;
    }
  }

  const smoothed: RoamPosition = {
    ...pos,
    lat: latAxis.x,
    lng: lngAxis.x,
    heading: headingEma,
  };

  return {
    smoothed,
    smoother: { lat: latAxis, lng: lngAxis, headingEma },
  };
}
