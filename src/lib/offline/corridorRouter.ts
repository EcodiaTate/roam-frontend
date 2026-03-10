// src/lib/nav/offline/corridorRouter.ts
"use client";

import type { CorridorGraphPack, CorridorNode, CorridorEdge } from "@/lib/types/navigation";
import type { TripStop } from "@/lib/types/trip";
import type { BBox4 } from "@/lib/types/geo";

/**
 * Corridor offline router:
 * - snap stops to nearest corridor node
 * - run A* over corridor edges
 * - return path nodes + metrics + GeoJSON + polyline6
 *
 * NOTE: This is designed for corridor slices (small graphs).
 * Brute force snapping is OK.
 */

export type GraphIndex = {
  nodes: CorridorNode[];
  nodeById: Map<number, CorridorNode>;
  adj: Map<number, { to: number; distance_m: number; duration_s: number }[]>;
};

export function indexCorridorGraph(graph: CorridorGraphPack): GraphIndex {
  const nodeById = new Map<number, CorridorNode>();
  for (const n of graph.nodes) nodeById.set(n.id, n);

  const adj = new Map<number, { to: number; distance_m: number; duration_s: number }[]>();
  const push = (a: number, to: number, distance_m: number, duration_s: number) => {
    const arr = adj.get(a) ?? [];
    arr.push({ to, distance_m, duration_s });
    adj.set(a, arr);
  };

  for (const e of graph.edges) {
    push(e.a, e.b, e.distance_m, e.duration_s);
    push(e.b, e.a, e.distance_m, e.duration_s);
  }

  return { nodes: graph.nodes, nodeById, adj };
}

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function snapStopToNearestNode(idx: GraphIndex, stop: TripStop): { nodeId: number; distance_m: number } {
  let bestId = -1;
  let best = Infinity;

  for (const n of idx.nodes) {
    const d = haversineMeters({ lat: stop.lat, lng: stop.lng }, { lat: n.lat, lng: n.lng });
    if (d < best) {
      best = d;
      bestId = n.id;
    }
  }

  if (bestId < 0) throw new Error("Corridor graph has no nodes");
  return { nodeId: bestId, distance_m: best };
}

// --- A* (Dijkstra if heuristic=0, but we use haversine to goal) ---

type CameFrom = Map<number, number>;
type Score = Map<number, number>;

function popLowest(open: Set<number>, fScore: Score): number {
  let bestNode = -1;
  let bestVal = Infinity;
  for (const n of open) {
    const v = fScore.get(n) ?? Infinity;
    if (v < bestVal) {
      bestVal = v;
      bestNode = n;
    }
  }
  return bestNode;
}

export type PathResult = {
  nodeIds: number[];
  distance_m: number;
  duration_s: number;
};

export function aStar(idx: GraphIndex, startId: number, goalId: number): PathResult {
  if (startId === goalId) return { nodeIds: [startId], distance_m: 0, duration_s: 0 };

  const open = new Set<number>([startId]);
  const cameFrom: CameFrom = new Map();

  const gScore: Score = new Map([[startId, 0]]);
  const fScore: Score = new Map([[startId, heuristic(idx, startId, goalId)]]);

  // For quick cost lookup between consecutive nodes (for metrics reconstruction)
  const edgeCost = (a: number, b: number) => {
    const list = idx.adj.get(a) ?? [];
    for (const e of list) if (e.to === b) return e;
    return null;
  };

  while (open.size) {
    const current = popLowest(open, fScore);
    if (current === -1) break;

    if (current === goalId) {
      const nodeIds = reconstructPath(cameFrom, current);
      let dist = 0;
      let dur = 0;
      for (let i = 0; i < nodeIds.length - 1; i++) {
        const a = nodeIds[i];
        const b = nodeIds[i + 1];
        const c = edgeCost(a, b);
        if (c) {
          dist += c.distance_m;
          dur += c.duration_s;
        }
      }
      return { nodeIds, distance_m: dist, duration_s: dur };
    }

    open.delete(current);

    const neighbors = idx.adj.get(current) ?? [];
    const gCur = gScore.get(current) ?? Infinity;

    for (const nb of neighbors) {
      const tentative = gCur + nb.distance_m; // distance-based gScore
      const gNb = gScore.get(nb.to) ?? Infinity;
      if (tentative < gNb) {
        cameFrom.set(nb.to, current);
        gScore.set(nb.to, tentative);
        fScore.set(nb.to, tentative + heuristic(idx, nb.to, goalId));
        open.add(nb.to);
      }
    }
  }

  throw new Error("No path found in corridor graph");
}

function heuristic(idx: GraphIndex, aId: number, bId: number) {
  const a = idx.nodeById.get(aId);
  const b = idx.nodeById.get(bId);
  if (!a || !b) return 0;
  return haversineMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
}

function reconstructPath(cameFrom: CameFrom, current: number): number[] {
  const out = [current];
  while (cameFrom.has(current)) {
    current = cameFrom.get(current)!;
    out.push(current);
  }
  out.reverse();
  return out;
}

// --- Path -> geometry helpers ---

export function pathToGeoJSON(idx: GraphIndex, nodeIds: number[]) {
  const coords: [number, number][] = [];
  for (const id of nodeIds) {
    const n = idx.nodeById.get(id);
    if (!n) continue;
    coords.push([n.lng, n.lat]);
  }
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: {},
  } as const;
}

export function bboxFromStopsOrLine(stops: TripStop[], line?: { geometry: { coordinates: [number, number][] } }): BBox4 {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;

  const eat = (lng: number, lat: number) => {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  };

  for (const s of stops) eat(s.lng, s.lat);
  if (line) for (const [lng, lat] of line.geometry.coordinates) eat(lng, lat);

  if (!isFinite(minLng)) {
    minLng = 0;
    minLat = 0;
    maxLng = 0;
    maxLat = 0;
  }

  return { minLng, minLat, maxLng, maxLat };
}

/**
 * Minimal polyline6 encoder (Google polyline algorithm with 1e6 precision).
 * Produces the same format you’re using (polyline6).
 */
export function encodePolyline6(coords: [number, number][]): string {
  let lastLat = 0;
  let lastLng = 0;
  let out = "";

  for (const [lng, lat] of coords) {
    const ilat = Math.round(lat * 1e6);
    const ilng = Math.round(lng * 1e6);

    out += encodeSigned(ilat - lastLat);
    out += encodeSigned(ilng - lastLng);

    lastLat = ilat;
    lastLng = ilng;
  }

  return out;
}

function encodeSigned(num: number) {
  let sgn = num << 1;
  if (num < 0) sgn = ~sgn;
  return encodeUnsigned(sgn);
}
function encodeUnsigned(num: number) {
  let out = "";
  while (num >= 0x20) {
    out += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  out += String.fromCharCode(num + 63);
  return out;
}
