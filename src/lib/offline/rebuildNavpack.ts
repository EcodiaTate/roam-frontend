// src/lib/offline/rebuildNavpack.ts
"use client";

import type { NavPack, NavLeg, NavRoute, CorridorGraphPack } from "@/lib/types/navigation";
import type { TripStop } from "@/lib/types/trip";
import type { BBox4 } from "@/lib/types/geo";

import {
  indexCorridorGraph,
  snapStopToNearestNode,
  aStar,
  pathToGeoJSON,
  encodePolyline6,
  bboxFromStopsOrLine,
} from "@/lib/offline/corridorRouter";

const DEFAULT_MAX_SNAP_M = 1500;

function safeStopId(s: TripStop, idx: number) {
  const id = s.id;
  if (typeof id === "string" && id.length) return id;
  return `${s.type ?? "poi"}_${idx}`;
}

export function rebuildNavpackOffline(args: {
  prevNavpack: NavPack;
  corridor: CorridorGraphPack;
  stops: TripStop[];
  route_key: string; //  must change when stops change
  max_snap_m?: number;
}): NavPack {
  const prev = args.prevNavpack;
  const corridor = args.corridor;
  const stops = args.stops;

  if (!stops || stops.length < 2) throw new Error("Need at least 2 stops");
  if (!corridor?.nodes?.length) throw new Error("Corridor graph has no nodes");

  const idx = indexCorridorGraph(corridor);
  const maxSnap = args.max_snap_m ?? DEFAULT_MAX_SNAP_M;

  const legs: NavLeg[] = [];
  const fullCoords: [number, number][] = [];

  let totalDist = 0;
  let totalDur = 0;

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];

    const sa = snapStopToNearestNode(idx, a);
    if (sa.distance_m > maxSnap) {
      throw new Error(
        `Stop '${a.name ?? safeStopId(a, i)}' too far from corridor (${Math.round(sa.distance_m)}m)`,
      );
    }

    const sb = snapStopToNearestNode(idx, b);
    if (sb.distance_m > maxSnap) {
      throw new Error(
        `Stop '${b.name ?? safeStopId(b, i + 1)}' too far from corridor (${Math.round(sb.distance_m)}m)`,
      );
    }

    const path = aStar(idx, sa.nodeId, sb.nodeId);
    const geo = pathToGeoJSON(idx, path.nodeIds);

    const coords = geo.geometry.coordinates as [number, number][];
    if (coords.length) {
      if (fullCoords.length) fullCoords.push(...coords.slice(1)); // avoid duplicate join point
      else fullCoords.push(...coords);
    }

    const leg: NavLeg = {
      idx: i,
      from_stop_id: safeStopId(a, i),
      to_stop_id: safeStopId(b, i + 1),
      distance_m: Math.round(path.distance_m),
      duration_s: Math.round(path.duration_s),
      geometry: encodePolyline6(coords),
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
