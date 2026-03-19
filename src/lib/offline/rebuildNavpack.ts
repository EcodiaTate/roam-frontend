// src/lib/offline/rebuildNavpack.ts
"use client";

import type { NavPack, NavLeg, NavRoute, CorridorGraphPack } from "@/lib/types/navigation";
import { decodePolyline6AsLngLat } from "@/lib/nav/polyline6";
import type { FuelAnalysis } from "@/lib/types/fuel";
import type { TripStop } from "@/lib/types/trip";
import type { BBox4 } from "@/lib/types/geo";

import {
    indexCorridorGraph,
    snapStopToNearestNode, aStar,
    pathToGeoJSON,
    encodePolyline6,
    bboxFromStopsOrLine,
    synthesizeStepsFromPath,
    type HazardZone
} from "@/lib/offline/corridorRouter";

// ── Fuel reanalysis (after reroute) ─────────────────────────────────────
import { reanalyzeFuelForReroute } from "@/lib/nav/fuelAnalysis";
import { getVehicleFuelProfile } from "@/lib/offline/fuelProfileStore";
import { getPack } from "@/lib/offline/packsStore";
import type { PlacesPack } from "@/lib/types/places";

const DEFAULT_MAX_SNAP_M = 1500;

function safeStopId(s: TripStop, idx: number) {
  const id = s.id;
  if (typeof id === "string" && id.length) return id;
  return `${s.type ?? "poi"}_${idx}`;
}

/**
 * Append coordinates to the full route polyline, avoiding duplicate join points.
 */
function appendLegCoords(fullCoords: [number, number][], coords: [number, number][]) {
  if (coords.length === 0) return;
  if (fullCoords.length > 0) {
    fullCoords.push(...coords.slice(1));
  } else {
    fullCoords.push(...coords);
  }
}

/**
 * Rebuild the offline navpack using corridor A* routing.
 *
 * Every leg is either:
 *   1. Reused from the previous navpack (matching from_stop_id → to_stop_id)
 *   2. Freshly routed via corridor A*
 *
 * There is no straight-line fallback - the corridor graph covers the route
 * area and A* must find a road-following path. If it can't, we throw so the
 * caller knows to try OSRM or surface the error.
 */
export function rebuildNavpackOffline(args: {
  prevNavpack: NavPack;
  corridor: CorridorGraphPack;
  stops: TripStop[];
  route_key: string;
  max_snap_m?: number;
  hazardZones?: HazardZone[];
}): NavPack {
  const prev = args.prevNavpack;
  const corridor = args.corridor;
  const stops = args.stops;

  if (!stops || stops.length < 2) throw new Error("Need at least 2 stops");
  if (!corridor?.nodes?.length) throw new Error("Corridor graph has no nodes");

  const idx = indexCorridorGraph(corridor);
  const maxSnap = args.max_snap_m ?? DEFAULT_MAX_SNAP_M;

  console.info(
    "[rebuildNavpack] corridor: %d nodes, %d edges, mainComponent: %d nodes, maxSnap: %dm, stops: %d",
    corridor.nodes.length,
    corridor.edges.length,
    idx.mainComponent?.size ?? 0,
    maxSnap,
    stops.length,
  );

  // ── Build a lookup of existing legs by (from_stop_id → to_stop_id) ──
  // Reuse OSRM-quality legs for unchanged stop pairs.
  const existingLegs = new Map<string, NavLeg>();
  for (const leg of prev.primary.legs) {
    if (leg.from_stop_id && leg.to_stop_id && leg.geometry) {
      existingLegs.set(`${leg.from_stop_id}→${leg.to_stop_id}`, leg);
    }
  }

  const legs: NavLeg[] = [];
  const fullCoords: [number, number][] = [];
  let totalDist = 0;
  let totalDur = 0;

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const aId = safeStopId(a, i);
    const bId = safeStopId(b, i + 1);

    // ── 1. Reuse existing leg if stops haven't changed ──
    const existing = existingLegs.get(`${aId}→${bId}`);
    if (existing) {
      const reused: NavLeg = { ...existing, idx: legs.length };
      const coords = decodePolyline6AsLngLat(existing.geometry);
      appendLegCoords(fullCoords, coords);
      totalDist += reused.distance_m;
      totalDur += reused.duration_s;
      legs.push(reused);
      continue;
    }

    // ── 2. Route via corridor A* ──
    // Snap to the nearest node first, then try A*. If it fails (nodes on
    // different fragments due to the 350k edge limit truncating the graph),
    // find the component of stop A's nearest node and re-snap stop B to
    // that same component so A* is guaranteed to succeed.
    // Always snap to the main connected component so A* is guaranteed to
    // find a path. Without this, stops near disconnected fragments (e.g.
    // island roads not connected via bridge edges) snap to unreachable nodes.
    const mainComp = idx.mainComponent;
    let sa = snapStopToNearestNode(idx, a, mainComp);
    let sb = snapStopToNearestNode(idx, b, mainComp);

    const path = aStar(idx, sa.nodeId, sb.nodeId, args.hazardZones);

    if (sa.distance_m > 500 || sb.distance_m > 500) {
      console.info(
        "[rebuildNavpack] leg %d: snap distance - A (%s) %dm, B (%s) %dm",
        i, a.name ?? aId, Math.round(sa.distance_m),
        b.name ?? bId, Math.round(sb.distance_m),
      );
    }

    const geo = pathToGeoJSON(idx, path.nodeIds);
    const roadCoords = geo.geometry.coordinates as [number, number][];

    // Prepend/append actual stop coordinates when snapped node is far.
    const coords: [number, number][] = [];
    if (sa.distance_m > 50) coords.push([a.lng, a.lat]);
    coords.push(...roadCoords);
    if (sb.distance_m > 50) coords.push([b.lng, b.lat]);

    appendLegCoords(fullCoords, coords);

    const offlineSteps = synthesizeStepsFromPath(idx, path.nodeIds);

    const legDist = path.distance_m + sa.distance_m + sb.distance_m;
    const DIRECT_SPEED_MPS = 13.89;
    const legDur = path.duration_s + sa.distance_m / DIRECT_SPEED_MPS + sb.distance_m / DIRECT_SPEED_MPS;

    const leg: NavLeg = {
      idx: legs.length,
      from_stop_id: aId,
      to_stop_id: bId,
      distance_m: Math.round(legDist),
      duration_s: Math.round(legDur),
      geometry: encodePolyline6(coords),
      steps: offlineSteps,
    };

    totalDist += leg.distance_m;
    totalDur += leg.duration_s;
    legs.push(leg);
  }

  const bbox: BBox4 = bboxFromStopsOrLine(stops, { geometry: { coordinates: fullCoords } });

  const primary: NavRoute = {
    route_key: args.route_key,
    profile: prev.primary.profile,
    distance_m: Math.round(totalDist),
    duration_s: Math.round(totalDur),
    geometry: encodePolyline6(fullCoords),
    bbox,
    legs,
    provider: prev.primary.provider,
    created_at: new Date().toISOString(),
    algo_version: prev.primary.algo_version,
  };

  return {
    req: { ...prev.req, stops },
    primary,
    alternates: { alternates: [] },
  };
}

/**
 * Async wrapper: rebuilds navpack via corridor A*, then recomputes fuel
 * analysis using cached PlacesPack + vehicle profile.
 */
export async function rebuildNavpackOfflineWithFuel(args: {
  planId: string;
  prevNavpack: NavPack;
  corridor: CorridorGraphPack;
  stops: TripStop[];
  route_key: string;
  max_snap_m?: number;
  hazardZones?: HazardZone[];
  reason?: string;
}): Promise<{ navpack: NavPack; fuelAnalysis?: FuelAnalysis }> {
  const navpack = rebuildNavpackOffline({
    prevNavpack: args.prevNavpack,
    corridor: args.corridor,
    stops: args.stops,
    route_key: args.route_key,
    max_snap_m: args.max_snap_m,
    hazardZones: args.hazardZones,
  });

  // ── Recompute fuel on rerouted path ──
  try {
    const cachedPlaces = await getPack<PlacesPack>(args.planId, "places");
    if (cachedPlaces?.items?.length) {
      const fuelProfile = await getVehicleFuelProfile();

      const fuelAnalysis = reanalyzeFuelForReroute(
        navpack.primary.geometry,
        cachedPlaces.items,
        fuelProfile,
        args.reason ?? "reroute",
      );

      return { navpack, fuelAnalysis };
    }
  } catch (e) {
    console.warn("[rebuildNavpackOfflineWithFuel] fuel reanalysis failed:", e);
  }

  return { navpack };
}
