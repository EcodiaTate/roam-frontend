// src/lib/nav/snapToRoute.ts
// ──────────────────────────────────────────────────────────────
// Polyline geometry helpers for snapping points to routes
// and computing distances along polylines.
//
// Pure functions - no side effects, no API calls. Works offline.
// ──────────────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;

/** Haversine distance in kilometres between two lat/lng points */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  return haversineM(lat1, lng1, lat2, lng2) / 1000;
}

/** Haversine distance in metres between two lat/lng points */
export function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Build a cumulative distance array (in km) for each vertex of a decoded polyline.
 * cumulativeKm[0] = 0, cumulativeKm[i] = distance from start to vertex i.
 */
export function cumulativeKm(decoded: Array<{ lat: number; lng: number }>): number[] {
  const km: number[] = [0];
  for (let i = 1; i < decoded.length; i++) {
    const prev = decoded[i - 1];
    const curr = decoded[i];
    const segM = haversineM(prev.lat, prev.lng, curr.lat, curr.lng);
    km.push(km[i - 1] + segM / 1000);
  }
  return km;
}

/**
 * Snap a point to the nearest segment of a polyline.
 *
 * Returns:
 * - km: distance along route to the closest point on the polyline
 * - distance_m: perpendicular distance from the point to that closest point
 * - side: "left" | "right" | "on_route" relative to direction of travel
 * - segIdx: index of the segment [segIdx, segIdx+1] where the snap landed
 * - t: interpolation parameter 0..1 along that segment
 */
export function snapToPolyline(
  point: { lat: number; lng: number },
  decoded: Array<{ lat: number; lng: number }>,
  cumKm: number[],
): {
  km: number;
  distance_m: number;
  side: "left" | "right" | "on_route";
  segIdx: number;
  t: number;
} {
  let bestDist = Infinity;
  let bestKm = 0;
  let bestSeg = 0;
  let bestT = 0;
  let bestSide: "left" | "right" | "on_route" = "on_route";

  for (let i = 0; i < decoded.length - 1; i++) {
    const a = decoded[i];
    const b = decoded[i + 1];
    const proj = projectPointOnSegment(point, a, b);

    if (proj.distance_m < bestDist) {
      bestDist = proj.distance_m;
      bestSeg = i;
      bestT = proj.t;
      // km along route = cumulative km at segment start + fraction of segment
      const segLenKm = cumKm[i + 1] - cumKm[i];
      bestKm = cumKm[i] + proj.t * segLenKm;
      bestSide = proj.distance_m < 15 ? "on_route" : computeSide(point, a, b);
    }
  }

  return { km: bestKm, distance_m: bestDist, side: bestSide, segIdx: bestSeg, t: bestT };
}

/**
 * Project a point onto a line segment AB. Returns the closest point
 * parameterized by t ∈ [0, 1] and the distance in metres.
 */
function projectPointOnSegment(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): { t: number; distance_m: number; closeLat: number; closeLng: number } {
  // Work in a local flat approximation (good enough for short segments)
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * DEG_TO_RAD);
  const ax = a.lng * cosLat;
  const ay = a.lat;
  const bx = b.lng * cosLat;
  const by = b.lat;
  const px = p.lng * cosLat;
  const py = p.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let t: number;
  if (lenSq < 1e-18) {
    t = 0;
  } else {
    t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const closeLat = a.lat + t * (b.lat - a.lat);
  const closeLng = a.lng + t * (b.lng - a.lng);
  const distance_m = haversineM(p.lat, p.lng, closeLat, closeLng);

  return { t, distance_m, closeLat, closeLng };
}

/**
 * Determine which side of the direction of travel a point is on.
 * Uses cross product of AB × AP in flat-earth approximation.
 */
function computeSide(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): "left" | "right" {
  const cosLat = Math.cos(((a.lat + b.lat) / 2) * DEG_TO_RAD);
  const abx = (b.lng - a.lng) * cosLat;
  const aby = b.lat - a.lat;
  const apx = (p.lng - a.lng) * cosLat;
  const apy = p.lat - a.lat;
  const cross = abx * apy - aby * apx;
  // In the southern hemisphere (Australia), positive cross = right
  return cross >= 0 ? "right" : "left";
}

/* ── Spatial grid index for fast snap on long polylines ──────────────── */

/**
 * Pre-built spatial index that partitions polyline segments into grid cells.
 * Build once with `buildPolylineIndex()`, then pass to `snapToPolylineIndexed()`
 * for O(1) amortised snap instead of O(n) linear scan.
 */
export type PolylineIndex = {
  decoded: Array<{ lat: number; lng: number }>;
  cumKm: number[];
  /** Map from "gridRow,gridCol" → array of segment indices in that cell */
  grid: Map<string, number[]>;
  cellSize: number; // degrees per cell
  minLat: number;
  minLng: number;
};

/**
 * Build a spatial grid index over the polyline segments.
 * Each segment is placed into every grid cell its bounding box touches.
 * Cost: O(n) - do this once when the route loads.
 */
export function buildPolylineIndex(
  decoded: Array<{ lat: number; lng: number }>,
  cumKm: number[],
  cellSizeDeg = 0.1, // ~11km at equator, ~9km at -27° (QLD)
): PolylineIndex {
  let minLat = Infinity, minLng = Infinity;
  for (const p of decoded) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
  }

  const grid = new Map<string, number[]>();

  for (let i = 0; i < decoded.length - 1; i++) {
    const a = decoded[i];
    const b = decoded[i + 1];

    const rMin = Math.floor((Math.min(a.lat, b.lat) - minLat) / cellSizeDeg);
    const rMax = Math.floor((Math.max(a.lat, b.lat) - minLat) / cellSizeDeg);
    const cMin = Math.floor((Math.min(a.lng, b.lng) - minLng) / cellSizeDeg);
    const cMax = Math.floor((Math.max(a.lng, b.lng) - minLng) / cellSizeDeg);

    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const key = `${r},${c}`;
        let bucket = grid.get(key);
        if (!bucket) { bucket = []; grid.set(key, bucket); }
        bucket.push(i);
      }
    }
  }

  return { decoded, cumKm, grid, cellSize: cellSizeDeg, minLat, minLng };
}

/**
 * Snap a point using a pre-built spatial index.
 * Only checks segments in nearby grid cells - typically 5-50 segments
 * instead of 20,000-50,000 for a long route.
 */
export function snapToPolylineIndexed(
  point: { lat: number; lng: number },
  idx: PolylineIndex,
): {
  km: number;
  distance_m: number;
  side: "left" | "right" | "on_route";
  segIdx: number;
  t: number;
} {
  const { decoded, cumKm, grid, cellSize, minLat, minLng } = idx;

  const pRow = Math.floor((point.lat - minLat) / cellSize);
  const pCol = Math.floor((point.lng - minLng) / cellSize);

  // Search the point's cell + 1-ring of neighbours
  const checked = new Set<number>();
  let bestDist = Infinity;
  let bestKm = 0;
  let bestSeg = 0;
  let bestT = 0;
  let bestSide: "left" | "right" | "on_route" = "on_route";

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const bucket = grid.get(`${pRow + dr},${pCol + dc}`);
      if (!bucket) continue;
      for (const i of bucket) {
        if (checked.has(i)) continue;
        checked.add(i);

        const a = decoded[i];
        const b = decoded[i + 1];
        const proj = projectPointOnSegment(point, a, b);

        if (proj.distance_m < bestDist) {
          bestDist = proj.distance_m;
          bestSeg = i;
          bestT = proj.t;
          const segLenKm = cumKm[i + 1] - cumKm[i];
          bestKm = cumKm[i] + proj.t * segLenKm;
          bestSide = proj.distance_m < 15 ? "on_route" : computeSide(point, a, b);
        }
      }
    }
  }

  // Fallback: if point is far from all grid cells (shouldn't happen on-route),
  // fall back to full linear scan
  if (bestDist === Infinity) {
    return snapToPolyline(point, decoded, cumKm);
  }

  return { km: bestKm, distance_m: bestDist, side: bestSide, segIdx: bestSeg, t: bestT };
}

/**
 * Interpolate a lat/lng position at a given km along the route.
 */
function interpolateAlongRoute(
  km: number,
  decoded: Array<{ lat: number; lng: number }>,
  cumKm: number[],
): { lat: number; lng: number } {
  if (km <= 0) return decoded[0];
  if (km >= cumKm[cumKm.length - 1]) return decoded[decoded.length - 1];

  // Binary search for the segment
  let lo = 0;
  let hi = cumKm.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumKm[mid] <= km) lo = mid;
    else hi = mid;
  }

  const segLen = cumKm[hi] - cumKm[lo];
  const t = segLen > 0 ? (km - cumKm[lo]) / segLen : 0;
  const a = decoded[lo];
  const b = decoded[hi];

  return {
    lat: a.lat + t * (b.lat - a.lat),
    lng: a.lng + t * (b.lng - a.lng),
  };
}

/**
 * Total route length in km from a cumulative km array.
 */
export function totalRouteKm(cumKm: number[]): number {
  return cumKm.length > 0 ? cumKm[cumKm.length - 1] : 0;
}
