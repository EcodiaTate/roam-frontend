// src/lib/nav/fuelAnalysis.ts
// ──────────────────────────────────────────────────────────────
// Fuel Range Intelligence — Core Analysis Engine
//
// Pure functions — no side effects, no API calls. Works offline.
// Operates on data already on-device (polyline + PlacesPack).
// ──────────────────────────────────────────────────────────────

import { decodePolyline6 } from "./polyline6";
import { cumulativeKm, snapToPolyline, totalRouteKm } from "./snapToRoute";

import type { PlaceItem } from "@/lib/types/places";
import type {
  VehicleFuelProfile,
  FuelStation,
  FuelLeg,
  FuelWarning,
  FuelAnalysis,
  FuelTrackingState,
  DEFAULT_FUEL_PROFILE,
} from "@/lib/types/fuel";

/** Max perpendicular snap distance (metres) for a station to be "on route" */
const MAX_SNAP_DISTANCE_M = 2000;

/** Categories in PlacesPack that represent fuel */
const FUEL_CATEGORIES = new Set(["fuel", "ev_charging"]);

/** Filter categories relevant to the user's fuel type */
function relevantCategories(fuelType: string): Set<string> {
  if (fuelType === "ev") return new Set(["ev_charging"]);
  // For petrol/diesel/lpg, fuel stations are relevant (EV chargers are not)
  return new Set(["fuel"]);
}

// ──────────────────────────────────────────────────────────────
// Main analysis function
// ──────────────────────────────────────────────────────────────

/**
 * Analyse fuel coverage for a route.
 *
 * @param routeGeometry  Polyline6 string of the route
 * @param places         All PlaceItems from the corridor PlacesPack
 * @param profile        Vehicle fuel profile
 * @param routeKey       Route key for tagging the analysis
 */
export function analyzeFuel(
  routeGeometry: string,
  places: PlaceItem[],
  profile: VehicleFuelProfile,
  routeKey: string,
): FuelAnalysis {
  // 1. Decode polyline → coordinate array
  const decoded = decodePolyline6(routeGeometry);
  if (decoded.length < 2) {
    return emptyAnalysis(profile, routeKey);
  }

  // 2. Build cumulative km array
  const cumKm = cumulativeKm(decoded);
  const routeTotalKm = totalRouteKm(cumKm);

  // 3. Filter places to fuel-relevant categories
  const cats = relevantCategories(profile.fuel_type);
  const fuelPlaces = places.filter(
    (p) => FUEL_CATEGORIES.has(p.category) && cats.has(p.category),
  );

  // 4. Snap each fuel station to the polyline
  const stations: FuelStation[] = [];
  for (const p of fuelPlaces) {
    const snap = snapToPolyline({ lat: p.lat, lng: p.lng }, decoded, cumKm);

    // Skip stations too far from route
    if (snap.distance_m > MAX_SNAP_DISTANCE_M) continue;

    const station: FuelStation = {
      place_id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      category: p.category as "fuel" | "ev_charging",
      km_along_route: snap.km,
      snap_distance_m: snap.distance_m,
      side: snap.side,
      brand: p.extra?.brand ?? undefined,
      hours: p.extra?.hours ?? undefined,
      has_diesel: p.extra?.has_diesel ?? undefined,
      has_unleaded: p.extra?.has_unleaded ?? undefined,
    };

    // Additional fuel-type filtering for diesel/unleaded
    if (profile.fuel_type === "diesel" && station.has_diesel === false) continue;
    if (profile.fuel_type === "unleaded" && station.has_unleaded === false) continue;

    stations.push(station);
  }

  // 5. Sort by km_along_route
  stations.sort((a, b) => a.km_along_route - b.km_along_route);

  // 6. Deduplicate stations that are very close together (< 0.5 km)
  const deduped = deduplicateStations(stations);

  // 7. Decompose into fuel legs
  const legs = buildFuelLegs(deduped, routeTotalKm, profile);

  // 8. Generate warnings
  const warnings = generateWarnings(legs, deduped, profile);

  // 9. Compute summary
  const max_gap_km = legs.length > 0
    ? Math.max(...legs.map((l) => l.distance_km))
    : 0;

  return {
    profile,
    stations: deduped,
    legs,
    warnings,
    max_gap_km,
    total_fuel_stops: deduped.length,
    has_critical_gaps: legs.some((l) => l.gap_exceeds_range),
    computed_at: new Date().toISOString(),
    route_key: routeKey,
  };
}

/**
 * Re-analyze fuel for a corridor reroute.
 * Takes corridor node coordinates instead of polyline6.
 */
export function reanalyzeFuelForReroute(
  reroutePolyline6: string,
  cachedPlaces: PlaceItem[],
  profile: VehicleFuelProfile,
  routeKey: string,
): FuelAnalysis {
  // Same logic — just a different polyline source
  return analyzeFuel(reroutePolyline6, cachedPlaces, profile, routeKey);
}

// ──────────────────────────────────────────────────────────────
// Live fuel tracking (GPS position → fuel state)
// ──────────────────────────────────────────────────────────────

/**
 * Given the user's current position along the route (as km),
 * compute the live fuel tracking state.
 */
export function computeFuelTracking(
  analysis: FuelAnalysis,
  currentKmAlongRoute: number,
  profile: VehicleFuelProfile,
): FuelTrackingState {
  const { stations } = analysis;

  if (stations.length === 0) {
    return {
      last_passed_station: null,
      km_since_last_fuel: currentKmAlongRoute,
      km_to_next_fuel: null,
      fuel_pressure: currentKmAlongRoute > profile.reserve_warn_km ? 1.0 : 0.5,
      next_station: null,
      is_warn: true,
      is_critical: currentKmAlongRoute > profile.reserve_critical_km,
      active_warning: analysis.warnings.find((w) => w.type === "no_fuel_on_route") ?? null,
    };
  }

  // Find the last station the user has passed
  let lastPassed: FuelStation | null = null;
  let nextStation: FuelStation | null = null;

  for (let i = 0; i < stations.length; i++) {
    if (stations[i].km_along_route <= currentKmAlongRoute) {
      lastPassed = stations[i];
    } else {
      nextStation = stations[i];
      break;
    }
  }

  const kmSinceLast = lastPassed
    ? currentKmAlongRoute - lastPassed.km_along_route
    : currentKmAlongRoute; // no station passed yet → distance from start

  const kmToNext = nextStation
    ? nextStation.km_along_route - currentKmAlongRoute
    : null; // no more stations ahead

  // Compute fuel pressure (0.0 = just refueled, 1.0 = past point of no return)
  const fuel_pressure = computePressure(kmSinceLast, kmToNext, profile);

  const is_warn = fuel_pressure >= 0.3 || (kmToNext !== null && kmToNext > profile.reserve_warn_km);
  const is_critical = fuel_pressure >= 0.7 || kmSinceLast > (profile.tank_range_km - profile.reserve_critical_km);

  // Find the most relevant active warning
  let active_warning: FuelWarning | null = null;
  for (const w of analysis.warnings) {
    if (w.at_km <= currentKmAlongRoute + 5 && w.at_km >= currentKmAlongRoute - 50) {
      if (!active_warning || severityRank(w.severity) > severityRank(active_warning.severity)) {
        active_warning = w;
      }
    }
  }

  return {
    last_passed_station: lastPassed,
    km_since_last_fuel: kmSinceLast,
    km_to_next_fuel: kmToNext,
    fuel_pressure,
    next_station: nextStation,
    is_warn,
    is_critical,
    active_warning,
  };
}

// ──────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────

function emptyAnalysis(profile: VehicleFuelProfile, routeKey: string): FuelAnalysis {
  return {
    profile,
    stations: [],
    legs: [],
    warnings: [{
      type: "no_fuel_on_route",
      severity: "critical",
      message: "No fuel stations found along this route",
      at_km: 0,
    }],
    max_gap_km: 0,
    total_fuel_stops: 0,
    has_critical_gaps: false,
    computed_at: new Date().toISOString(),
    route_key: routeKey,
  };
}

/** Remove stations within 0.5 km of each other — keep the one closer to route */
function deduplicateStations(stations: FuelStation[]): FuelStation[] {
  if (stations.length <= 1) return stations;
  const out: FuelStation[] = [stations[0]];
  for (let i = 1; i < stations.length; i++) {
    const prev = out[out.length - 1];
    const curr = stations[i];
    if (curr.km_along_route - prev.km_along_route < 0.5) {
      // Keep the one closer to the route
      if (curr.snap_distance_m < prev.snap_distance_m) {
        out[out.length - 1] = curr;
      }
    } else {
      out.push(curr);
    }
  }
  return out;
}

/** Build fuel legs: gaps between consecutive fuel stations (or route start/end) */
function buildFuelLegs(
  stations: FuelStation[],
  routeTotalKm: number,
  profile: VehicleFuelProfile,
): FuelLeg[] {
  const legs: FuelLeg[] = [];

  if (stations.length === 0) {
    // Entire route is one big leg
    legs.push({
      idx: 0,
      from_station: null,
      to_station: null,
      distance_km: routeTotalKm,
      gap_exceeds_range: routeTotalKm > profile.tank_range_km,
      gap_exceeds_warn: routeTotalKm > (profile.tank_range_km - profile.reserve_warn_km),
    });
    return legs;
  }

  // Start → first station
  const firstGap = stations[0].km_along_route;
  if (firstGap > 0.1) {
    legs.push({
      idx: 0,
      from_station: null,
      to_station: stations[0],
      distance_km: firstGap,
      gap_exceeds_range: firstGap > profile.tank_range_km,
      gap_exceeds_warn: firstGap > (profile.tank_range_km - profile.reserve_warn_km),
    });
  }

  // Between consecutive stations
  for (let i = 0; i < stations.length - 1; i++) {
    const gap = stations[i + 1].km_along_route - stations[i].km_along_route;
    legs.push({
      idx: legs.length,
      from_station: stations[i],
      to_station: stations[i + 1],
      distance_km: gap,
      gap_exceeds_range: gap > profile.tank_range_km,
      gap_exceeds_warn: gap > (profile.tank_range_km - profile.reserve_warn_km),
    });
  }

  // Last station → end
  const lastStation = stations[stations.length - 1];
  const tailGap = routeTotalKm - lastStation.km_along_route;
  if (tailGap > 0.1) {
    legs.push({
      idx: legs.length,
      from_station: lastStation,
      to_station: null,
      distance_km: tailGap,
      gap_exceeds_range: tailGap > profile.tank_range_km,
      gap_exceeds_warn: tailGap > (profile.tank_range_km - profile.reserve_warn_km),
    });
  }

  return legs;
}

/** Generate fuel warnings from legs */
function generateWarnings(
  legs: FuelLeg[],
  stations: FuelStation[],
  profile: VehicleFuelProfile,
): FuelWarning[] {
  const warnings: FuelWarning[] = [];

  if (stations.length === 0) {
    warnings.push({
      type: "no_fuel_on_route",
      severity: "critical",
      message: "No fuel stations found along this route",
      at_km: 0,
    });
    return warnings;
  }

  for (const leg of legs) {
    // Critical gap: distance > tank range
    if (leg.gap_exceeds_range) {
      const fromName = leg.from_station?.name ?? "Start";
      const toName = leg.to_station?.name ?? "End";
      const margin = profile.tank_range_km - leg.distance_km;

      warnings.push({
        type: "gap",
        severity: "critical",
        message: `${Math.round(leg.distance_km)}km gap between ${fromName} and ${toName} exceeds your ${profile.tank_range_km}km range`,
        at_km: leg.from_station?.km_along_route ?? 0,
        station: leg.from_station ?? undefined,
        gap_km: leg.distance_km,
      });
    }
    // Long stretch: distance within warning zone
    else if (leg.gap_exceeds_warn) {
      const fromName = leg.from_station?.name ?? "Start";
      const toName = leg.to_station?.name ?? "End";
      const margin = profile.tank_range_km - leg.distance_km;

      warnings.push({
        type: "long_stretch",
        severity: margin < profile.reserve_critical_km ? "warn" : "info",
        message: `${Math.round(leg.distance_km)}km between ${fromName} and ${toName} — margin ${Math.round(margin)}km`,
        at_km: leg.from_station?.km_along_route ?? 0,
        station: leg.from_station ?? undefined,
        gap_km: leg.distance_km,
      });
    }
  }

  // Last-chance warnings: station before a gap > reserve_warn_km
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.distance_km > profile.reserve_warn_km && leg.from_station) {
      // Check if this is the last station before a big gap
      const nextLeg = legs[i + 1];
      const isLastChance =
        !nextLeg || // no more legs
        leg.distance_km > (profile.tank_range_km - profile.reserve_warn_km);

      if (isLastChance) {
        warnings.push({
          type: "last_chance",
          severity: "warn",
          message: `Last fuel for ${Math.round(leg.distance_km)}km at ${leg.from_station.name}`,
          at_km: leg.from_station.km_along_route,
          station: leg.from_station,
          gap_km: leg.distance_km,
        });
      }
    }
  }

  // Sort by severity (critical first) then by km
  warnings.sort((a, b) => {
    const sr = severityRank(b.severity) - severityRank(a.severity);
    if (sr !== 0) return sr;
    return a.at_km - b.at_km;
  });

  return warnings;
}

function computePressure(
  kmSinceLast: number,
  kmToNext: number | null,
  profile: VehicleFuelProfile,
): number {
  const range = profile.tank_range_km;

  // If we know distance to next station
  if (kmToNext !== null) {
    const totalLeg = kmSinceLast + kmToNext;
    if (totalLeg <= 0) return 0;

    // How much of the range have we consumed since last fuel?
    const consumedFraction = kmSinceLast / range;

    // Is the next station reachable?
    if (kmSinceLast + kmToNext > range) {
      return 1.0; // Past point of no return
    }

    // Scale pressure by how tight the remaining margin is
    const remainingRange = range - kmSinceLast;
    const marginAfterNext = remainingRange - kmToNext;
    const marginFraction = marginAfterNext / range;

    if (marginFraction < profile.reserve_critical_km / range) {
      return 0.8 + (0.2 * (1 - marginFraction / (profile.reserve_critical_km / range)));
    }
    if (marginFraction < profile.reserve_warn_km / range) {
      return 0.3 + (0.5 * (1 - marginFraction / (profile.reserve_warn_km / range)));
    }
    return Math.min(0.3, consumedFraction * 0.5);
  }

  // No next station — pressure based purely on distance since last
  const fraction = kmSinceLast / range;
  return Math.min(1.0, fraction);
}

function severityRank(s: string): number {
  switch (s) {
    case "critical": return 3;
    case "warn": return 2;
    case "info": return 1;
    default: return 0;
  }
}