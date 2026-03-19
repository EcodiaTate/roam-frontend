// src/lib/nav/offline/corridorRouter.ts
"use client";

import type { CorridorGraphPack, CorridorNode, NavStep, NavManeuver, ManeuverType, ManeuverModifier } from "@/lib/types/navigation";
import type { TripStop } from "@/lib/types/trip";
import type { BBox4 } from "@/lib/types/geo";
import { haversineM } from "@/lib/nav/snapToRoute";

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
  /** Largest connected component - only these nodes are mutually reachable */
  mainComponent: Set<number> | null;
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

  // Find the largest connected component via BFS.
  // The corridor bbox grabs all roads in a spatial slice, which can include
  // disconnected fragments (roads across a river with no bridge, dead-end
  // service roads, etc.). Snapping stops to nodes on these fragments causes
  // A* to fail with "No path found". Constraining to the largest component
  // guarantees all snapped nodes are mutually reachable.
  const mainComponent = findLargestComponent(nodeById, adj);

  return { nodes: graph.nodes, nodeById, adj, mainComponent };
}

/**
 * BFS to find all connected components, return the largest one.
 */
function findLargestComponent(
  nodeById: Map<number, CorridorNode>,
  adj: Map<number, { to: number }[]>,
): Set<number> | null {
  if (nodeById.size === 0) return null;

  const visited = new Set<number>();
  let largest: Set<number> | null = null;

  for (const startId of nodeById.keys()) {
    if (visited.has(startId)) continue;

    // BFS from this unvisited node
    const component = new Set<number>();
    const queue = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.pop()!;
      component.add(current);

      const neighbors = adj.get(current);
      if (neighbors) {
        for (const nb of neighbors) {
          if (!visited.has(nb.to)) {
            visited.add(nb.to);
            queue.push(nb.to);
          }
        }
      }
    }

    if (!largest || component.size > largest.size) {
      largest = component;
    }
  }

  return largest;
}

/**
 * BFS from a single node to find its connected component.
 * Used to find what fragment a snapped stop belongs to.
 */
export function findComponentOf(idx: GraphIndex, startId: number): Set<number> {
  const component = new Set<number>();
  const queue = [startId];
  component.add(startId);

  while (queue.length > 0) {
    const current = queue.pop()!;
    const neighbors = idx.adj.get(current);
    if (neighbors) {
      for (const nb of neighbors) {
        if (!component.has(nb.to)) {
          component.add(nb.to);
          queue.push(nb.to);
        }
      }
    }
  }

  return component;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineM(a.lat, a.lng, b.lat, b.lng);
}

/**
 * Snap a stop to the nearest corridor node.
 * When `reachable` is provided, only considers nodes in that set -
 * this ensures the snapped node is on the main connected component.
 */
export function snapStopToNearestNode(
  idx: GraphIndex,
  stop: TripStop,
  reachable?: Set<number> | null,
): { nodeId: number; distance_m: number } {
  let bestId = -1;
  let best = Infinity;

  for (const n of idx.nodes) {
    if (reachable && !reachable.has(n.id)) continue;
    const d = haversineMeters({ lat: stop.lat, lng: stop.lng }, { lat: n.lat, lng: n.lng });
    if (d < best) {
      best = d;
      bestId = n.id;
    }
  }

  if (bestId < 0) throw new Error("Corridor graph has no nodes");
  return { nodeId: bestId, distance_m: best };
}

// --- Hazard zone type for penalized routing ---

/** A hazard zone that the A* router should penalize */
export type HazardZone = {
  lat: number;
  lng: number;
  radiusKm: number;
  /** Penalty multiplier: edges within the zone have cost multiplied by this. Higher = more avoidance. */
  penalty: number;
};

// --- A* (with binary min-heap for O(V log V) performance) ---

type CameFrom = Map<number, number>;
type Score = Map<number, number>;

/**
 * Binary min-heap keyed by fScore.
 * Handles the "decrease-key" pattern by allowing duplicate inserts;
 * stale entries are skipped at pop time via the closed set.
 */
class MinHeap {
  private heap: { nodeId: number; f: number }[] = [];

  get size() { return this.heap.length; }

  push(nodeId: number, f: number) {
    this.heap.push({ nodeId, f });
    this._bubbleUp(this.heap.length - 1);
  }

  pop(): number {
    if (this.heap.length === 0) return -1;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._sinkDown(0);
    }
    return top.nodeId;
  }

  private _bubbleUp(i: number) {
    const h = this.heap;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (h[i].f >= h[parent].f) break;
      [h[i], h[parent]] = [h[parent], h[i]];
      i = parent;
    }
  }

  private _sinkDown(i: number) {
    const h = this.heap;
    const n = h.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && h[l].f < h[smallest].f) smallest = l;
      if (r < n && h[r].f < h[smallest].f) smallest = r;
      if (smallest === i) break;
      [h[i], h[smallest]] = [h[smallest], h[i]];
      i = smallest;
    }
  }
}

export type PathResult = {
  nodeIds: number[];
  distance_m: number;
  duration_s: number;
};

/**
 * Compute the hazard penalty for an edge between two nodes.
 * If the edge midpoint is within a hazard zone's radius, the edge cost
 * is multiplied by the zone's penalty factor.
 *
 * Multiple zones stack multiplicatively.
 */
function hazardPenalty(
  idx: GraphIndex,
  fromId: number,
  toId: number,
  hazardZones: HazardZone[],
): number {
  if (hazardZones.length === 0) return 1;

  const a = idx.nodeById.get(fromId);
  const b = idx.nodeById.get(toId);
  if (!a || !b) return 1;

  // Check midpoint of edge against each hazard zone
  const midLat = (a.lat + b.lat) / 2;
  const midLng = (a.lng + b.lng) / 2;

  let multiplier = 1;
  for (const hz of hazardZones) {
    const dKm = haversineMeters({ lat: midLat, lng: midLng }, { lat: hz.lat, lng: hz.lng }) / 1000;
    if (dKm < hz.radiusKm) {
      // Penalty is strongest at centre, tapers linearly to edge of radius
      const proximity = 1 - (dKm / hz.radiusKm); // 1 at centre, 0 at edge
      const factor = 1 + (hz.penalty - 1) * proximity;
      multiplier *= factor;
    }
  }

  return multiplier;
}

export function aStar(idx: GraphIndex, startId: number, goalId: number, hazardZones?: HazardZone[]): PathResult {
  if (startId === goalId) return { nodeIds: [startId], distance_m: 0, duration_s: 0 };

  const zones = hazardZones ?? [];
  const closed = new Set<number>();
  const cameFrom: CameFrom = new Map();
  const gScore: Score = new Map([[startId, 0]]);

  const heap = new MinHeap();
  heap.push(startId, heuristic(idx, startId, goalId));

  // For quick cost lookup between consecutive nodes (for metrics reconstruction)
  const edgeCost = (a: number, b: number) => {
    const list = idx.adj.get(a) ?? [];
    for (const e of list) if (e.to === b) return e;
    return null;
  };

  while (heap.size > 0) {
    const current = heap.pop();
    if (current === -1) break;

    // Skip stale heap entries (node already expanded with a better score)
    if (closed.has(current)) continue;
    closed.add(current);

    if (current === goalId) {
      const nodeIds = reconstructPath(cameFrom, current);
      // Reconstruct actual (unpenalized) distance/duration for the path
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

    const neighbors = idx.adj.get(current) ?? [];
    const gCur = gScore.get(current) ?? Infinity;

    for (const nb of neighbors) {
      if (closed.has(nb.to)) continue;

      // Apply hazard penalty to edge cost so A* naturally avoids hazard zones
      const penalty = hazardPenalty(idx, current, nb.to, zones);
      const tentative = gCur + nb.distance_m * penalty;
      const gNb = gScore.get(nb.to) ?? Infinity;
      if (tentative < gNb) {
        cameFrom.set(nb.to, current);
        gScore.set(nb.to, tentative);
        const f = tentative + heuristic(idx, nb.to, goalId);
        heap.push(nb.to, f);
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

// --- Offline step synthesis from corridor paths ---

/**
 * Compute bearing (0-360°) from point A to point B.
 */
function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/**
 * Classify a bearing delta into a turn type.
 * delta is signed degrees: positive = right, negative = left
 */
function classifyTurn(delta: number): { type: ManeuverType; modifier: ManeuverModifier } {
  const abs = Math.abs(delta);
  const side = delta >= 0 ? "right" : "left";
  if (abs < 20) return { type: "continue", modifier: "straight" };
  if (abs < 55) return { type: "turn", modifier: side === "right" ? "slight right" : "slight left" };
  if (abs < 120) return { type: "turn", modifier: side };
  if (abs < 160) return { type: "turn", modifier: side === "right" ? "sharp right" : "sharp left" };
  return { type: "turn", modifier: "uturn" };
}

/**
 * Synthesize basic NavSteps from a corridor A* path.
 * Groups consecutive "continue" nodes into single long steps,
 * only creating a new step when a turn is detected (bearing change > 20°).
 *
 * Produces: depart → [turn steps...] → arrive
 */
export function synthesizeStepsFromPath(
  idx: GraphIndex,
  nodeIds: number[],
): NavStep[] {
  if (nodeIds.length < 2) return [];

  const nodes: CorridorNode[] = [];
  for (const id of nodeIds) {
    const n = idx.nodeById.get(id);
    if (n) nodes.push(n);
  }
  if (nodes.length < 2) return [];

  // Compute edges between consecutive nodes
  type Edge = { from: CorridorNode; to: CorridorNode; dist_m: number; dur_s: number; bearing: number };
  const edges: Edge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const dist_m = haversineMeters(a, b);
    const adjEdge = idx.adj.get(a.id)?.find(e => e.to === b.id);
    const dur_s = adjEdge?.duration_s ?? (dist_m / 13.89); // fallback: 50km/h
    edges.push({
      from: a, to: b, dist_m, dur_s,
      bearing: bearing(a.lat, a.lng, b.lat, b.lng),
    });
  }

  const steps: NavStep[] = [];
  let isFirstStep = true;
  let stepDist = 0;
  let stepDur = 0;
  const stepCoords: [number, number][] = [[edges[0].from.lng, edges[0].from.lat]];

  // The maneuver for the step being accumulated.
  // First step always gets "depart"; turn steps get the turn maneuver;
  // the final flush always gets "arrive".
  let pendingManeuver: NavManeuver = {
    type: "depart",
    location: [edges[0].from.lng, edges[0].from.lat],
    bearing_before: 0,
    bearing_after: edges[0].bearing,
  };

  function flushStep(maneuverOverride?: NavManeuver) {
    if (stepDist <= 0 && stepCoords.length < 2) return;
    steps.push({
      maneuver: maneuverOverride ?? pendingManeuver,
      name: "",
      distance_m: Math.round(stepDist),
      duration_s: Math.round(stepDur),
      geometry: encodePolyline6([...stepCoords]),
      mode: "driving",
    });
  }

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    stepDist += edge.dist_m;
    stepDur += edge.dur_s;
    stepCoords.push([edge.to.lng, edge.to.lat]);

    const nextEdge = i + 1 < edges.length ? edges[i + 1] : null;

    if (nextEdge) {
      let delta = nextEdge.bearing - edge.bearing;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      if (Math.abs(delta) >= 20) {
        // Significant turn - flush the accumulated step
        flushStep();
        isFirstStep = false;

        // Start a new step with the turn maneuver
        const { type, modifier } = classifyTurn(delta);
        pendingManeuver = {
          type,
          modifier,
          location: [edge.to.lng, edge.to.lat],
          bearing_before: edge.bearing,
          bearing_after: nextEdge.bearing,
        };

        stepDist = 0;
        stepDur = 0;
        stepCoords.length = 0;
        stepCoords.push([edge.to.lng, edge.to.lat]);
      }
    } else {
      // Last edge - flush everything as an arrive step
      const arriveManeuver: NavManeuver = {
        type: "arrive",
        location: [edge.to.lng, edge.to.lat],
        bearing_before: edge.bearing,
        bearing_after: 0,
      };

      if (isFirstStep) {
        // Entire path was one straight segment: emit depart + arrive
        flushStep(); // depart step with all accumulated distance
        // Add a zero-distance arrive step at the end
        steps.push({
          maneuver: arriveManeuver,
          name: "",
          distance_m: 0,
          duration_s: 0,
          geometry: encodePolyline6([[edge.to.lng, edge.to.lat]]),
          mode: "driving",
        });
      } else {
        // Normal: flush the last segment as an arrive step
        flushStep(arriveManeuver);
      }
    }
  }

  return steps;
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
