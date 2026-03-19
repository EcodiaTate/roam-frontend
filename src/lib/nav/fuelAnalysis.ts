// src/lib/nav/fuelAnalysis.ts
// ──────────────────────────────────────────────────────────────
// Fuel Range Intelligence - Core Analysis Engine
//
// Pure functions - no side effects, no API calls. Works offline.
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
} from "@/lib/types/fuel";

/**
 * Max perpendicular snap distance (metres) for a station to be "on route".
 * 15 km covers outback servos sitting on parallel service roads, in small
 * towns off the highway, or down access roads.  The backend bundle fetches
 * tier-1 essentials within 30 km; a 15 km snap keeps the two layers
 * consistent while still excluding completely unrelated towns.
 *
 * Previously 5 km - caused servos between 5-30 km to appear as map pins
 * (via the suggestions layer) but be absent from fuel analysis, leading
 * to "No fuel ahead" while fuel icons were visible on the map.
 */
const MAX_SNAP_DISTANCE_M = 15_000;

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
 * Compute a wind-based range penalty from weather overlay data.
 *
 * Headwind: reduces effective range by up to ~15% at 60+ km/h wind.
 * Tailwind: slight bonus (capped at +5% - don't encourage risky range estimates).
 * Crosswind: small penalty (~5% at high speeds due to increased drag).
 *
 * @param avgWindSpeed_kmh  Average wind speed along route
 * @param windDirection_deg Wind direction (0=N, 90=E, 180=S, 270=W)
 * @param routeHeading_deg  Average heading of the route
 * @returns Range multiplier (0.85 - 1.05). Multiply with tank_range_km.
 */
export function windRangeFactor(
  avgWindSpeed_kmh: number,
  windDirection_deg: number,
  routeHeading_deg: number,
): number {
  if (avgWindSpeed_kmh < 10) return 1.0; // negligible wind

  // Angle between wind and route heading.
  // Wind direction is where wind COMES FROM, so headwind = same direction as route.
  const relativeAngle = ((windDirection_deg - routeHeading_deg + 360) % 360);
  const radians = relativeAngle * (Math.PI / 180);
  const headwindComponent = Math.cos(radians); // +1 = headwind, -1 = tailwind

  // Scale factor based on wind speed (maxes out at ~60 km/h)
  const speedFactor = Math.min(avgWindSpeed_kmh / 60, 1.0);

  // Headwind: up to -15% range. Tailwind: up to +5%. Crosswind: ~-5%.
  const crosswindPenalty = Math.abs(Math.sin(radians)) * 0.05 * speedFactor;

  if (headwindComponent > 0) {
    // Headwind
    return 1.0 - (headwindComponent * 0.15 * speedFactor) - crosswindPenalty;
  } else {
    // Tailwind (conservative bonus)
    return Math.min(1.05, 1.0 + (Math.abs(headwindComponent) * 0.05 * speedFactor) - crosswindPenalty);
  }
}

/**
 * Analyse fuel coverage for a route.
 *
 * @param routeGeometry  Polyline6 string of the route
 * @param places         All PlaceItems from the corridor PlacesPack
 * @param profile        Vehicle fuel profile
 * @param routeKey       Route key for tagging the analysis
 * @param placesKey      Places pack key - stored so callers can detect stale cache
 * @param rangeFactor    Optional multiplier for effective range (e.g. wind correction)
 */
export function analyzeFuel(
  routeGeometry: string,
  places: PlaceItem[],
  profile: VehicleFuelProfile,
  routeKey: string,
  placesKey?: string,
  rangeFactor: number = 1.0,
): FuelAnalysis {
  // 1. Decode polyline → coordinate array
  const decoded = decodePolyline6(routeGeometry);
  if (decoded.length < 2) {
    return emptyAnalysis(profile, routeKey, placesKey);
  }

  // Apply wind/condition range correction.
  // Adjusts the effective tank range so all downstream gap/warning logic
  // automatically accounts for headwind, heat, elevation, etc.
  const effectiveProfile: VehicleFuelProfile = rangeFactor !== 1.0
    ? { ...profile, tank_range_km: Math.round(profile.tank_range_km * Math.max(0.5, rangeFactor)) }
    : profile;

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
      hours: (p.extra?.hours as string | undefined) ?? undefined,
      has_diesel: p.extra?.has_diesel ?? undefined,
      has_unleaded: p.extra?.has_unleaded ?? undefined,
    };

    // Additional fuel-type filtering for diesel/unleaded/lpg.
    // Only exclude a station if we have *explicit* fuel-type data AND the
    // required type is absent.  When has_diesel/has_unleaded/has_lpg are
    // undefined (OSM tags missing), we keep the station - most servos don't
    // have granular OSM fuel tags and we'd rather show too many than too few.
    if (profile.fuel_type === "diesel" && station.has_diesel === false) continue;
    if (profile.fuel_type === "unleaded" && station.has_unleaded === false) continue;
    if (profile.fuel_type === "lpg" && station.has_lpg === false) continue;

    stations.push(station);
  }

  // 5. Sort by km_along_route
  stations.sort((a, b) => a.km_along_route - b.km_along_route);

  // 6. Deduplicate stations that are very close together (< 0.5 km)
  const deduped = deduplicateStations(stations);

  // 7. Decompose into fuel legs (using wind-adjusted range)
  const legs = buildFuelLegs(deduped, routeTotalKm, effectiveProfile);

  // 8. Generate warnings (using wind-adjusted range)
  const warnings = generateWarnings(legs, deduped, effectiveProfile);

  // Add wind penalty warning if significant
  if (rangeFactor < 0.92) {
    const pctReduction = Math.round((1 - rangeFactor) * 100);
    warnings.unshift({
      type: "wind_penalty",
      severity: rangeFactor < 0.85 ? "warn" : "info",
      message: `Strong headwind reducing effective fuel range by ~${pctReduction}%`,
      at_km: 0,
    });
  }

  // 9. Compute summary
  const max_gap_km = legs.length > 0
    ? Math.max(...legs.map((l) => l.distance_km))
    : 0;

  return {
    profile: effectiveProfile,
    stations: deduped,
    legs,
    warnings,
    max_gap_km,
    total_fuel_stops: deduped.length,
    has_critical_gaps: legs.some((l) => l.gap_exceeds_range),
    computed_at: new Date().toISOString(),
    route_key: routeKey,
    places_key: placesKey,
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
  // Same logic - just a different polyline source
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

function emptyAnalysis(profile: VehicleFuelProfile, routeKey: string, placesKey?: string): FuelAnalysis {
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
    places_key: placesKey,
  };
}

/** Remove stations within 0.5 km of each other - keep the one closer to route */
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
        message: `${Math.round(leg.distance_km)}km between ${fromName} and ${toName} - margin ${Math.round(margin)}km`,
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

  // No next station - pressure based purely on distance since last
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

// ──────────────────────────────────────────────────────────────
// Fuel overlay → PlaceItem merge
// ──────────────────────────────────────────────────────────────

import type { FuelStationOverlay, FuelOverlay } from "@/lib/types/overlays";

/**
 * Convert FuelOverlay stations into PlaceItems so they can supplement
 * the PlacesPack when fuel stations were budget-squeezed from tier-1.
 *
 * Only adds stations whose IDs are not already present in `existingIds`.
 */
export function fuelOverlayToPlaceItems(
  overlay: FuelOverlay | null | undefined,
  existingIds: Set<string>,
): PlaceItem[] {
  if (!overlay?.stations?.length) return [];
  const items: PlaceItem[] = [];
  for (const s of overlay.stations) {
    const id = s.id ?? s.place_id ?? `fov_${s.lat}_${s.lng}`;
    if (existingIds.has(id)) continue;
    items.push({
      id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      category: s.category ?? "fuel",
      extra: {
        brand: s.brand ?? undefined,
        has_diesel: s.has_diesel ?? undefined,
        has_unleaded: s.has_unleaded ?? undefined,
        has_lpg: s.has_lpg ?? undefined,
        hours: (s.open_hours as string | undefined) ?? undefined,
      },
    });
  }
  return items;
}

// ──────────────────────────────────────────────────────────────
// Fuel price arbitrage
// ──────────────────────────────────────────────────────────────

export type FuelArbitrageAlert = {
  /** The approaching station (expensive) */
  current_station: string;
  current_price_cents: number;
  /** The cheaper station ahead */
  cheaper_station: string;
  cheaper_price_cents: number;
  /** Distance between them */
  distance_km: number;
  /** How much cheaper (cents/litre) */
  savings_cents: number;
  /** Is the cheaper station reachable from current position? */
  reachable: boolean;
};

/**
 * Check if the next station ahead is cheaper than the approaching one.
 * Returns an alert if the price difference is worth skipping.
 *
 * @param currentKm       User's current position along route
 * @param fuelOverlay     Bundle fuel overlay with live prices
 * @param profile         Vehicle fuel profile (for range check)
 * @param fuelType        User's fuel type string to match prices
 * @param minSavingsCents Minimum difference to alert (default 10c/L)
 */
export function checkFuelArbitrage(
  currentKm: number,
  fuelOverlay: FuelOverlay,
  profile: VehicleFuelProfile,
  fuelType: string = "unleaded",
  minSavingsCents: number = 10,
): FuelArbitrageAlert | null {
  // Find stations ahead with known prices, sorted by km
  const stationsAhead = fuelOverlay.stations
    .filter((s) => (s.km_along_route ?? 0) > currentKm && s.fuel_types?.length)
    .sort((a, b) => (a.km_along_route ?? 0) - (b.km_along_route ?? 0));

  if (stationsAhead.length < 2) return null;

  // Get price for the closest station ahead (the one user is approaching)
  const approaching = stationsAhead[0];
  const approachPrice = getPriceForType(approaching, fuelType);
  if (approachPrice === null) return null;

  // Check the next 3 stations for a cheaper option
  for (let i = 1; i < Math.min(stationsAhead.length, 4); i++) {
    const candidate = stationsAhead[i];
    const candidatePrice = getPriceForType(candidate, fuelType);
    if (candidatePrice === null) continue;

    const savings = approachPrice - candidatePrice;
    if (savings < minSavingsCents) continue;

    const approachKm = approaching.km_along_route ?? 0;
    const candidateKm = candidate.km_along_route ?? 0;
    const distBetween = candidateKm - approachKm;

    // Check if candidate is reachable without refueling
    const kmSinceStart = approachKm - currentKm;
    const reachable = (candidateKm - currentKm) < (profile.tank_range_km - profile.reserve_warn_km);

    if (!reachable) continue; // don't suggest unreachable savings

    return {
      current_station: approaching.name,
      current_price_cents: approachPrice,
      cheaper_station: candidate.name,
      cheaper_price_cents: candidatePrice,
      distance_km: Math.round(distBetween),
      savings_cents: Math.round(savings),
      reachable,
    };
  }

  return null;
}

function getPriceForType(station: FuelStationOverlay, fuelType: string): number | null {
  if (!station.fuel_types) return null;
  // Try exact match first, then fuzzy
  const normalised = fuelType.toLowerCase();
  const match = station.fuel_types.find((ft) => {
    const t = ft.fuel_type.toLowerCase();
    return t === normalised
      || (normalised === "unleaded" && (t.includes("e10") || t.includes("91") || t.includes("unleaded")))
      || (normalised === "diesel" && t.includes("diesel"))
      || (normalised === "lpg" && t.includes("lpg"));
  });
  return match?.price_cents ?? null;
}
