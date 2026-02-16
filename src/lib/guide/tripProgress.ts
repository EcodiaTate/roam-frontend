// src/lib/guide/tripProgress.ts
"use client";

import type { TripStop } from "@/lib/types/trip";
import type { NavPack, NavLeg } from "@/lib/types/navigation";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { TripProgress } from "@/lib/types/guide";

// ──────────────────────────────────────────────────────────────
// Geo utilities
// ──────────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;
const EARTH_R_KM = 6371;

/** Haversine distance in km between two lat/lng points */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLng = (lng2 - lng1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) *
      Math.cos(lat2 * DEG2RAD) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Proximity threshold in km — if user is within this distance of a stop, mark visited */
const VISIT_PROXIMITY_KM = 0.5; // 500m

// ──────────────────────────────────────────────────────────────
// Current leg detection
// ──────────────────────────────────────────────────────────────

/**
 * Find which leg the user is currently on by checking which consecutive
 * stop pair the user is closest to (minimum "excess distance" heuristic).
 *
 * excess = dist(user, stop_i) + dist(user, stop_i+1) - dist(stop_i, stop_i+1)
 * The leg with minimum excess is the one the user is on or nearest to.
 */
function findCurrentLeg(
  userLat: number,
  userLng: number,
  stops: TripStop[],
): { legIdx: number; nearestStopIdx: number } {
  if (stops.length < 2) {
    return { legIdx: 0, nearestStopIdx: 0 };
  }

  let bestLeg = 0;
  let bestExcess = Infinity;

  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];

    const dUser1 = haversineKm(userLat, userLng, s1.lat, s1.lng);
    const dUser2 = haversineKm(userLat, userLng, s2.lat, s2.lng);
    const dStops = haversineKm(s1.lat, s1.lng, s2.lat, s2.lng);

    // Excess: how much further the user is from the straight line between stops
    const excess = dUser1 + dUser2 - dStops;

    if (excess < bestExcess) {
      bestExcess = excess;
      bestLeg = i;
    }
  }

  // Nearest stop: compare user to the two stops of the best leg
  const s1 = stops[bestLeg];
  const s2 = stops[bestLeg + 1];
  const d1 = haversineKm(userLat, userLng, s1.lat, s1.lng);
  const d2 = haversineKm(userLat, userLng, s2.lat, s2.lng);

  const nearestStopIdx = d1 <= d2 ? bestLeg : bestLeg + 1;

  return { legIdx: bestLeg, nearestStopIdx };
}

// ──────────────────────────────────────────────────────────────
// km from start estimation
// ──────────────────────────────────────────────────────────────

/**
 * Estimate km from route start using leg distances from navpack.
 * Sum completed legs + interpolate within current leg.
 */
function estimateKmFromStart(
  legIdx: number,
  userLat: number,
  userLng: number,
  stops: TripStop[],
  legs: NavLeg[],
): { kmFromStart: number; totalKm: number } {
  let totalKm = 0;
  for (const leg of legs) {
    totalKm += leg.distance_m / 1000;
  }

  // Sum completed legs
  let kmFromStart = 0;
  for (let i = 0; i < legIdx && i < legs.length; i++) {
    kmFromStart += legs[i].distance_m / 1000;
  }

  // Interpolate within current leg
  if (legIdx < legs.length && legIdx < stops.length - 1) {
    const legStart = stops[legIdx];
    const legEnd = stops[legIdx + 1];

    const legLenKm = legs[legIdx].distance_m / 1000;
    const straightLineKm = haversineKm(
      legStart.lat,
      legStart.lng,
      legEnd.lat,
      legEnd.lng,
    );

    if (straightLineKm > 0.01) {
      // How far along this leg is the user (as a fraction of straight-line distance)
      const dFromStart = haversineKm(
        userLat,
        userLng,
        legStart.lat,
        legStart.lng,
      );
      const fraction = Math.min(1, Math.max(0, dFromStart / straightLineKm));
      kmFromStart += fraction * legLenKm;
    }
  }

  return { kmFromStart, totalKm };
}

// ──────────────────────────────────────────────────────────────
// Visited stop detection
// ──────────────────────────────────────────────────────────────

/**
 * Update the visited set: add any stop the user is within proximity of.
 * This is sticky — once visited, always visited.
 */
function updateVisitedStops(
  userLat: number,
  userLng: number,
  stops: TripStop[],
  prevVisited: string[],
): string[] {
  const visited = new Set(prevVisited);

  for (const stop of stops) {
    const id = stop.id;
    if (!id) continue;
    if (visited.has(id)) continue;

    const d = haversineKm(userLat, userLng, stop.lat, stop.lng);
    if (d <= VISIT_PROXIMITY_KM) {
      visited.add(id);
    }
  }

  return Array.from(visited);
}

// ──────────────────────────────────────────────────────────────
// Main: compute trip progress
// ──────────────────────────────────────────────────────────────

export type ComputeProgressArgs = {
  position: RoamPosition;
  stops: TripStop[];
  navpack: NavPack | null;
  prevProgress: TripProgress | null;
};

/**
 * Compute the user's current progress along the trip.
 *
 * Pure function (no side effects). Call this when:
 * - Page boots with GPS fix
 * - Before sending a guide message (to inject latest position)
 * - Periodically for the progress bar
 */
export function computeTripProgress(args: ComputeProgressArgs): TripProgress {
  const { position, stops, navpack, prevProgress } = args;

  const userLat = position.lat;
  const userLng = position.lng;

  // Find current leg and nearest stop
  const { legIdx, nearestStopIdx } = findCurrentLeg(userLat, userLng, stops);

  // Estimate km from start
  const legs = navpack?.primary?.legs ?? [];
  const { kmFromStart, totalKm } = estimateKmFromStart(
    legIdx,
    userLat,
    userLng,
    stops,
    legs,
  );

  // Update visited stops (sticky set)
  const prevVisited = prevProgress?.visited_stop_ids ?? [];
  const visitedStopIds = updateVisitedStops(
    userLat,
    userLng,
    stops,
    prevVisited,
  );

  // Use navpack total if available, otherwise use haversine sum
  const routeTotalKm =
    navpack?.primary?.distance_m != null
      ? navpack.primary.distance_m / 1000
      : totalKm;

  const kmRemaining = Math.max(0, routeTotalKm - kmFromStart);

  // Local time
  const now = new Date();
  let timezone = "Australia/Brisbane";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // fallback
  }

  return {
    user_lat: userLat,
    user_lng: userLng,
    user_accuracy_m: position.accuracy,
    user_heading: position.heading,
    user_speed_mps: position.speed,

    current_stop_idx: nearestStopIdx,
    current_leg_idx: legIdx,

    visited_stop_ids: visitedStopIds,

    km_from_start: Math.round(kmFromStart * 10) / 10,
    km_remaining: Math.round(kmRemaining * 10) / 10,
    total_km: Math.round(routeTotalKm * 10) / 10,

    local_time_iso: now.toISOString(),
    timezone,

    updated_at: now.toISOString(),
  };
}

/**
 * Compute distance from a position to each stop, returning sorted by distance.
 * Useful for the UI to show "nearest stops" or for the LLM context.
 */
export function stopsWithDistances(
  userLat: number,
  userLng: number,
  stops: TripStop[],
): Array<TripStop & { distance_km: number }> {
  return stops
    .map((s) => ({
      ...s,
      distance_km:
        Math.round(haversineKm(userLat, userLng, s.lat, s.lng) * 10) / 10,
    }))
    .sort((a, b) => a.distance_km - b.distance_km);
}