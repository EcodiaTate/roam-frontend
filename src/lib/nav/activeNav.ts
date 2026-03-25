// src/lib/nav/activeNav.ts
//
// Core active navigation state machine.
//
// Pure function: (prevState, gpsPosition, navpack, config) → newState
// Called every GPS tick (~1/sec). No side effects, no subscriptions.
// The parent component calls it and dispatches voice/haptic/UI from the result.

import type { NavPack, NavStep } from "@/lib/types/navigation";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { FatigueState } from "@/lib/nav/fatigue";
import { haversineM, type PolylineIndex, snapToPolylineIndexed } from "@/lib/nav/snapToRoute";

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

  // Trip metrics (full journey)
  distRemaining_m: number;
  durationRemaining_s: number;
  etaTimestamp: number;       // unix ms

  // Leg metrics (next stop only) - for leg-by-leg navigation
  legDistRemaining_m: number;
  legDurationRemaining_s: number;
  legEtaTimestamp: number;           // unix ms - ETA to next stop
  nextStopName: string | null;       // name of the next stop
  totalLegs: number;                 // total number of legs in the trip

  // Off-route detection
  distFromRoute_m: number;
  isOffRoute: boolean;
  offRouteCount: number;      // consecutive off-route positions

  // Speed
  speed_mps: number | null;
  heading: number | null;

  // ETA learning - rolling speed average for better predictions
  rollingSpeed_mps: number;        // 5-min rolling average actual speed
  plannedSpeed_mps: number;        // planned speed from route (distance/duration)
  speedRatio: number;              // rollingSpeed / plannedSpeed (1.0 = on plan)

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
    legDistRemaining_m: 0,
    legDurationRemaining_s: 0,
    legEtaTimestamp: 0,
    nextStopName: null,
    totalLegs: 0,
    distFromRoute_m: 0,
    isOffRoute: false,
    offRouteCount: 0,
    speed_mps: null,
    heading: null,
    rollingSpeed_mps: 0,
    plannedSpeed_mps: 0,
    speedRatio: 1.0,
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

// haversineM imported from @/lib/nav/snapToRoute

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

/**
 * Pre-compute cumulative leg boundaries: for each leg, the cumulative distance_m
 * from route start to the end of that leg, plus the leg's own distance/duration.
 * Memoised by the caller alongside buildFlatSteps.
 */
export type LegBoundary = {
  legIdx: number;
  startDist_m: number;  // cumulative distance from route start to leg start
  endDist_m: number;    // cumulative distance from route start to leg end
  distance_m: number;   // leg's own distance
  duration_s: number;   // leg's own duration
  toStopId: string | null;
  toStopName: string | null;
};

export function buildLegBoundaries(navpack: NavPack): LegBoundary[] {
  const boundaries: LegBoundary[] = [];
  let cumDist = 0;
  const stops = navpack.req.stops;

  for (const leg of navpack.primary.legs) {
    // Find the destination stop for this leg
    const toIdx = leg.idx + 1;
    const toStop = toIdx < stops.length ? stops[toIdx] : null;

    boundaries.push({
      legIdx: leg.idx,
      startDist_m: cumDist,
      endDist_m: cumDist + leg.distance_m,
      distance_m: leg.distance_m,
      duration_s: leg.duration_s,
      toStopId: leg.to_stop_id ?? toStop?.id ?? null,
      toStopName: toStop?.name ?? null,
    });
    cumDist += leg.distance_m;
  }

  return boundaries;
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
  legBoundaries?: LegBoundary[],
  polylineIndex?: PolylineIndex | null,
): ActiveNavState {
  const now = position.timestamp || Date.now();

  if (prev.status === "idle" || prev.status === "arrived") {
    return { ...prev, updatedAt: now };
  }

  if (flatSteps.length === 0 || routePts.length < 2) {
    return { ...prev, updatedAt: now };
  }

  // 1. Snap to route — use spatial index (O(1)) when available, fall back to linear scan
  let snap: SnapResult;
  if (polylineIndex) {
    const indexed = snapToPolylineIndexed({ lat: position.lat, lng: position.lng }, polylineIndex);
    snap = {
      segIdx: indexed.segIdx,
      distFromRoute_m: indexed.distance_m,
      distAlongLine_m: indexed.km * 1000,
      nearestLat: 0, // not needed downstream
      nearestLng: 0,
    };
  } else {
    snap = snapToLine(position.lat, position.lng, routePts);
  }
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

  // 3. Find current step - the last flatStep whose start is ≤ our position
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
      legDistRemaining_m: 0,
      legDurationRemaining_s: 0,
      legEtaTimestamp: now,
      nextStopName: null,
      totalLegs: navpack.primary.legs.length,
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

  // Planned speed from the route itself
  const totalDist = navpack.primary.distance_m || 1;
  const totalDur = navpack.primary.duration_s || 1;
  const plannedSpeed_mps = totalDist / totalDur;

  // Rolling speed average: exponential moving average over ~5 min of GPS ticks.
  // Alpha ~0.01 gives 99% weight to last ~100 ticks (≈2 min at 1Hz GPS).
  const ALPHA = 0.01;
  const currentSpeed = position.speed ?? 0;
  const prevRolling = prev.rollingSpeed_mps || plannedSpeed_mps;
  const rollingSpeed_mps = currentSpeed > 1
    ? prevRolling * (1 - ALPHA) + currentSpeed * ALPHA
    : prevRolling;

  // Speed ratio: how fast we're actually going vs route plan.
  // < 1.0 = slower than planned, > 1.0 = faster.
  const speedRatio = plannedSpeed_mps > 0.1
    ? Math.min(Math.max(rollingSpeed_mps / plannedSpeed_mps, 0.3), 2.0)
    : 1.0;

  // ETA: use the learned speed ratio to correct the planned duration.
  // This auto-adjusts if user consistently drives 80 on a road planned for 110.
  const fractionRemaining = distRemaining_m / totalDist;
  const plannedRemaining_s = totalDur * fractionRemaining;
  const adjustedRemaining_s = speedRatio > 0.1
    ? plannedRemaining_s / speedRatio
    : plannedRemaining_s;
  const durationRemaining_s = Math.max(0, Math.round(adjustedRemaining_s));

  // If we have a live speed, blend it: 70% learned ETA + 30% instantaneous.
  // Prevents ETA from jumping wildly when momentarily stopped/speeding.
  let etaTimestamp: number;
  if (currentSpeed > 1) {
    const instantEta_ms = (distRemaining_m / currentSpeed) * 1000;
    const learnedEta_ms = durationRemaining_s * 1000;
    etaTimestamp = now + (learnedEta_ms * 0.7 + instantEta_ms * 0.3);
  } else {
    etaTimestamp = now + durationRemaining_s * 1000;
  }

  // 6. Leg-level metrics - distance/duration/ETA to the next stop only
  const currentLegBoundary = legBoundaries?.find(b => b.legIdx === currentFlat.legIdx);
  let legDistRemaining_m = distRemaining_m;
  let legDurationRemaining_s = durationRemaining_s;
  let legEtaTimestamp = etaTimestamp;
  let nextStopName: string | null = null;

  if (currentLegBoundary) {
    legDistRemaining_m = Math.max(0, currentLegBoundary.endDist_m - snap.distAlongLine_m);
    // Compute fraction of this leg remaining, then scale by leg's planned duration
    const legFractionRemaining = currentLegBoundary.distance_m > 0
      ? legDistRemaining_m / currentLegBoundary.distance_m
      : 0;
    const legPlannedRemaining_s = currentLegBoundary.duration_s * legFractionRemaining;
    // Apply speed ratio correction (same approach as trip-level ETA)
    const legAdjusted = speedRatio > 0.1 ? legPlannedRemaining_s / speedRatio : legPlannedRemaining_s;
    legDurationRemaining_s = Math.max(0, Math.round(legAdjusted));

    if (currentSpeed > 1) {
      const legInstant_ms = (legDistRemaining_m / currentSpeed) * 1000;
      const legLearned_ms = legDurationRemaining_s * 1000;
      legEtaTimestamp = now + (legLearned_ms * 0.7 + legInstant_ms * 0.3);
    } else {
      legEtaTimestamp = now + legDurationRemaining_s * 1000;
    }

    nextStopName = currentLegBoundary.toStopName;
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
    legDistRemaining_m,
    legDurationRemaining_s,
    legEtaTimestamp,
    nextStopName,
    totalLegs: navpack.primary.legs.length,
    kmAlongRoute,
    kmAlongLeg,
    kmAlongStep,
    distFromRoute_m: snap.distFromRoute_m,
    isOffRoute,
    offRouteCount,
    speed_mps: position.speed,
    heading: position.heading,
    rollingSpeed_mps,
    plannedSpeed_mps,
    speedRatio,
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
  const firstLeg = navpack.primary.legs[0];
  const firstLegToStop = navpack.req.stops[1] ?? null;

  return {
    ...state,
    status: "navigating",
    currentStep: firstStep,
    nextStep,
    distRemaining_m: navpack.primary.distance_m,
    durationRemaining_s: navpack.primary.duration_s,
    etaTimestamp: Date.now() + navpack.primary.duration_s * 1000,
    legDistRemaining_m: firstLeg?.distance_m ?? navpack.primary.distance_m,
    legDurationRemaining_s: firstLeg?.duration_s ?? navpack.primary.duration_s,
    legEtaTimestamp: Date.now() + (firstLeg?.duration_s ?? navpack.primary.duration_s) * 1000,
    nextStopName: firstLegToStop?.name ?? null,
    totalLegs: navpack.primary.legs.length,
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
