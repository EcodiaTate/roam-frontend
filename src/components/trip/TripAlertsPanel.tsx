// src/components/trip/TripAlertsPanel.tsx
"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import type {
  TrafficOverlay,
  HazardOverlay,
  TrafficEvent,
  HazardEvent,
  TrafficSeverity,
  TrafficType,
  HazardSeverity,
  HazardKind,
} from "@/lib/types/navigation";
import type { RoamPosition } from "@/lib/native/geolocation";
import { haptic } from "@/lib/native/haptics";

import {
  CircleX,
  Droplets,
  Car,
  Construction,
  TriangleAlert,
  Siren,
  CircleHelp,
  CloudRain,
  Tornado,
  CloudLightning,
  Flame,
  Wind,
  Thermometer,
  Waves,
  Zap,
  ShieldCheck,
  ChevronDown,
  MapPin,
  Eye,
  EyeOff,
  Clock,
  XCircle,
  OctagonAlert,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Route,
  Ban,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════════════ */

export type RouteImpact = "blocks_route" | "affects_route" | "nearby" | "informational";

export type AlertHighlightEvent = {
  id: string;
  kind: "traffic" | "hazard";
  lat: number;
  lng: number;
};

export type EnrichedAlert = {
  id: string;
  alertKind: "traffic" | "hazard";
  headline: string;
  description?: string | null;
  iconKey: string;
  severity: string;
  sevOrder: number;
  sevColor: string;
  sevBg: string;
  sevLabel: string;
  typeLabel: string;
  source?: string | null;
  timestamp?: string | null;
  coord: { lat: number; lng: number } | null;
  distFromUserKm: number | null;
  kmAlongRoute: number | null;
  distFromRouteKm: number | null;
  contextLabel: string;
  relevanceScore: number;
  // ── BETTER_NAV additions ──
  routeImpact: RouteImpact;
  isAhead: boolean;
  /** Original raw geometry for intersection tests */
  rawGeometry?: any;
};

/* ══════════════════════════════════════════════════════════════════════
   Config — severity palettes
   ══════════════════════════════════════════════════════════════════════ */

const T_SEV: Record<TrafficSeverity, { color: string; bg: string; label: string; order: number }> = {
  major:    { color: "#ef4444", bg: "rgba(239,68,68,0.12)",   label: "Major",    order: 0 },
  moderate: { color: "#f59e0b", bg: "rgba(245,158,11,0.10)",  label: "Moderate", order: 1 },
  minor:    { color: "#3b82f6", bg: "rgba(59,130,246,0.10)",  label: "Minor",    order: 2 },
  info:     { color: "#64748b", bg: "rgba(100,116,139,0.08)", label: "Info",     order: 3 },
  unknown:  { color: "#64748b", bg: "rgba(100,116,139,0.08)", label: "Unknown",  order: 4 },
};

const H_SEV: Record<HazardSeverity, { color: string; bg: string; label: string; order: number }> = {
  high:    { color: "#dc2626", bg: "rgba(220,38,38,0.12)",   label: "High",    order: 0 },
  medium:  { color: "#ea580c", bg: "rgba(234,88,12,0.10)",   label: "Medium",  order: 1 },
  low:     { color: "#2563eb", bg: "rgba(37,99,235,0.10)",   label: "Low",     order: 2 },
  unknown: { color: "#64748b", bg: "rgba(100,116,139,0.08)", label: "Unknown", order: 3 },
};

/* ══════════════════════════════════════════════════════════════════════
   Route impact palettes
   ══════════════════════════════════════════════════════════════════════ */

const IMPACT_CONFIG: Record<RouteImpact, { label: string; color: string; bg: string; order: number }> = {
  blocks_route:  { label: "Route blocked", color: "#dc2626", bg: "rgba(220,38,38,0.14)", order: 0 },
  affects_route: { label: "On route",      color: "#ea580c", bg: "rgba(234,88,12,0.12)", order: 1 },
  nearby:        { label: "Nearby",        color: "#f59e0b", bg: "rgba(245,158,11,0.10)", order: 2 },
  informational: { label: "In region",     color: "#64748b", bg: "rgba(100,116,139,0.06)", order: 3 },
};

/* ══════════════════════════════════════════════════════════════════════
   Icon keys (used for both map SVG + React Lucide rendering)
   ══════════════════════════════════════════════════════════════════════ */

const T_ICON_KEYS: Record<TrafficType, string> = {
  closure: "closure", flooding: "flooding", congestion: "congestion",
  roadworks: "roadworks", hazard: "hazard", incident: "incident", unknown: "unknown",
};

const H_ICON_KEYS: Record<HazardKind, string> = {
  flood: "flood", cyclone: "cyclone", storm: "storm", fire: "fire",
  wind: "wind", heat: "heat", marine: "marine", weather_warning: "weather_warning", unknown: "h_unknown",
};

/* ── Lucide icon map for React rendering ──────────────────────────── */

const LUCIDE_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>> = {
  closure: CircleX,
  flooding: Droplets,
  congestion: Car,
  roadworks: Construction,
  hazard: TriangleAlert,
  incident: Siren,
  unknown: CircleHelp,
  flood: CloudRain,
  cyclone: Tornado,
  storm: CloudLightning,
  fire: Flame,
  wind: Wind,
  heat: Thermometer,
  marine: Waves,
  weather_warning: Zap,
  h_unknown: TriangleAlert,
};

const ICON_COLORS: Record<string, string> = {
  closure: "#ef4444",
  flooding: "#3b82f6",
  congestion: "#f59e0b",
  roadworks: "#f97316",
  hazard: "#eab308",
  incident: "#ef4444",
  unknown: "#64748b",
  flood: "#3b82f6",
  cyclone: "#7c3aed",
  storm: "#6366f1",
  fire: "#ef4444",
  wind: "#64748b",
  heat: "#ea580c",
  marine: "#0ea5e9",
  weather_warning: "#eab308",
  h_unknown: "#64748b",
};

function AlertIcon({ iconKey, size = 16 }: { iconKey: string; size?: number }) {
  const Comp = LUCIDE_ICONS[iconKey] ?? TriangleAlert;
  const color = ICON_COLORS[iconKey] ?? "#64748b";
  return <Comp size={size} strokeWidth={2.2} color={color} />;
}

/* ══════════════════════════════════════════════════════════════════════
   Geo helpers
   ══════════════════════════════════════════════════════════════════════ */

function decodePolyline6(poly: string): Array<[number, number]> {
  let index = 0, lat = 0, lng = 0;
  const out: Array<[number, number]> = [];
  while (index < poly.length) {
    let r = 0, s = 0, b: number;
    do { b = poly.charCodeAt(index++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lat += r & 1 ? ~(r >> 1) : r >> 1;
    r = 0; s = 0;
    do { b = poly.charCodeAt(index++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lng += r & 1 ? ~(r >> 1) : r >> 1;
    out.push([lng / 1e6, lat / 1e6]);
  }
  return out;
}

const D2R = Math.PI / 180;
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * D2R, dLng = (lng2 - lng1) * D2R;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function projectOntoRoute(lat: number, lng: number, rc: Array<[number, number]>): { kmAlong: number; distKm: number } {
  let best = Infinity, bestKm = 0, cum = 0;
  for (let i = 0; i < rc.length - 1; i++) {
    const [aLng, aLat] = rc[i], [bLng, bLat] = rc[i + 1];
    const seg = haversineKm(aLat, aLng, bLat, bLng);
    const dx = bLng - aLng, dy = bLat - aLat, len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) t = Math.max(0, Math.min(1, ((lng - aLng) * dx + (lat - aLat) * dy) / len2));
    const d = haversineKm(lat, lng, aLat + t * dy, aLng + t * dx);
    if (d < best) { best = d; bestKm = cum + t * seg; }
    cum += seg;
  }
  return { kmAlong: bestKm, distKm: best };
}

export function extractCoord(geo: any, bbox: number[] | null | undefined): { lat: number; lng: number } | null {
  if (geo) {
    if (geo.type === "Point" && Array.isArray(geo.coordinates)) return { lng: geo.coordinates[0], lat: geo.coordinates[1] };
    if (geo.type === "LineString" && geo.coordinates?.length > 0) {
      const mid = geo.coordinates[Math.floor(geo.coordinates.length / 2)];
      return Array.isArray(mid) ? { lng: mid[0], lat: mid[1] } : null;
    }
    if ((geo.type === "Polygon" || geo.type === "MultiPolygon") && geo.coordinates) {
      const ring = geo.type === "Polygon" ? geo.coordinates[0] : geo.coordinates[0]?.[0];
      if (Array.isArray(ring) && ring.length) {
        let sLng = 0, sLat = 0;
        for (const c of ring) { sLng += c[0]; sLat += c[1]; }
        return { lng: sLng / ring.length, lat: sLat / ring.length };
      }
    }
  }
  if (bbox && bbox.length === 4) return { lng: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
  return null;
}

/* ══════════════════════════════════════════════════════════════════════
   Route Impact Classification — BETTER_NAV #2

   Tests whether alert geometry actually intersects the route polyline
   buffer.  This is the core safety feature — distinguishing "closure
   ON your road" from "closure 2km away on a different road."
   ══════════════════════════════════════════════════════════════════════ */

/** Types that indicate a physical road blockage */
const BLOCKING_TRAFFIC_TYPES = new Set<string>(["closure", "flooding"]);
const BLOCKING_HAZARD_KINDS = new Set<string>(["flood", "fire", "cyclone"]);

/**
 * Extracts ALL coordinates from any GeoJSON geometry for intersection
 * testing.  Returns array of [lng, lat] pairs.
 */
function extractAllCoords(geo: any): Array<[number, number]> {
  if (!geo) return [];
  switch (geo.type) {
    case "Point":
      return [geo.coordinates as [number, number]];
    case "MultiPoint":
    case "LineString":
      return (geo.coordinates ?? []) as Array<[number, number]>;
    case "MultiLineString":
    case "Polygon":
      return ((geo.coordinates ?? []) as Array<Array<[number, number]>>).flat();
    case "MultiPolygon":
      return ((geo.coordinates ?? []) as Array<Array<Array<[number, number]>>>).flat(2);
    default:
      return [];
  }
}

/**
 * Tests if ANY point of an alert's geometry is within the route buffer.
 * Returns the minimum distance in km.
 *
 * For performance on long routes (2000+ km), we subsample the route
 * polyline — checking every Nth vertex — and early-exit when we find
 * something close enough.
 */
function minDistanceToRoute(
  alertCoords: Array<[number, number]>,
  routeCoords: Array<[number, number]>,
): number {
  if (alertCoords.length === 0 || routeCoords.length === 0) return Infinity;

  // Subsample route to ~500 check-points max
  const step = Math.max(1, Math.floor(routeCoords.length / 500));
  let minDist = Infinity;

  for (const [aLng, aLat] of alertCoords) {
    for (let i = 0; i < routeCoords.length - 1; i += step) {
      const [rLng, rLat] = routeCoords[i];
      const d = haversineKm(aLat, aLng, rLat, rLng);
      if (d < minDist) minDist = d;
      // Early exit — anything within 100m is definitely on-route
      if (minDist < 0.1) return minDist;
    }
    // Always check the last point
    const [lastLng, lastLat] = routeCoords[routeCoords.length - 1];
    const dLast = haversineKm(aLat, aLng, lastLat, lastLng);
    if (dLast < minDist) minDist = dLast;
  }

  return minDist;
}

/**
 * Classify how an alert impacts the route.
 *
 * - geometry within 0.5km AND blocking type  → blocks_route
 * - geometry within 0.5km, non-blocking      → affects_route
 * - geometry within 2km AND blocking type     → affects_route (safety margin)
 * - centroid within 5km                       → nearby
 * - everything else                           → informational
 */
function classifyRouteImpact(
  alertKind: "traffic" | "hazard",
  alertType: string,
  alertGeometry: any,
  alertBbox: number[] | null | undefined,
  routeCoords: Array<[number, number]>,
  distFromRouteKm: number | null,
): RouteImpact {
  if (!routeCoords || routeCoords.length < 2) return "informational";

  const alertCoords = extractAllCoords(alertGeometry);
  let closestKm: number;

  if (alertCoords.length > 0) {
    closestKm = minDistanceToRoute(alertCoords, routeCoords);
  } else if (distFromRouteKm != null) {
    closestKm = distFromRouteKm;
  } else {
    return "informational";
  }

  const isBlockingType = alertKind === "traffic"
    ? BLOCKING_TRAFFIC_TYPES.has(alertType)
    : BLOCKING_HAZARD_KINDS.has(alertType);

  if (closestKm <= 0.5) {
    return isBlockingType ? "blocks_route" : "affects_route";
  }
  if (closestKm <= 2.0 && isBlockingType) {
    return "affects_route";
  }
  if (closestKm <= 5.0) {
    return "nearby";
  }
  return "informational";
}

/* ══════════════════════════════════════════════════════════════════════
   Cross-Overlay Deduplication — BETTER_NAV #8b

   Same real-world event can appear as both a TrafficEvent (type
   "flooding") and a HazardEvent (kind "flood") from different sources.
   Merge by proximity — if two alerts of related types are within 2km,
   keep the higher-severity one.
   ══════════════════════════════════════════════════════════════════════ */

const RELATED_PAIRS = new Map<string, Set<string>>([
  ["flooding", new Set(["flood"])],
  ["flood", new Set(["flooding"])],
  ["closure", new Set(["fire", "flood", "cyclone"])],
  ["fire", new Set(["closure", "hazard"])],
  ["hazard", new Set(["fire", "weather_warning", "storm", "wind"])],
  ["storm", new Set(["hazard", "weather_warning"])],
  ["weather_warning", new Set(["hazard", "storm"])],
]);

function isRelatedType(typeA: string, typeB: string): boolean {
  return RELATED_PAIRS.get(typeA)?.has(typeB) ?? false;
}

function deduplicateAlerts(alerts: EnrichedAlert[]): EnrichedAlert[] {
  const removed = new Set<string>();
  const sorted = [...alerts].sort((a, b) => a.sevOrder - b.sevOrder);

  for (let i = 0; i < sorted.length; i++) {
    if (removed.has(sorted[i].id)) continue;
    const a = sorted[i];
    if (!a.coord) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      if (removed.has(sorted[j].id)) continue;
      const b = sorted[j];
      if (!b.coord) continue;

      // Same source type, very close — duplicate feed entry
      if (a.alertKind === b.alertKind && a.typeLabel === b.typeLabel) {
        const d = haversineKm(a.coord.lat, a.coord.lng, b.coord.lat, b.coord.lng);
        if (d < 1.0) { removed.add(b.id); continue; }
      }

      // Cross-overlay: related types within 2km
      const tA = a.typeLabel.replace(/ /g, "_");
      const tB = b.typeLabel.replace(/ /g, "_");
      if (isRelatedType(tA, tB)) {
        const d = haversineKm(a.coord.lat, a.coord.lng, b.coord.lat, b.coord.lng);
        if (d < 2.0) { removed.add(b.id); }
      }
    }
  }

  return alerts.filter((a) => !removed.has(a.id));
}

/* ══════════════════════════════════════════════════════════════════════
   Enrichment engine — PROXIMITY-FIRST scoring + route impact
   ══════════════════════════════════════════════════════════════════════ */

function fmtKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function buildContextLabel(
  userKm: number | null,
  alertKm: number | null,
  userDist: number | null,
  routeDist: number | null,
  impact: RouteImpact,
): string {
  const parts: string[] = [];

  if (impact === "blocks_route") parts.push("⛔ Route blocked");
  else if (impact === "affects_route") parts.push("⚠️ On route");

  if (routeDist != null && routeDist > 25) parts.push(`${Math.round(routeDist)} km off-route`);

  if (userKm != null && alertKm != null) {
    const d = alertKm - userKm;
    if (Math.abs(d) < 2) { if (parts.length === 0) parts.push("Right here"); }
    else if (d > 0) parts.push(`${fmtKm(Math.abs(d))} ahead`);
    else parts.push(`${fmtKm(Math.abs(d))} behind`);
  } else if (userDist != null) {
    parts.push(`${fmtKm(userDist)} away`);
  }
  return parts.join(" · ");
}

/**
 * PROXIMITY-FIRST relevance scoring with route impact weighting.
 *
 * Route-blocking alerts get a massive priority bonus (−500) to ensure
 * they ALWAYS surface at the top regardless of distance.
 */
function relevanceScore(
  sevOrder: number,
  userDist: number | null,
  routeDist: number | null,
  ahead: number | null,
  impact: RouteImpact,
): number {
  let s = 0;

  // Route impact is the DOMINANT factor
  s += IMPACT_CONFIG[impact].order * 200;

  if (impact === "blocks_route") s -= 500;
  else if (impact === "affects_route") s -= 200;

  if (userDist != null) s += userDist * 10;
  else s += 500;

  s += sevOrder * 15;
  if (ahead != null && ahead > 0) s -= 30;
  if (routeDist != null && routeDist > 10) s += routeDist * 5;

  return s;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return ""; }
}

export function enrichAlerts(
  traffic: TrafficOverlay | null,
  hazards: HazardOverlay | null,
  routeGeometry: string | null | undefined,
  userPosition: RoamPosition | null | undefined,
): EnrichedAlert[] {
  const rc = routeGeometry ? (() => { try { return decodePolyline6(routeGeometry); } catch { return null; } })() : null;

  let userKm: number | null = null;
  if (userPosition && rc && rc.length >= 2) {
    const proj = projectOntoRoute(userPosition.lat, userPosition.lng, rc);
    userKm = proj.distKm < 50 ? proj.kmAlong : null;
  }

  const out: EnrichedAlert[] = [];

  for (const ev of traffic?.items ?? []) {
    const coord = extractCoord(ev.geometry, ev.bbox);
    let dUser: number | null = null, kmAlong: number | null = null, dRoute: number | null = null;
    if (coord) {
      if (userPosition) dUser = haversineKm(userPosition.lat, userPosition.lng, coord.lat, coord.lng);
      if (rc && rc.length >= 2) { const p = projectOntoRoute(coord.lat, coord.lng, rc); kmAlong = p.kmAlong; dRoute = p.distKm; }
    }
    const sev = T_SEV[ev.severity ?? "unknown"];
    const ahead = userKm != null && kmAlong != null ? kmAlong - userKm : null;
    const isAhead = ahead != null ? ahead > -2 : true;

    const impact = classifyRouteImpact("traffic", ev.type ?? "unknown", ev.geometry, ev.bbox, rc ?? [], dRoute);

    out.push({
      id: ev.id, alertKind: "traffic", headline: ev.headline, description: ev.description,
      iconKey: T_ICON_KEYS[ev.type ?? "unknown"], severity: ev.severity ?? "unknown",
      sevOrder: sev.order, sevColor: sev.color, sevBg: sev.bg, sevLabel: sev.label,
      typeLabel: (ev.type ?? "unknown").replace("_", " "),
      source: ev.source, timestamp: ev.last_updated,
      coord, distFromUserKm: dUser, kmAlongRoute: kmAlong, distFromRouteKm: dRoute,
      contextLabel: buildContextLabel(userKm, kmAlong, dUser, dRoute, impact),
      relevanceScore: relevanceScore(sev.order, dUser, dRoute, ahead, impact),
      routeImpact: impact,
      isAhead,
      rawGeometry: ev.geometry,
    });
  }

  for (const ev of hazards?.items ?? []) {
    const coord = extractCoord(ev.geometry, ev.bbox);
    let dUser: number | null = null, kmAlong: number | null = null, dRoute: number | null = null;
    if (coord) {
      if (userPosition) dUser = haversineKm(userPosition.lat, userPosition.lng, coord.lat, coord.lng);
      if (rc && rc.length >= 2) { const p = projectOntoRoute(coord.lat, coord.lng, rc); kmAlong = p.kmAlong; dRoute = p.distKm; }
    }
    const sev = H_SEV[ev.severity ?? "unknown"];
    const ahead = userKm != null && kmAlong != null ? kmAlong - userKm : null;
    const isAhead = ahead != null ? ahead > -2 : true;

    const impact = classifyRouteImpact("hazard", ev.kind ?? "unknown", ev.geometry, ev.bbox, rc ?? [], dRoute);

    out.push({
      id: ev.id, alertKind: "hazard", headline: ev.title, description: ev.description,
      iconKey: H_ICON_KEYS[ev.kind ?? "unknown"], severity: ev.severity ?? "unknown",
      sevOrder: sev.order, sevColor: sev.color, sevBg: sev.bg, sevLabel: sev.label,
      typeLabel: (ev.kind ?? "unknown").replace("_", " "),
      source: ev.source, timestamp: ev.issued_at,
      coord, distFromUserKm: dUser, kmAlongRoute: kmAlong, distFromRouteKm: dRoute,
      contextLabel: buildContextLabel(userKm, kmAlong, dUser, dRoute, impact),
      relevanceScore: relevanceScore(sev.order, dUser, dRoute, ahead, impact),
      routeImpact: impact,
      isAhead,
      rawGeometry: ev.geometry,
    });
  }

  return out.sort((a, b) => a.relevanceScore - b.relevanceScore);
}

/* ══════════════════════════════════════════════════════════════════════
   Staleness helpers — BETTER_NAV #4
   ══════════════════════════════════════════════════════════════════════ */

type FreshnessLevel = "fresh" | "stale" | "expired";

function overlayStaleness(createdAt: string | null | undefined): {
  level: FreshnessLevel;
  label: string;
  color: string;
  minutesAgo: number;
} {
  if (!createdAt) return { level: "expired", label: "No data", color: "#64748b", minutesAgo: Infinity };
  try {
    const diff = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 5) return { level: "fresh", label: `Updated ${mins < 1 ? "just now" : `${mins}m ago`}`, color: "#22c55e", minutesAgo: mins };
    if (mins < 30) return { level: "fresh", label: `Updated ${mins}m ago`, color: "#22c55e", minutesAgo: mins };
    if (mins < 180) return { level: "stale", label: `Updated ${Math.floor(mins / 60)}h ${mins % 60}m ago`, color: "#f59e0b", minutesAgo: mins };
    const hours = Math.floor(mins / 60);
    if (hours < 24) return { level: "stale", label: `Updated ${hours}h ago — connect to refresh`, color: "#ef4444", minutesAgo: mins };
    return { level: "expired", label: `Updated ${Math.floor(hours / 24)}d ago — data may be outdated`, color: "#ef4444", minutesAgo: mins };
  } catch {
    return { level: "expired", label: "Unknown age", color: "#64748b", minutesAgo: Infinity };
  }
}

/* ══════════════════════════════════════════════════════════════════════
   useAlerts hook — single source of truth for all alert consumers
   ══════════════════════════════════════════════════════════════════════ */

export function useAlerts(
  traffic: TrafficOverlay | null | undefined,
  hazards: HazardOverlay | null | undefined,
  routeGeometry: string | null | undefined,
  userPosition: RoamPosition | null | undefined,
  stops?: Array<{ lat: number; lng: number }>,
) {
  const rc = useMemo(() => {
    if (!routeGeometry) return null;
    try { return decodePolyline6(routeGeometry); } catch { return null; }
  }, [routeGeometry]);

  // ── Dismiss state — BETTER_NAV #8c ──
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const lastOverlayTimestampRef = useRef<string>("");

  // Reset dismissed state when overlay data actually changes
  useEffect(() => {
    const key = `${traffic?.created_at ?? ""}|${hazards?.created_at ?? ""}`;
    if (key !== lastOverlayTimestampRef.current) {
      lastOverlayTimestampRef.current = key;
      setDismissedIds(new Set());
    }
  }, [traffic?.created_at, hazards?.created_at]);

  const dismissAlert = useCallback((id: string) => {
    haptic.selection();
    setDismissedIds((prev) => new Set(prev).add(id));
  }, []);

  // ── Behind filter state — BETTER_NAV #8a ──
  const [hideBehind, setHideBehind] = useState(false);
  const toggleHideBehind = useCallback(() => {
    haptic.selection();
    setHideBehind((v) => !v);
  }, []);

  // ── Enrichment pipeline ──
  const rawAlerts = useMemo(
    () => enrichAlerts(traffic ?? null, hazards ?? null, routeGeometry, userPosition),
    [traffic, hazards, routeGeometry, userPosition],
  );

  const dedupedAlerts = useMemo(() => deduplicateAlerts(rawAlerts), [rawAlerts]);

  const all = useMemo(() => {
    let filtered = dedupedAlerts.filter((a) => !dismissedIds.has(a.id));
    if (hideBehind) filtered = filtered.filter((a) => a.isAhead);
    return filtered;
  }, [dedupedAlerts, dismissedIds, hideBehind]);

  const next = useMemo(() => {
    const upcoming = all.filter((a) => {
      if (!a.coord) return false;
      if (!a.isAhead) return false;
      if (a.distFromRouteKm != null && a.distFromRouteKm > 25) return false;
      return true;
    });
    return upcoming.length > 0 ? upcoming[0] : null;
  }, [all]);

  // Route-blocking alerts — always visible regardless of behind filter
  const routeBlockers = useMemo(
    () => dedupedAlerts.filter((a) => a.routeImpact === "blocks_route" && !dismissedIds.has(a.id)),
    [dedupedAlerts, dismissedIds],
  );

  const stopKmAlongs = useMemo(() => {
    if (!rc || rc.length < 2 || !stops) return null;
    return stops.map((s) => projectOntoRoute(s.lat, s.lng, rc).kmAlong);
  }, [rc, stops]);

  const alertsForLeg = useCallback(
    (fromIdx: number, toIdx: number): EnrichedAlert[] => {
      if (!stopKmAlongs) return [];
      const startKm = stopKmAlongs[fromIdx] ?? 0;
      const endKm = stopKmAlongs[toIdx] ?? Infinity;
      return all.filter((a) => {
        if (a.kmAlongRoute == null) return false;
        if (a.distFromRouteKm != null && a.distFromRouteKm > 25) return false;
        return a.kmAlongRoute >= startKm && a.kmAlongRoute <= endKm;
      });
    },
    [all, stopKmAlongs],
  );

  // ── Staleness — BETTER_NAV #4 ──
  const staleness = useMemo(() => {
    const trafficAge = overlayStaleness(traffic?.created_at);
    const hazardsAge = overlayStaleness(hazards?.created_at);
    const worst = trafficAge.minutesAgo > hazardsAge.minutesAgo ? trafficAge : hazardsAge;
    return { traffic: trafficAge, hazards: hazardsAge, worst };
  }, [traffic?.created_at, hazards?.created_at]);

  // ── Route assessment — BETTER_NAV #5 ──
  const assessment = useMemo(() => {
    const blockers = dedupedAlerts.filter((a) => a.routeImpact === "blocks_route");
    const onRoute = dedupedAlerts.filter((a) => a.routeImpact === "affects_route");
    const nearby = dedupedAlerts.filter((a) => a.routeImpact === "nearby");

    let status: "clear" | "caution" | "warning" | "blocked" = "clear";
    if (blockers.length > 0) status = "blocked";
    else if (onRoute.length > 0) status = "warning";
    else if (nearby.length > 0) status = "caution";

    return { status, blockerCount: blockers.length, onRouteCount: onRoute.length, nearbyCount: nearby.length, totalCount: dedupedAlerts.length, blockers, onRoute };
  }, [dedupedAlerts]);

  const highCount = all.filter((a) => a.sevOrder === 0).length;
  const totalCount = all.length;
  const behindCount = dedupedAlerts.filter((a) => !a.isAhead && !dismissedIds.has(a.id)).length;
  const dismissedCount = dismissedIds.size;

  return {
    all, next, routeBlockers, alertsForLeg,
    highCount, totalCount, staleness, assessment,
    hideBehind, toggleHideBehind, behindCount,
    dismissAlert, dismissedCount,
  };
}

/* ══════════════════════════════════════════════════════════════════════
   StalenessBar — BETTER_NAV #4
   ══════════════════════════════════════════════════════════════════════ */

export function StalenessBar({
  traffic,
  hazards,
}: {
  traffic: TrafficOverlay | null | undefined;
  hazards: HazardOverlay | null | undefined;
}) {
  const trafficAge = overlayStaleness(traffic?.created_at ?? null);
  const hazardsAge = overlayStaleness(hazards?.created_at ?? null);
  const worst = trafficAge.minutesAgo > hazardsAge.minutesAgo ? trafficAge : hazardsAge;

  if (worst.level === "fresh" && worst.minutesAgo < 5) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "5px 10px", borderRadius: 8,
      background: worst.level === "expired" ? "rgba(239,68,68,0.06)" : worst.level === "stale" ? "rgba(245,158,11,0.06)" : "transparent",
    }}>
      <Clock size={11} color={worst.color} strokeWidth={2.5} />
      <span style={{ fontSize: 10, fontWeight: 800, color: worst.color, letterSpacing: "0.15px" }}>
        {worst.label}
      </span>
      {worst.level !== "fresh" && (
        <RefreshCw size={10} color={worst.color} strokeWidth={2.5} style={{ marginLeft: "auto", opacity: 0.7 }} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   AlertFiltersBar — behind toggle + dismissed count
   BETTER_NAV #8a + #8c
   ══════════════════════════════════════════════════════════════════════ */

export function AlertFiltersBar({
  hideBehind,
  onToggleHideBehind,
  behindCount,
  dismissedCount,
}: {
  hideBehind: boolean;
  onToggleHideBehind: () => void;
  behindCount: number;
  dismissedCount: number;
}) {
  if (behindCount === 0 && dismissedCount === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {behindCount > 0 && (
        <button
          type="button"
          onClick={onToggleHideBehind}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 8, border: "none",
            background: hideBehind ? "rgba(37,99,235,0.12)" : "var(--roam-surface-hover)",
            color: hideBehind ? "#2563eb" : "var(--roam-text-muted)",
            fontSize: 10, fontWeight: 900, cursor: "pointer",
            transition: "all 0.12s ease",
          }}
        >
          {hideBehind ? <EyeOff size={11} strokeWidth={2.5} /> : <Eye size={11} strokeWidth={2.5} />}
          {hideBehind ? `${behindCount} behind hidden` : `Hide ${behindCount} behind`}
        </button>
      )}
      {dismissedCount > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 800, color: "var(--roam-text-muted)",
          padding: "4px 8px", borderRadius: 6, background: "var(--roam-surface-hover)",
        }}>
          {dismissedCount} dismissed
        </span>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   RouteBlockedBanner — BETTER_NAV #2

   Full-width red banner when a closure/flood is detected ON the route.
   ══════════════════════════════════════════════════════════════════════ */

export function RouteBlockedBanner({
  blockers,
  onHighlight,
  onRebuildRequested,
}: {
  blockers: EnrichedAlert[];
  onHighlight?: (ev: AlertHighlightEvent) => void;
  onRebuildRequested?: () => void;
}) {
  if (blockers.length === 0) return null;

  const primary = blockers[0];
  const additionalCount = blockers.length - 1;

  return (
    <div
      onClick={() => {
        haptic.heavy();
        if (primary.coord && onHighlight) {
          onHighlight({ id: primary.id, kind: primary.alertKind, lat: primary.coord.lat, lng: primary.coord.lng });
        }
      }}
      style={{
        padding: "12px 14px", borderRadius: 16, cursor: "pointer",
        background: "linear-gradient(135deg, rgba(220,38,38,0.14) 0%, rgba(239,68,68,0.08) 100%)",
        border: "2px solid rgba(220,38,38,0.35)",
        boxShadow: "0 2px 12px rgba(220,38,38,0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
        transition: "all 0.15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: "rgba(220,38,38,0.18)", border: "2px solid rgba(220,38,38,0.3)",
          display: "grid", placeItems: "center", flexShrink: 0,
          animation: "roam-pulse-glow 2s ease-in-out infinite",
        }}>
          <Ban size={20} color="#dc2626" strokeWidth={2.5} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 950, color: "#dc2626", letterSpacing: "-0.2px", lineHeight: 1.2 }}>
            ⛔ Route blocked ahead
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--roam-text)", marginTop: 3, lineHeight: 1.4 }}>
            {primary.headline}
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--roam-text-muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
            {primary.contextLabel && <span>{primary.contextLabel.replace(/⛔ Route blocked ?·? ?/g, "")}</span>}
            {primary.source && <span>· {primary.source}</span>}
            {primary.timestamp && <span>· {timeAgo(primary.timestamp)}</span>}
            {additionalCount > 0 && <span style={{ color: "#dc2626", fontWeight: 950 }}>+ {additionalCount} more</span>}
          </div>

          {onRebuildRequested && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); haptic.medium(); onRebuildRequested(); }}
              style={{
                marginTop: 8, padding: "7px 14px", borderRadius: 10,
                border: "none", cursor: "pointer",
                background: "#dc2626", color: "#fff",
                fontSize: 11, fontWeight: 950, letterSpacing: "0.2px",
                display: "flex", alignItems: "center", gap: 6,
                boxShadow: "0 2px 8px rgba(220,38,38,0.3)", transition: "opacity 0.1s",
              }}
            >
              <Route size={12} strokeWidth={2.5} />
              Find alternative route
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes roam-pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.3); }
          50% { box-shadow: 0 0 12px 4px rgba(220,38,38,0.2); }
        }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   RouteAssessment — BETTER_NAV #5

   Pre-departure summary shown in /new and /plans views.
   ══════════════════════════════════════════════════════════════════════ */

export function RouteAssessment({
  assessment,
  staleness,
  onHighlight,
}: {
  assessment: {
    status: "clear" | "caution" | "warning" | "blocked";
    blockerCount: number;
    onRouteCount: number;
    nearbyCount: number;
    totalCount: number;
    blockers: EnrichedAlert[];
    onRoute: EnrichedAlert[];
  };
  staleness: { worst: { level: FreshnessLevel; label: string; color: string } };
  onHighlight?: (ev: AlertHighlightEvent) => void;
}) {
  const statusConfig = {
    clear:   { icon: ShieldCheck, color: "#22c55e", bg: "rgba(34,197,94,0.08)",  border: "rgba(34,197,94,0.12)",  label: "Route clear",           description: "No alerts affecting your route" },
    caution: { icon: ShieldAlert, color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.12)", label: "Proceed with caution",   description: `${assessment.nearbyCount} alert${assessment.nearbyCount !== 1 ? "s" : ""} near your route` },
    warning: { icon: TriangleAlert, color: "#ea580c", bg: "rgba(234,88,12,0.10)", border: "rgba(234,88,12,0.15)", label: "Alerts on route",         description: `${assessment.onRouteCount} alert${assessment.onRouteCount !== 1 ? "s" : ""} affecting your route` },
    blocked: { icon: OctagonAlert, color: "#dc2626", bg: "rgba(220,38,38,0.10)", border: "rgba(220,38,38,0.18)", label: "Route blocked",           description: `${assessment.blockerCount} closure${assessment.blockerCount !== 1 ? "s" : ""} blocking your route` },
  };

  const cfg = statusConfig[assessment.status];
  const Icon = cfg.icon;

  return (
    <div style={{ borderRadius: 16, overflow: "hidden", border: `1.5px solid ${cfg.border}`, background: cfg.bg }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 11,
          background: `color-mix(in srgb, ${cfg.color} 15%, transparent)`,
          border: `1.5px solid color-mix(in srgb, ${cfg.color} 20%, transparent)`,
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>
          <Icon size={18} color={cfg.color} strokeWidth={2.5} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 950, color: cfg.color, letterSpacing: "-0.2px" }}>{cfg.label}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--roam-text-muted)", marginTop: 1 }}>{cfg.description}</div>
        </div>
      </div>

      {assessment.totalCount > 0 && (
        <div style={{ padding: "0 14px 10px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {assessment.blockerCount > 0 && <span style={{ fontSize: 10, fontWeight: 950, color: "#dc2626", background: "rgba(220,38,38,0.10)", padding: "3px 8px", borderRadius: 6 }}>{assessment.blockerCount} blocking</span>}
          {assessment.onRouteCount > 0 && <span style={{ fontSize: 10, fontWeight: 950, color: "#ea580c", background: "rgba(234,88,12,0.10)", padding: "3px 8px", borderRadius: 6 }}>{assessment.onRouteCount} on route</span>}
          {assessment.nearbyCount > 0 && <span style={{ fontSize: 10, fontWeight: 950, color: "#f59e0b", background: "rgba(245,158,11,0.08)", padding: "3px 8px", borderRadius: 6 }}>{assessment.nearbyCount} nearby</span>}
        </div>
      )}

      {assessment.blockers.length > 0 && (
        <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {assessment.blockers.slice(0, 3).map((b) => (
            <div
              key={b.id}
              onClick={() => { haptic.selection(); if (b.coord && onHighlight) onHighlight({ id: b.id, kind: b.alertKind, lat: b.coord.lat, lng: b.coord.lng }); }}
              style={{
                padding: "6px 10px", borderRadius: 10, cursor: "pointer",
                background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.12)",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <Ban size={13} color="#dc2626" strokeWidth={2.5} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: "var(--roam-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.headline}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--roam-text-muted)", marginTop: 1 }}>
                  {b.contextLabel.replace(/⛔ Route blocked ?·? ?/g, "On route")}{b.source ? ` · ${b.source}` : ""}
                </div>
              </div>
              <ArrowRight size={12} color="var(--roam-text-muted)" />
            </div>
          ))}
        </div>
      )}

      {staleness.worst.level !== "fresh" && (
        <div style={{ padding: "6px 14px 10px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 5 }}>
          <Clock size={10} color={staleness.worst.color} strokeWidth={2.5} />
          <span style={{ fontSize: 9, fontWeight: 800, color: staleness.worst.color }}>{staleness.worst.label}</span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   AlertCard — used in NextAlertBanner and LegAlertStrip
   Updated with route impact badge + dismiss button
   ══════════════════════════════════════════════════════════════════════ */

export function AlertCard({
  alert,
  compact = false,
  highlighted = false,
  onHighlight,
  onDismiss,
}: {
  alert: EnrichedAlert;
  compact?: boolean;
  highlighted?: boolean;
  onHighlight?: (ev: AlertHighlightEvent) => void;
  onDismiss?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isBlocker = alert.routeImpact === "blocks_route";
  const impactCfg = IMPACT_CONFIG[alert.routeImpact];

  const handleTap = () => {
    haptic.selection();
    if (alert.coord && onHighlight) {
      onHighlight({ id: alert.id, kind: alert.alertKind, lat: alert.coord.lat, lng: alert.coord.lng });
    }
    if (alert.description) setExpanded((v) => !v);
  };

  const cardBg = isBlocker
    ? highlighted ? "rgba(220,38,38,0.18)" : "rgba(220,38,38,0.10)"
    : highlighted ? `color-mix(in srgb, ${alert.sevColor} 18%, var(--roam-surface))` : alert.sevBg;
  const cardBorder = isBlocker
    ? highlighted ? "#dc2626" : "rgba(220,38,38,0.25)"
    : highlighted ? alert.sevColor : `color-mix(in srgb, ${alert.sevColor} 18%, transparent)`;

  return (
    <div
      onClick={handleTap}
      style={{
        padding: compact ? "8px 10px" : "10px 14px",
        borderRadius: compact ? 12 : 14,
        background: cardBg,
        border: `1.5px solid ${cardBorder}`,
        cursor: "pointer", transition: "all 0.15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: compact ? 8 : 10 }}>
        <div style={{
          width: compact ? 30 : 34, height: compact ? 30 : 34, borderRadius: compact ? 9 : 10,
          background: isBlocker ? "rgba(220,38,38,0.15)" : `color-mix(in srgb, ${alert.sevColor} 12%, var(--roam-surface))`,
          border: `1px solid ${isBlocker ? "rgba(220,38,38,0.20)" : `color-mix(in srgb, ${alert.sevColor} 15%, transparent)`}`,
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>
          {isBlocker ? <Ban size={compact ? 14 : 16} color="#dc2626" strokeWidth={2.5} /> : <AlertIcon iconKey={alert.iconKey} size={compact ? 14 : 16} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {alert.contextLabel && (
            <div style={{
              fontSize: compact ? 10 : 11, fontWeight: 950,
              color: isBlocker ? "#dc2626" : alert.sevColor,
              marginBottom: 2, letterSpacing: "0.15px",
            }}>
              {alert.contextLabel}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{
              fontSize: compact ? 12 : 13, fontWeight: 950, color: "var(--roam-text)",
              lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: compact ? "nowrap" : undefined,
            }}>
              {alert.headline}
            </span>
            {!compact && (
              <>
                <span style={{
                  fontSize: 9, fontWeight: 950, color: alert.sevColor,
                  background: `color-mix(in srgb, ${alert.sevColor} 12%, transparent)`,
                  padding: "2px 6px", borderRadius: 6,
                  textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0,
                }}>
                  {alert.sevLabel}
                </span>
                {(alert.routeImpact === "blocks_route" || alert.routeImpact === "affects_route") && (
                  <span style={{
                    fontSize: 9, fontWeight: 950, color: impactCfg.color,
                    background: impactCfg.bg, padding: "2px 6px", borderRadius: 6,
                    textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0,
                  }}>
                    {impactCfg.label}
                  </span>
                )}
              </>
            )}
          </div>

          {!compact && (
            <div style={{ display: "flex", gap: 6, marginTop: 3, fontSize: 10, fontWeight: 700, color: "var(--roam-text-muted)" }}>
              {alert.typeLabel !== "unknown" && <span style={{ textTransform: "capitalize" }}>{alert.typeLabel}</span>}
              {alert.source && <span>· {alert.source}</span>}
              {alert.timestamp && <span>· {timeAgo(alert.timestamp)}</span>}
            </div>
          )}

          {expanded && alert.description && (
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: "var(--roam-text-muted)", lineHeight: 1.5 }}>
              {alert.description}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0, paddingTop: 2 }}>
          {onDismiss && (
            <div
              onClick={(e) => { e.stopPropagation(); onDismiss(alert.id); }}
              style={{
                width: 18, height: 18, borderRadius: 9,
                background: "rgba(100,116,139,0.10)",
                display: "grid", placeItems: "center", cursor: "pointer",
                transition: "background 0.12s ease",
              }}
            >
              <XCircle size={11} color="var(--roam-text-muted)" strokeWidth={2} />
            </div>
          )}
          {alert.coord && !compact && (
            <div style={{
              width: 7, height: 7, borderRadius: 7,
              background: highlighted ? (isBlocker ? "#dc2626" : alert.sevColor) : `color-mix(in srgb, ${isBlocker ? "#dc2626" : alert.sevColor} 35%, transparent)`,
              transition: "background 0.2s ease",
              boxShadow: highlighted ? `0 0 6px ${isBlocker ? "#dc2626" : alert.sevColor}` : "none",
            }} />
          )}
          {alert.description && (
            <ChevronDown
              size={14}
              color="var(--roam-text-muted)"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s ease", marginTop: 2 }}
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   NextAlertBanner — persistent, always visible above tabs
   ══════════════════════════════════════════════════════════════════════ */

export function NextAlertBanner({
  next,
  totalCount,
  highCount,
  allAlerts,
  routeBlockers,
  highlighted,
  onHighlight,
  onDismiss,
  onRebuildRequested,
  staleness,
  hideBehind,
  onToggleHideBehind,
  behindCount,
  dismissedCount,
}: {
  next: EnrichedAlert | null;
  totalCount: number;
  highCount: number;
  allAlerts: EnrichedAlert[];
  routeBlockers?: EnrichedAlert[];
  highlighted?: string | null;
  onHighlight?: (ev: AlertHighlightEvent) => void;
  onDismiss?: (id: string) => void;
  onRebuildRequested?: () => void;
  staleness?: { worst: { level: FreshnessLevel; label: string; color: string } };
  hideBehind?: boolean;
  onToggleHideBehind?: () => void;
  behindCount?: number;
  dismissedCount?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const blockers = routeBlockers ?? [];

  if (totalCount === 0 && blockers.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{
          padding: "10px 14px", borderRadius: 14,
          background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.12)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 10,
            background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.10)",
            display: "grid", placeItems: "center", flexShrink: 0,
          }}>
            <ShieldCheck size={15} color="#22c55e" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 950, color: "var(--roam-text)" }}>Clear ahead</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--roam-text-muted)", marginTop: 1 }}>No alerts on your route</div>
          </div>
        </div>
        {staleness && staleness.worst.level !== "fresh" && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 4 }}>
            <Clock size={10} color={staleness.worst.color} strokeWidth={2.5} />
            <span style={{ fontSize: 9, fontWeight: 800, color: staleness.worst.color }}>{staleness.worst.label}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {blockers.length > 0 && (
        <RouteBlockedBanner blockers={blockers} onHighlight={onHighlight} onRebuildRequested={onRebuildRequested} />
      )}

      {next && next.routeImpact !== "blocks_route" ? (
        <AlertCard alert={next} highlighted={highlighted === next.id} onHighlight={onHighlight} onDismiss={onDismiss} />
      ) : !next && blockers.length === 0 ? (
        <div style={{
          padding: "10px 14px", borderRadius: 14,
          background: highCount > 0 ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
          border: `1px solid ${highCount > 0 ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)"}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 10,
            background: highCount > 0 ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.10)",
            border: `1px solid ${highCount > 0 ? "rgba(239,68,68,0.10)" : "rgba(245,158,11,0.10)"}`,
            display: "grid", placeItems: "center", flexShrink: 0,
          }}>
            {highCount > 0 ? <Siren size={15} color="#ef4444" strokeWidth={2.5} /> : <TriangleAlert size={15} color="#f59e0b" strokeWidth={2.5} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 950, color: "var(--roam-text)" }}>
              {totalCount} alert{totalCount !== 1 ? "s" : ""} on route
            </div>
            {highCount > 0 && <div style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", marginTop: 1 }}>{highCount} critical</div>}
          </div>
        </div>
      ) : null}

      <AlertFiltersBar
        hideBehind={hideBehind ?? false}
        onToggleHideBehind={onToggleHideBehind ?? (() => {})}
        behindCount={behindCount ?? 0}
        dismissedCount={dismissedCount ?? 0}
      />

      {staleness && staleness.worst.level !== "fresh" && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 4 }}>
          <Clock size={10} color={staleness.worst.color} strokeWidth={2.5} />
          <span style={{ fontSize: 9, fontWeight: 800, color: staleness.worst.color }}>{staleness.worst.label}</span>
        </div>
      )}

      {totalCount > 1 && (
        <button
          type="button"
          onClick={() => { haptic.selection(); setShowAll((v) => !v); }}
          style={{
            padding: "7px 12px", borderRadius: 10, border: "none",
            background: "var(--roam-surface-hover)", color: "var(--roam-text-muted)",
            fontSize: 11, fontWeight: 900, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "all 0.12s ease",
          }}
        >
          {showAll ? "Hide" : `See all ${totalCount} alerts`}
          <ChevronDown size={12} style={{ transform: showAll ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }} />
        </button>
      )}

      {showAll && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {allAlerts
            .filter((a) => a.id !== next?.id && a.routeImpact !== "blocks_route")
            .map((a) => (
              <AlertCard key={a.id} alert={a} compact highlighted={highlighted === a.id} onHighlight={onHighlight} onDismiss={onDismiss} />
            ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   LegAlertStrip — inline between stops in the route list
   ══════════════════════════════════════════════════════════════════════ */

export function LegAlertStrip({
  alerts,
  highlighted,
  onHighlight,
  onDismiss,
}: {
  alerts: EnrichedAlert[];
  highlighted?: string | null;
  onHighlight?: (ev: AlertHighlightEvent) => void;
  onDismiss?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const hasBlocker = alerts.some((a) => a.routeImpact === "blocks_route");
  const worst = alerts.reduce((a, b) => (a.sevOrder < b.sevOrder ? a : b));
  const displayColor = hasBlocker ? "#dc2626" : worst.sevColor;

  if (alerts.length === 1) {
    return (
      <div style={{ paddingLeft: 20, position: "relative" }}>
        <div style={{
          position: "absolute", left: 13, top: -4, bottom: -4, width: 2,
          background: `color-mix(in srgb, ${displayColor} 30%, transparent)`, borderRadius: 2,
        }} />
        <AlertCard alert={alerts[0]} compact highlighted={highlighted === alerts[0].id} onHighlight={onHighlight} onDismiss={onDismiss} />
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: 20, position: "relative" }}>
      <div style={{
        position: "absolute", left: 13, top: -4, bottom: -4, width: 2,
        background: `color-mix(in srgb, ${displayColor} 30%, transparent)`, borderRadius: 2,
      }} />

      <div
        onClick={() => { haptic.selection(); setExpanded((v) => !v); }}
        style={{
          padding: "8px 12px", borderRadius: 11, cursor: "pointer",
          background: hasBlocker ? "rgba(220,38,38,0.10)" : worst.sevBg,
          border: `1.5px solid color-mix(in srgb, ${displayColor} 20%, transparent)`,
          display: "flex", alignItems: "center", gap: 8, transition: "all 0.12s ease",
        }}
      >
        {hasBlocker ? <Ban size={14} color="#dc2626" strokeWidth={2.5} /> : <AlertIcon iconKey={worst.iconKey} size={14} />}
        <span style={{ fontSize: 11, fontWeight: 950, color: displayColor, flex: 1 }}>
          {alerts.length} alerts on this stretch{hasBlocker && " — route blocked"}
        </span>
        <ChevronDown
          size={13}
          color="var(--roam-text-muted)"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}
        />
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} compact highlighted={highlighted === a.id} onHighlight={onHighlight} onDismiss={onDismiss} />
          ))}
        </div>
      )}
    </div>
  );
}