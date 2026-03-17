// src/lib/nav/routeAvoidance.ts
// ──────────────────────────────────────────────────────────────
// Computes detour waypoints to route around hazard/traffic zones
// that block or affect the current route.
//
// Strategy:
//   1. Identify alert clusters along the route that are blocking/affecting it
//   2. For each cluster, find the route segment it sits on
//   3. Compute a perpendicular offset waypoint that pushes the route away
//   4. Return modified stops list with detour waypoints inserted
//
// Works with OSRM (which doesn't support polygon exclusion) by inserting
// "via" waypoints that force the route around hazard zones.
// ──────────────────────────────────────────────────────────────

import type { TripStop } from "@/lib/types/trip";
import type { TrafficOverlay, HazardOverlay, AvoidZoneRequest } from "@/lib/types/navigation";
import type { HazardZone } from "@/lib/offline/corridorRouter";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;

/** A hazard zone to avoid: centre point + radius of influence */
export type AvoidZone = {
  lat: number;
  lng: number;
  radiusKm: number;
  kmAlongRoute: number;
  severity: "blocker" | "major" | "minor";
};

/** Haversine distance in km */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
    Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Move a point a given distance along a bearing.
 * Returns the destination lat/lng.
 */
function destinationPoint(
  lat: number, lng: number,
  bearingDeg: number, distanceKm: number,
): { lat: number; lng: number } {
  const d = distanceKm / EARTH_RADIUS_KM;
  const br = bearingDeg * DEG_TO_RAD;
  const lat1 = lat * DEG_TO_RAD;
  const lng1 = lng * DEG_TO_RAD;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(br),
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(br) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
  );

  return { lat: lat2 * RAD_TO_DEG, lng: lng2 * RAD_TO_DEG };
}

/**
 * Compute bearing (degrees) from point A to point B.
 */
function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const y = Math.sin(dLng) * Math.cos(lat2 * DEG_TO_RAD);
  const x =
    Math.cos(lat1 * DEG_TO_RAD) * Math.sin(lat2 * DEG_TO_RAD) -
    Math.sin(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.cos(dLng);
  return ((Math.atan2(y, x) * RAD_TO_DEG) + 360) % 360;
}

/**
 * Cluster nearby avoid zones so we generate one detour per cluster
 * rather than one per individual alert.
 */
function clusterZones(zones: AvoidZone[], mergeRadiusKm: number): AvoidZone[][] {
  const used = new Set<number>();
  const clusters: AvoidZone[][] = [];

  // Sort by kmAlongRoute so clusters follow route order
  const sorted = zones.map((z, i) => ({ z, i })).sort((a, b) => a.z.kmAlongRoute - b.z.kmAlongRoute);

  for (const { z, i } of sorted) {
    if (used.has(i)) continue;
    const cluster: AvoidZone[] = [z];
    used.add(i);

    for (const { z: z2, i: j } of sorted) {
      if (used.has(j)) continue;
      // Merge if within mergeRadiusKm along-route OR within spatial distance
      if (
        Math.abs(z2.kmAlongRoute - z.kmAlongRoute) < mergeRadiusKm ||
        haversineKm(z.lat, z.lng, z2.lat, z2.lng) < mergeRadiusKm
      ) {
        cluster.push(z2);
        used.add(j);
      }
    }
    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Given a decoded route polyline (as [lng, lat] tuples) and an along-route km,
 * find the route segment at that km and return the bearing + the point on the route.
 */
function routePointAndBearing(
  routeCoords: Array<[number, number]>,
  targetKm: number,
): { lat: number; lng: number; bearingDeg: number } | null {
  if (routeCoords.length < 2) return null;

  let cumKm = 0;
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const [aLng, aLat] = routeCoords[i];
    const [bLng, bLat] = routeCoords[i + 1];
    const segKm = haversineKm(aLat, aLng, bLat, bLng);

    if (cumKm + segKm >= targetKm || i === routeCoords.length - 2) {
      const frac = segKm > 0 ? Math.min(1, Math.max(0, (targetKm - cumKm) / segKm)) : 0;
      const lat = aLat + frac * (bLat - aLat);
      const lng = aLng + frac * (bLng - aLng);
      const b = bearing(aLat, aLng, bLat, bLng);
      return { lat, lng, bearingDeg: b };
    }
    cumKm += segKm;
  }

  return null;
}

/**
 * For a cluster of hazard zones, compute 2 detour waypoints — one on each side
 * of the route, perpendicular to the route direction. The route planner (OSRM)
 * will pick the side that produces a shorter path.
 *
 * Actually we pick the side AWAY from the hazard centre to produce one good waypoint.
 */
function computeDetourWaypoint(
  cluster: AvoidZone[],
  routeCoords: Array<[number, number]>,
): TripStop | null {
  // Cluster centroid and max severity
  const centLat = cluster.reduce((s, z) => s + z.lat, 0) / cluster.length;
  const centLng = cluster.reduce((s, z) => s + z.lng, 0) / cluster.length;
  const avgKm = cluster.reduce((s, z) => s + z.kmAlongRoute, 0) / cluster.length;
  const maxRadius = Math.max(...cluster.map((z) => z.radiusKm));
  const hasBLockers = cluster.some((z) => z.severity === "blocker");

  const rp = routePointAndBearing(routeCoords, avgKm);
  if (!rp) return null;

  // Perpendicular bearings (left and right of route direction)
  const perpLeft = (rp.bearingDeg + 270) % 360;
  const perpRight = (rp.bearingDeg + 90) % 360;

  // Determine which side the hazard is on — push away from it
  const leftPt = destinationPoint(rp.lat, rp.lng, perpLeft, 1);
  const rightPt = destinationPoint(rp.lat, rp.lng, perpRight, 1);
  const dLeft = haversineKm(centLat, centLng, leftPt.lat, leftPt.lng);
  const dRight = haversineKm(centLat, centLng, rightPt.lat, rightPt.lng);

  // Push to the side farther from the hazard
  const escapeBearing = dLeft > dRight ? perpLeft : perpRight;

  // Offset distance: at least the hazard radius + buffer, scaled by severity
  // Minimum 5km for blockers (road closures, floods), 3km for major hazards
  const minOffset = hasBLockers ? 5 : 3;
  const offset = Math.max(minOffset, maxRadius * 1.5 + 2);
  // Cap at 30km — beyond that the detour is too extreme
  const clampedOffset = Math.min(30, offset);

  const wp = destinationPoint(rp.lat, rp.lng, escapeBearing, clampedOffset);

  return {
    id: `avoid_${Math.round(avgKm)}`,
    type: "via",
    name: null,
    lat: wp.lat,
    lng: wp.lng,
  };
}

/**
 * Extract avoid zones from enriched alerts.
 *
 * @param alerts - Enriched alerts from TripAlertsPanel
 * @param onlyAhead - If true, only include alerts ahead of the user
 */
export function alertsToAvoidZones(
  alerts: ReadonlyArray<{
    coord: { lat: number; lng: number } | null;
    kmAlongRoute: number | null;
    distFromRouteKm: number | null;
    routeImpact: "blocks_route" | "affects_route" | "nearby" | "informational";
    severity: string;
    isAhead: boolean;
    alertKind: "traffic" | "hazard";
    typeLabel: string;
  }>,
  onlyAhead = true,
): AvoidZone[] {
  const zones: AvoidZone[] = [];

  for (const a of alerts) {
    // Only avoid blockers and major route-affecting alerts
    if (a.routeImpact !== "blocks_route" && a.routeImpact !== "affects_route") continue;
    if (!a.coord || a.kmAlongRoute == null) continue;
    if (onlyAhead && !a.isAhead) continue;

    // Assign severity tier
    let sev: AvoidZone["severity"] = "minor";
    if (a.routeImpact === "blocks_route") sev = "blocker";
    else if (a.severity === "major" || a.severity === "high" || a.severity === "extreme") sev = "major";

    // Assign radius based on type
    let radiusKm = 1;
    const tl = a.typeLabel.toLowerCase();
    if (tl.includes("flood") || tl.includes("closure")) radiusKm = 3;
    else if (tl.includes("fire") || tl.includes("bushfire")) radiusKm = 5;
    else if (tl.includes("storm") || tl.includes("cyclone")) radiusKm = 8;
    else if (tl.includes("congestion")) radiusKm = 2;
    else if (a.routeImpact === "blocks_route") radiusKm = 2;

    zones.push({
      lat: a.coord.lat,
      lng: a.coord.lng,
      radiusKm,
      kmAlongRoute: a.kmAlongRoute,
      severity: sev,
    });
  }

  return zones;
}

/**
 * Compute detour waypoints from avoid zones and insert them into the stops list.
 *
 * Returns a new stops array with "via" waypoints inserted at appropriate positions
 * to route around hazard zones. The original start/end stops are preserved.
 *
 * @param stops - Current trip stops
 * @param avoidZones - Hazard zones to avoid
 * @param routeCoords - Decoded route polyline as [lng, lat] tuples
 * @returns Modified stops with detour waypoints, or null if no detours needed
 */
export function buildAvoidanceStops(
  stops: TripStop[],
  avoidZones: AvoidZone[],
  routeCoords: Array<[number, number]>,
): TripStop[] | null {
  if (avoidZones.length === 0 || routeCoords.length < 2) return null;

  // Cluster nearby zones (within 10km along-route)
  const clusters = clusterZones(avoidZones, 10);
  if (clusters.length === 0) return null;

  // Compute detour waypoints for each cluster
  const detours: Array<{ kmAlong: number; stop: TripStop }> = [];
  for (const cluster of clusters) {
    const wp = computeDetourWaypoint(cluster, routeCoords);
    if (wp) {
      const avgKm = cluster.reduce((s, z) => s + z.kmAlongRoute, 0) / cluster.length;
      detours.push({ kmAlong: avgKm, stop: wp });
    }
  }

  if (detours.length === 0) return null;

  // Sort detours by along-route position
  detours.sort((a, b) => a.kmAlong - b.kmAlong);

  // Compute cumulative km for each existing stop to know where to insert detours
  const stopKms: number[] = [];
  let cumKm = 0;
  for (let i = 0; i < routeCoords.length - 1; i++) {
    cumKm += haversineKm(
      routeCoords[i][1], routeCoords[i][0],
      routeCoords[i + 1][1], routeCoords[i + 1][0],
    );
  }
  const totalKm = cumKm;

  // Simple approach: assign each stop a proportional km position
  // (stop 0 = 0km, last stop = totalKm, others evenly spaced between legs)
  for (let i = 0; i < stops.length; i++) {
    stopKms.push((i / Math.max(1, stops.length - 1)) * totalKm);
  }

  // Build new stops list with detours interleaved
  const result: TripStop[] = [];
  let detourIdx = 0;

  for (let i = 0; i < stops.length; i++) {
    // Insert any detour waypoints that belong before this stop
    while (detourIdx < detours.length && detours[detourIdx].kmAlong <= stopKms[i]) {
      result.push(detours[detourIdx].stop);
      detourIdx++;
    }
    result.push(stops[i]);
  }

  // Append remaining detours after last stop (unlikely but handle gracefully)
  while (detourIdx < detours.length) {
    // Insert before the last stop (the destination)
    const dest = result.pop()!;
    result.push(detours[detourIdx].stop);
    result.push(dest);
    detourIdx++;
  }

  return result;
}

// ──────────────────────────────────────────────────────────────
// Overlay → HazardZone conversion for offline corridor A* routing
// ──────────────────────────────────────────────────────────────

const BLOCKING_TRAFFIC_TYPES = new Set(["closure", "flooding"]);
const BLOCKING_HAZARD_KINDS = new Set(["flood", "fire", "cyclone"]);

const HIGH_SEVERITY_TRAFFIC = new Set(["major"]);
const HIGH_SEVERITY_HAZARD = new Set(["high", "extreme"]);

/**
 * Extract a centroid coordinate from a GeoJSON geometry or bbox.
 */
function extractCoordFromGeo(
  geo: Record<string, unknown> | null | undefined,
  bbox: number[] | null | undefined,
): { lat: number; lng: number } | null {
  if (geo) {
    if (geo.type === "Point" && Array.isArray(geo.coordinates)) {
      return { lng: (geo.coordinates as number[])[0], lat: (geo.coordinates as number[])[1] };
    }
    if (geo.type === "LineString" && Array.isArray(geo.coordinates) && (geo.coordinates as unknown[]).length > 0) {
      const mid = (geo.coordinates as number[][])[Math.floor((geo.coordinates as unknown[]).length / 2)];
      return Array.isArray(mid) ? { lng: mid[0], lat: mid[1] } : null;
    }
    if ((geo.type === "Polygon" || geo.type === "MultiPolygon") && Array.isArray(geo.coordinates)) {
      const ring = geo.type === "Polygon"
        ? (geo.coordinates as number[][][])[0]
        : ((geo.coordinates as number[][][][])[0])?.[0];
      if (Array.isArray(ring) && ring.length) {
        let sLng = 0, sLat = 0;
        for (const c of ring) { sLng += c[0]; sLat += c[1]; }
        return { lng: sLng / ring.length, lat: sLat / ring.length };
      }
    }
  }
  if (bbox && bbox.length === 4) {
    return { lng: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
  }
  return null;
}

/**
 * Convert raw traffic/hazard overlay events into HazardZone objects
 * for the offline corridor A* router. Each zone penalizes edges within
 * its radius, causing the A* to route around hazards.
 */
export function overlaysToHazardZones(
  traffic: TrafficOverlay | null | undefined,
  hazards: HazardOverlay | null | undefined,
): HazardZone[] {
  const zones: HazardZone[] = [];

  for (const ev of traffic?.items ?? []) {
    const type = ev.type ?? "unknown";
    const sev = ev.severity ?? "unknown";
    const isBlocking = BLOCKING_TRAFFIC_TYPES.has(type);
    const isHigh = HIGH_SEVERITY_TRAFFIC.has(sev);

    // Only create zones for blocking or high-severity traffic events
    if (!isBlocking && !isHigh) continue;

    const coord = extractCoordFromGeo(ev.geometry, ev.bbox);
    if (!coord) continue;

    let radiusKm = 2;
    let penalty = 5;
    if (type === "closure") { radiusKm = 3; penalty = 50; } // Very strong: closures are impassable
    else if (type === "flooding") { radiusKm = 3; penalty = 50; }
    else if (type === "congestion" && isHigh) { radiusKm = 3; penalty = 3; } // Moderate: prefer avoiding
    else if (isHigh) { radiusKm = 2; penalty = 5; }

    zones.push({ lat: coord.lat, lng: coord.lng, radiusKm, penalty });
  }

  for (const ev of hazards?.items ?? []) {
    const kind = ev.kind ?? "unknown";
    const sev = ev.severity ?? "unknown";
    const isBlocking = BLOCKING_HAZARD_KINDS.has(kind);
    const isHigh = HIGH_SEVERITY_HAZARD.has(sev);
    const urgency = ev.urgency ?? "unknown";

    // Only create zones for blocking, high-severity, or immediate-urgency hazards
    if (!isBlocking && !isHigh && urgency !== "immediate") continue;

    const coord = extractCoordFromGeo(ev.geometry, ev.bbox);
    if (!coord) continue;

    let radiusKm = 2;
    let penalty = 5;
    if (kind === "flood") { radiusKm = 3; penalty = 50; }
    else if (kind === "fire") { radiusKm = 5; penalty = 30; }
    else if (kind === "cyclone") { radiusKm = 10; penalty = 50; }
    else if (kind === "storm") { radiusKm = 5; penalty = 8; }
    else if (urgency === "immediate") { radiusKm = 3; penalty = 20; }
    else if (isHigh) { radiusKm = 3; penalty = 10; }

    zones.push({ lat: coord.lat, lng: coord.lng, radiusKm, penalty });
  }

  return zones;
}

/**
 * Convert traffic/hazard overlays to AvoidZoneRequest[] for the backend API.
 * These are sent with the NavRequest so the backend can request OSRM alternatives
 * and pick the route with least hazard exposure.
 */
export function overlaysToAvoidZoneRequests(
  traffic: TrafficOverlay | null | undefined,
  hazards: HazardOverlay | null | undefined,
): AvoidZoneRequest[] {
  const zones: AvoidZoneRequest[] = [];

  for (const ev of traffic?.items ?? []) {
    const type = ev.type ?? "unknown";
    const sev = ev.severity ?? "unknown";
    if (!BLOCKING_TRAFFIC_TYPES.has(type) && !HIGH_SEVERITY_TRAFFIC.has(sev)) continue;

    const coord = extractCoordFromGeo(ev.geometry, ev.bbox);
    if (!coord) continue;

    let radius = 3;
    if (type === "closure" || type === "flooding") radius = 5;
    else if (type === "congestion") radius = 4;

    zones.push({ lat: coord.lat, lng: coord.lng, radius_km: radius });
  }

  for (const ev of hazards?.items ?? []) {
    const kind = ev.kind ?? "unknown";
    const sev = ev.severity ?? "unknown";
    const urgency = ev.urgency ?? "unknown";
    if (!BLOCKING_HAZARD_KINDS.has(kind) && !HIGH_SEVERITY_HAZARD.has(sev) && urgency !== "immediate") continue;

    const coord = extractCoordFromGeo(ev.geometry, ev.bbox);
    if (!coord) continue;

    let radius = 5;
    if (kind === "flood") radius = 5;
    else if (kind === "fire") radius = 8;
    else if (kind === "cyclone") radius = 15;
    else if (kind === "storm") radius = 8;

    zones.push({ lat: coord.lat, lng: coord.lng, radius_km: radius });
  }

  return zones;
}
