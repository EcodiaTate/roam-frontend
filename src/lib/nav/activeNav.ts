// src/lib/nav/activeNav.ts
//
// Core active navigation state machine.
//
// Pure function: (prevState, gpsPosition, navpack, config) → newState
// Called every GPS tick (~1/sec). No side effects, no subscriptions.
// The parent component calls it and dispatches voice/haptic/UI from the result.

import type { NavPack, NavStep, NavLeg } from "@/lib/types/navigation";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { FatigueState } from "@/lib/nav/fatigue";
import { decodePolyline6 } from "@/lib/nav/polyline6";

// ──────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────

export type ActiveNavConfig = {
  /** Distance from route polyline to consider "off route" (default 100m) */
  offRouteThreshold_m: number;
  /** Consecutive off-route ticks before triggering reroute (default 5) */
  offRouteConsecutive: number;
  /** Distance before maneuver for "preparation" announcement (default 2000m highway, 500m urban) */
  prepDistance_m: number;
  /** Distance before maneuver for "approach" announcement (default 500m highway, 200m urban) */
  approachDistance_m: number;
  /** Distance before maneuver for "action now" announcement (default 50m) */
  imminentDistance_m: number;
  /** Distance to stop to consider "arrived" (default 50m) */
  arrivedDistance_m: number;
  /** Minimum km of straight road before announcing "continue for X km" (default 5km) */
  longStraightThreshold_km: number;
};

export const DEFAULT_NAV_CONFIG: ActiveNavConfig = {
  offRouteThreshold_m: 100,
  offRouteConsecutive: 5,
  prepDistance_m: 2000,
  approachDistance_m: 500,
  imminentDistance_m: 50,
  arrivedDistance_m: 50,
  longStraightThreshold_km: 5,
};

// ──────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────

export type ActiveNavStatus =
  | "idle"
  | "navigating"
  | "rerouting"
  | "off_route"
  | "arrived";

export type ActiveNavState = {
  status: ActiveNavStatus;

  // Position on route
  currentLegIdx: number;
  currentStepIdx: number;
  kmAlongRoute: number;
  kmAlongLeg: number;
  kmAlongStep: number;

  // Current + next maneuver
  currentStep: NavStep | null;
  nextStep: NavStep | null;
  distToNextManeuver_m: number;
  distToStepEnd_m: number;

  // Trip metrics
  distRemaining_m: number;
  durationRemaining_s: number;
  etaTimestamp: number;       // unix ms

  // Off-route detection
  distFromRoute_m: number;
  isOffRoute: boolean;
  offRouteCount: number;      // consecutive off-route positions

  // Speed
  speed_mps: number | null;
  heading: number | null;

  // Fatigue (managed externally, stored here for convenience)
  fatigue: FatigueState;

  // Timestamp of this state update
  updatedAt: number;
};

export function initialActiveNavState(): ActiveNavState {
  return {
    status: "idle",
    currentLegIdx: 0,
    currentStepIdx: 0,
    kmAlongRoute: 0,
    kmAlongLeg: 0,
    kmAlongStep: 0,
    currentStep: null,
    nextStep: null,
    distToNextManeuver_m: 0,
    distToStepEnd_m: 0,
    distRemaining_m: 0,
    durationRemaining_s: 0,
    etaTimestamp: 0,
    distFromRoute_m: 0,
    isOffRoute: false,
    offRouteCount: 0,
    speed_mps: null,
    heading: null,
    fatigue: {
      tripStartedAt: null,
      totalDriveTime_s: 0,
      totalRestTime_s: 0,
      lastRestAt: null,
      timeSinceLastRest_s: 0,
      isResting: false,
      currentRestDuration_s: 0,
      warningLevel: "none",
    },
    updatedAt: 0,
  };
}

// ──────────────────────────────────────────────────────────────
// Geometry helpers
// ──────────────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;
const EARTH_R = 6_371_000;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
    Math.sin(dLng / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type SnapResult = {
  segIdx: number;
  distFromRoute_m: number;
  distAlongLine_m: number;
  nearestLat: number;
  nearestLng: number;
};

/**
 * Snap a point to the nearest segment of a polyline.
 * Returns the segment index, perpendicular distance, and distance along the line.
 */
function snapToLine(
  lat: number, lng: number,
  pts: [number, number][],   // [lat, lng][]
): SnapResult {
  let bestDist = Infinity;
  let bestSegIdx = 0;
  let bestFrac = 0;
  let cumDist = 0;
  let bestCumDist = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const [aLat, aLng] = pts[i];
    const [bLat, bLng] = pts[i + 1];

    // Project point onto segment [A, B]
    const dxAB = bLng - aLng;
    const dyAB = bLat - aLat;
    const dxAP = lng - aLng;
    const dyAP = lat - aLat;
    const lenSq = dxAB * dxAB + dyAB * dyAB;

    let frac = 0;
    if (lenSq > 1e-12) {
      frac = Math.max(0, Math.min(1, (dxAP * dxAB + dyAP * dyAB) / lenSq));
    }

    const projLat = aLat + frac * dyAB;
    const projLng = aLng + frac * dxAB;
    const dist = haversineM(lat, lng, projLat, projLng);

    if (dist < bestDist) {
      bestDist = dist;
      bestSegIdx = i;
      bestFrac = frac;
      bestCumDist = cumDist;
    }

    cumDist += haversineM(aLat, aLng, bLat, bLng);
  }

  // Distance along the line up to the projection point
  const segLen = haversineM(
    pts[bestSegIdx][0], pts[bestSegIdx][1],
    pts[bestSegIdx + 1]?.[0] ?? pts[bestSegIdx][0],
    pts[bestSegIdx + 1]?.[1] ?? pts[bestSegIdx][1],
  );

  const projLat = pts[bestSegIdx][0] + bestFrac * ((pts[bestSegIdx + 1]?.[0] ?? pts[bestSegIdx][0]) - pts[bestSegIdx][0]);
  const projLng = pts[bestSegIdx][1] + bestFrac * ((pts[bestSegIdx + 1]?.[1] ?? pts[bestSegIdx][1]) - pts[bestSegIdx][1]);

  return {
    segIdx: bestSegIdx,
    distFromRoute_m: bestDist,
    distAlongLine_m: bestCumDist + bestFrac * segLen,
    nearestLat: projLat,
    nearestLng: projLng,
  };
}

/**
 * Total length of a decoded polyline in metres.
 */
function polylineLength(pts: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += haversineM(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  return total;
}

// ──────────────────────────────────────────────────────────────
// Flattened step index helper
// ──────────────────────────────────────────────────────────────

type FlatStep = {
  legIdx: number;
  stepIdx: number;
  step: NavStep;
  distFromRouteStart_m: number;   // cumulative distance to this step's maneuver point
};

/**
 * Build a flat list of all steps across all legs, with cumulative distances.
 * This is cached/memoised by the caller (in the React hook).
 */
export function buildFlatSteps(navpack: NavPack): FlatStep[] {
  const flat: FlatStep[] = [];
  let cumDist = 0;

  for (const leg of navpack.primary.legs) {
    const steps = leg.steps ?? [];
    for (let si = 0; si < steps.length; si++) {
      flat.push({
        legIdx: leg.idx,
        stepIdx: si,
        step: steps[si],
        distFromRouteStart_m: cumDist,
      });
      cumDist += steps[si].distance_m;
    }
  }

  return flat;
}

// ──────────────────────────────────────────────────────────────
// Core update function
// ──────────────────────────────────────────────────────────────

/**
 * Pure navigation state update. Called every GPS tick.
 *
 * This function:
 * 1. Snaps GPS position to route polyline
 * 2. Finds which step we're currently on
 * 3. Computes distance to next maneuver
 * 4. Detects off-route condition
 * 5. Detects arrival at destination
 * 6. Updates remaining distance/duration/ETA
 *
 * It does NOT:
 * - Play voice announcements (caller checks state and calls voice engine)
 * - Trigger reroutes (caller checks isOffRoute and triggers corridor reroute)
 * - Update fatigue (caller runs fatigue.updateFatigue separately and merges)
 */
export function updateActiveNav(
  prev: ActiveNavState,
  position: RoamPosition,
  navpack: NavPack,
  flatSteps: FlatStep[],
  routePts: [number, number][],
  routeTotalM: number,
  config: ActiveNavConfig = DEFAULT_NAV_CONFIG,
): ActiveNavState {
  const now = position.timestamp || Date.now();

  if (prev.status === "idle" || prev.status === "arrived") {
    return { ...prev, updatedAt: now };
  }

  if (flatSteps.length === 0 || routePts.length < 2) {
    return { ...prev, updatedAt: now };
  }

  // 1. Snap to route
  const snap = snapToLine(position.lat, position.lng, routePts);
  const kmAlongRoute = snap.distAlongLine_m / 1000;

  // 2. Off-route detection
  const isOffRoute = snap.distFromRoute_m > config.offRouteThreshold_m;
  const offRouteCount = isOffRoute ? prev.offRouteCount + 1 : 0;

  if (offRouteCount >= config.offRouteConsecutive) {
    return {
      ...prev,
      status: "off_route",
      distFromRoute_m: snap.distFromRoute_m,
      isOffRoute: true,
      offRouteCount,
      speed_mps: position.speed,
      heading: position.heading,
      kmAlongRoute,
      updatedAt: now,
    };
  }

  // 3. Find current step — the last flatStep whose start is ≤ our position
  let currentFlatIdx = 0;
  for (let i = flatSteps.length - 1; i >= 0; i--) {
    if (snap.distAlongLine_m >= flatSteps[i].distFromRouteStart_m) {
      currentFlatIdx = i;
      break;
    }
  }

  const currentFlat = flatSteps[currentFlatIdx];
  const nextFlat = currentFlatIdx + 1 < flatSteps.length ? flatSteps[currentFlatIdx + 1] : null;

  // Distance to the END of the current step (= start of next maneuver)
  const stepEndDist_m = currentFlat.distFromRouteStart_m + currentFlat.step.distance_m;
  const distToStepEnd_m = Math.max(0, stepEndDist_m - snap.distAlongLine_m);

  // Distance to the next maneuver point
  const distToNextManeuver_m = nextFlat
    ? Math.max(0, nextFlat.distFromRouteStart_m - snap.distAlongLine_m)
    : distToStepEnd_m;

  // Distance along current step
  const kmAlongStep = Math.max(0, snap.distAlongLine_m - currentFlat.distFromRouteStart_m) / 1000;

  // Distance along current leg
  const legStartDist = flatSteps.find(f => f.legIdx === currentFlat.legIdx)?.distFromRouteStart_m ?? 0;
  const kmAlongLeg = Math.max(0, snap.distAlongLine_m - legStartDist) / 1000;

  // 4. Check arrival (last step, close to end)
  const isLastStep = currentFlatIdx === flatSteps.length - 1;
  const lastStep = flatSteps[flatSteps.length - 1];
  const distToEnd_m = Math.max(0, routeTotalM - snap.distAlongLine_m);

  if (isLastStep && distToEnd_m < config.arrivedDistance_m) {
    return {
      ...prev,
      status: "arrived",
      currentLegIdx: currentFlat.legIdx,
      currentStepIdx: currentFlat.stepIdx,
      currentStep: currentFlat.step,
      nextStep: null,
      distToNextManeuver_m: 0,
      distToStepEnd_m: 0,
      distRemaining_m: 0,
      durationRemaining_s: 0,
      etaTimestamp: now,
      kmAlongRoute,
      kmAlongLeg,
      kmAlongStep,
      distFromRoute_m: snap.distFromRoute_m,
      isOffRoute: false,
      offRouteCount: 0,
      speed_mps: position.speed,
      heading: position.heading,
      updatedAt: now,
    };
  }

  // 5. Remaining distance + duration
  const distRemaining_m = Math.max(0, routeTotalM - snap.distAlongLine_m);

  // Estimate remaining duration proportionally from total route
  const totalDist = navpack.primary.distance_m || 1;
  const totalDur = navpack.primary.duration_s || 1;
  const fractionRemaining = distRemaining_m / totalDist;
  const durationRemaining_s = Math.max(0, Math.round(totalDur * fractionRemaining));

  // If we have speed, use it for a better ETA
  let etaTimestamp: number;
  if (position.speed && position.speed > 1) {
    // Speed-based ETA
    etaTimestamp = now + (distRemaining_m / position.speed) * 1000;
  } else {
    // Duration-based ETA
    etaTimestamp = now + durationRemaining_s * 1000;
  }

  return {
    ...prev,
    status: "navigating",
    currentLegIdx: currentFlat.legIdx,
    currentStepIdx: currentFlat.stepIdx,
    currentStep: currentFlat.step,
    nextStep: nextFlat?.step ?? null,
    distToNextManeuver_m,
    distToStepEnd_m,
    distRemaining_m,
    durationRemaining_s,
    etaTimestamp,
    kmAlongRoute,
    kmAlongLeg,
    kmAlongStep,
    distFromRoute_m: snap.distFromRoute_m,
    isOffRoute,
    offRouteCount,
    speed_mps: position.speed,
    heading: position.heading,
    updatedAt: now,
  };
}

// ──────────────────────────────────────────────────────────────
// Start / stop helpers
// ──────────────────────────────────────────────────────────────

/**
 * Transition from idle to navigating.
 * Called when user taps "Start Navigation".
 */
export function startNavigation(navpack: NavPack): ActiveNavState {
  const state = initialActiveNavState();
  const firstStep = navpack.primary.legs[0]?.steps?.[0] ?? null;
  const nextStep = navpack.primary.legs[0]?.steps?.[1] ?? null;

  return {
    ...state,
    status: "navigating",
    currentStep: firstStep,
    nextStep,
    distRemaining_m: navpack.primary.distance_m,
    durationRemaining_s: navpack.primary.duration_s,
    etaTimestamp: Date.now() + navpack.primary.duration_s * 1000,
    fatigue: {
      ...state.fatigue,
      tripStartedAt: Date.now(),
    },
    updatedAt: Date.now(),
  };
}

/**
 * Transition back to idle.
 * Called when user taps "End Navigation".
 */
export function stopNavigation(prev: ActiveNavState): ActiveNavState {
  return {
    ...initialActiveNavState(),
    fatigue: prev.fatigue,  // preserve fatigue data for the session
    updatedAt: Date.now(),
  };
}

/**
 * After a successful corridor reroute, reset navigation state
 * with the new navpack while preserving fatigue.
 */
export function resetAfterReroute(prev: ActiveNavState, newNavpack: NavPack): ActiveNavState {
  const started = startNavigation(newNavpack);
  return {
    ...started,
    fatigue: prev.fatigue,
    updatedAt: Date.now(),
  };
}