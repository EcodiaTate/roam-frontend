// src/components/trip/TripAlertsPanel.tsx
"use client";

import { useMemo, useState, useCallback } from "react";
import type {
    TrafficOverlay,
    HazardOverlay,
    TrafficSeverity,
    TrafficType,
    HazardSeverity,
    HazardKind,
    CapUrgency,
    CapCertainty,
} from "@/lib/types/navigation";
import type { RoamPosition } from "@/lib/native/geolocation";
import { haptic } from "@/lib/native/haptics";
import { formatDistanceKm } from "@/lib/utils/format";
import { decodePolyline6AsLngLat } from "@/lib/nav/polyline6";
import { haversineKm } from "@/lib/nav/snapToRoute";
import {
    type UnifiedAlert,
    type AlertBatch,
    baseUrgency,
    batchAlerts, prioritizeAlerts
} from "@/lib/nav/alertPriority";
import { isOverlayStale } from "@/lib/offline/refreshPriority";

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
    ChevronDown,
    Eye,
    EyeOff,
    Clock,
    XCircle,
    RefreshCw,
    Route,
    Ban,
    ShieldAlert,
    Timer,
    Navigation,
    CircleCheck,
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

export type AlertConfidence = "confirmed" | "likely" | "possible" | "unverified";

export type AlertInsight = {
  expectedDelay: string | null;       // e.g. "~30 min delay" or "Clearing by 3:45 PM"
  recommendation: string | null;      // e.g. "Consider rerouting" or "Proceed with caution"
  safetyWarning: string | null;       // e.g. "Do not drive through floodwater"
  confidence: AlertConfidence;
  confidenceLabel: string;            // e.g. "Confirmed" or "Likely"
  confidenceColor: string;
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
  routeImpact: RouteImpact;
  isAhead: boolean;
  rawGeometry?: Record<string, unknown>;
  insight: AlertInsight;
};

/* ══════════════════════════════════════════════════════════════════════
   Config - severity palettes
   ══════════════════════════════════════════════════════════════════════ */

const T_SEV: Record<TrafficSeverity, { color: string; bg: string; label: string; order: number }> = {
  major:    { color: "var(--severity-major)",    bg: "var(--severity-major-tint)",    label: "Major",    order: 0 },
  moderate: { color: "var(--severity-moderate)",  bg: "var(--severity-moderate-tint)", label: "Moderate", order: 1 },
  minor:    { color: "var(--roam-info)",          bg: "var(--info-tint)",              label: "Minor",    order: 2 },
  info:     { color: "var(--roam-text-muted)",    bg: "var(--roam-surface-hover)",     label: "Info",     order: 3 },
  unknown:  { color: "var(--roam-text-muted)",    bg: "var(--roam-surface-hover)",     label: "Unknown",  order: 4 },
};

const H_SEV: Record<HazardSeverity, { color: string; bg: string; label: string; order: number }> = {
  high:    { color: "var(--severity-major)",    bg: "var(--severity-major-tint)",    label: "High",    order: 0 },
  medium:  { color: "var(--severity-moderate)",  bg: "var(--severity-moderate-tint)", label: "Medium",  order: 1 },
  low:     { color: "var(--roam-info)",          bg: "var(--info-tint)",              label: "Low",     order: 2 },
  unknown: { color: "var(--roam-text-muted)",    bg: "var(--roam-surface-hover)",     label: "Unknown", order: 3 },
};

/* ══════════════════════════════════════════════════════════════════════
   Route impact palettes
   ══════════════════════════════════════════════════════════════════════ */

const IMPACT_CONFIG: Record<RouteImpact, { label: string; color: string; bg: string; order: number }> = {
  blocks_route:  { label: "Route blocked", color: "var(--roam-danger)",       bg: "var(--danger-tint)",           order: 0 },
  affects_route: { label: "On route",      color: "var(--severity-moderate)", bg: "var(--severity-moderate-tint)", order: 1 },
  nearby:        { label: "Nearby",        color: "var(--severity-minor)",    bg: "var(--severity-minor-tint)",    order: 2 },
  informational: { label: "In region",     color: "var(--roam-text-muted)",   bg: "var(--roam-surface-hover)",     order: 3 },
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
  closure: "var(--roam-danger)",
  flooding: "var(--roam-info)",
  congestion: "var(--roam-warn)",
  roadworks: "var(--severity-moderate)",
  hazard: "var(--roam-warn)",
  incident: "var(--roam-danger)",
  unknown: "var(--roam-text-muted)",
  flood: "var(--roam-info)",
  cyclone: "var(--brand-shared)",
  storm: "var(--brand-shared)",
  fire: "var(--roam-danger)",
  wind: "var(--roam-text-muted)",
  heat: "var(--severity-moderate)",
  marine: "var(--roam-info)",
  weather_warning: "var(--roam-warn)",
  h_unknown: "var(--roam-text-muted)",
};

function AlertIcon({ iconKey, size = 16 }: { iconKey: string; size?: number }) {
  const Comp = LUCIDE_ICONS[iconKey] ?? TriangleAlert;
  const color = ICON_COLORS[iconKey] ?? "#64748b";
  return <Comp size={size} strokeWidth={2.2} color={color} />;
}

/* ══════════════════════════════════════════════════════════════════════
   Geo helpers
   ══════════════════════════════════════════════════════════════════════ */


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

export function extractCoord(geo: Record<string, unknown> | null | undefined, bbox: number[] | null | undefined): { lat: number; lng: number } | null {
  if (geo) {
    if (geo.type === "Point" && Array.isArray(geo.coordinates)) return { lng: geo.coordinates[0], lat: geo.coordinates[1] };
    if (geo.type === "LineString" && Array.isArray(geo.coordinates) && geo.coordinates.length > 0) {
      const mid = geo.coordinates[Math.floor(geo.coordinates.length / 2)];
      return Array.isArray(mid) ? { lng: mid[0], lat: mid[1] } : null;
    }
    if ((geo.type === "Polygon" || geo.type === "MultiPolygon") && Array.isArray(geo.coordinates)) {
      const ring = geo.type === "Polygon" ? geo.coordinates[0] : (geo.coordinates[0] as unknown[])?.[0];
      if (Array.isArray(ring) && ring.length) {
        let sLng = 0, sLat = 0;
        for (const c of ring) { sLng += (c as number[])[0]; sLat += (c as number[])[1]; }
        return { lng: sLng / ring.length, lat: sLat / ring.length };
      }
    }
  }
  if (bbox && bbox.length === 4) return { lng: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
  return null;
}

/* ══════════════════════════════════════════════════════════════════════
   Route Impact Classification
   ══════════════════════════════════════════════════════════════════════ */

const BLOCKING_TRAFFIC_TYPES = new Set<string>(["closure", "flooding"]);
const BLOCKING_HAZARD_KINDS = new Set<string>(["flood", "fire", "cyclone"]);

function extractAllCoords(geo: Record<string, unknown> | null | undefined): Array<[number, number]> {
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

function minDistanceToRoute(
  alertCoords: Array<[number, number]>,
  routeCoords: Array<[number, number]>,
): number {
  if (alertCoords.length === 0 || routeCoords.length === 0) return Infinity;

  const step = Math.max(1, Math.floor(routeCoords.length / 500));
  let minDist = Infinity;

  for (const [aLng, aLat] of alertCoords) {
    for (let i = 0; i < routeCoords.length - 1; i += step) {
      const [rLng, rLat] = routeCoords[i];
      const d = haversineKm(aLat, aLng, rLat, rLng);
      if (d < minDist) minDist = d;
      if (minDist < 0.1) return minDist;
    }
    const [lastLng, lastLat] = routeCoords[routeCoords.length - 1];
    const dLast = haversineKm(aLat, aLng, lastLat, lastLng);
    if (dLast < minDist) minDist = dLast;
  }

  return minDist;
}

function classifyRouteImpact(
  alertKind: "traffic" | "hazard",
  alertType: string,
  alertGeometry: Record<string, unknown> | null | undefined,
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
   Cross-Overlay Deduplication
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

      if (a.alertKind === b.alertKind && a.typeLabel === b.typeLabel) {
        const d = haversineKm(a.coord.lat, a.coord.lng, b.coord.lat, b.coord.lng);
        if (d < 1.0) { removed.add(b.id); continue; }
      }

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
   Enrichment engine
   ══════════════════════════════════════════════════════════════════════ */


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
    else if (d > 0) parts.push(`${formatDistanceKm(Math.abs(d))} ahead`);
    else parts.push(`${formatDistanceKm(Math.abs(d))} behind`);
  } else if (userDist != null) {
    parts.push(`${formatDistanceKm(userDist)} away`);
  }
  return parts.join(" · ");
}

function relevanceScore(
  sevOrder: number,
  userDist: number | null,
  routeDist: number | null,
  ahead: number | null,
  impact: RouteImpact,
): number {
  let s = 0;
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

/* ══════════════════════════════════════════════════════════════════════
   Alert insight synthesis
   ══════════════════════════════════════════════════════════════════════ */

const CONFIDENCE_CONFIG: Record<AlertConfidence, { label: string; color: string }> = {
  confirmed:  { label: "Confirmed",  color: "var(--roam-success)" },
  likely:     { label: "Likely",     color: "var(--roam-info)" },
  possible:   { label: "Possible",   color: "var(--roam-warn)" },
  unverified: { label: "Unverified", color: "var(--roam-text-muted)" },
};

function deriveConfidence(
  alertKind: "traffic" | "hazard",
  certainty: CapCertainty | undefined,
  severity: string,
  timestamp: string | null | undefined,
): AlertConfidence {
  // Hazards with CAP certainty
  if (alertKind === "hazard" && certainty && certainty !== "unknown") {
    if (certainty === "observed") return "confirmed";
    if (certainty === "likely") return "likely";
    if (certainty === "possible") return "possible";
    return "unverified";
  }
  // Traffic: major/moderate with recent update = confirmed
  if (alertKind === "traffic") {
    const isRecent = timestamp ? (Date.now() - new Date(timestamp).getTime()) < 3_600_000 : false;
    if ((severity === "major" || severity === "moderate") && isRecent) return "confirmed";
    if (severity === "major") return "likely";
    if (isRecent) return "likely";
    return "possible";
  }
  return "unverified";
}

function formatTimeTo(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

function synthesizeDelay(
  alertKind: "traffic" | "hazard",
  type: string,
  severity: string,
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  impact: RouteImpact,
): string | null {
  // If we have an end time, show expected clearing
  if (endAt) {
    const endMs = new Date(endAt).getTime();
    if (endMs > Date.now()) {
      const remaining = endMs - Date.now();
      const hours = Math.floor(remaining / 3_600_000);
      const mins = Math.floor((remaining % 3_600_000) / 60_000);
      const timeStr = formatTimeTo(endAt);
      if (hours > 0) return `Clearing ~${timeStr} (~${hours}h ${mins}m)`;
      if (mins > 5) return `Clearing ~${timeStr} (~${mins} min)`;
      return `Clearing soon (~${timeStr})`;
    }
    return "Expected to have cleared";
  }

  // No end time - estimate based on type + severity
  if (alertKind === "traffic" && (impact === "blocks_route" || impact === "affects_route")) {
    if (type === "closure") return "Expect significant delays";
    if (type === "roadworks") return severity === "major" ? "30+ min delays likely" : "Minor delays possible";
    if (type === "congestion") return severity === "major" ? "20–40 min delays" : "5–15 min delays";
    if (type === "flooding") return "Road may be impassable";
    if (type === "incident") return severity === "major" ? "30+ min delays likely" : "Delays possible";
  }

  return null;
}

function synthesizeRecommendation(
  alertKind: "traffic" | "hazard",
  type: string,
  severity: string,
  urgency: CapUrgency | undefined,
  impact: RouteImpact,
  distFromRouteKm: number | null,
): string | null {
  if (impact === "blocks_route") return "Reroute recommended";
  if (impact === "informational") return null;

  if (alertKind === "hazard") {
    if (urgency === "immediate") return "Avoid area - take alternate route";
    if (urgency === "expected") return "Plan alternate route";
    if (severity === "high") return "Consider rerouting";
    if (impact === "affects_route") return "Proceed with caution";
    return "Monitor conditions";
  }

  if (alertKind === "traffic") {
    if (type === "closure" && impact === "affects_route") return "Reroute recommended";
    if (type === "flooding") return "Do not attempt - reroute";
    if (severity === "major" && impact === "affects_route") return "Consider rerouting";
    if (impact === "affects_route") return "Proceed with caution";
    if (distFromRouteKm != null && distFromRouteKm < 2) return "Be aware - near route";
  }

  return null;
}

function synthesizeSafetyWarning(
  alertKind: "traffic" | "hazard",
  type: string,
  severity: string,
  urgency: CapUrgency | undefined,
): string | null {
  if (alertKind === "hazard") {
    if (type === "flood") return "Never drive through floodwater";
    if (type === "fire" && (severity === "high" || urgency === "immediate")) return "Leave area immediately if directed";
    if (type === "fire") return "Monitor fire agency alerts";
    if (type === "cyclone") return "Seek shelter - avoid travel";
    if (type === "storm" && severity === "high") return "Pull over if conditions deteriorate";
    if (type === "heat") return "Carry extra water - check vehicle cooling";
    if (type === "wind" && severity === "high") return "Caution with high-profile vehicles";
  }
  if (alertKind === "traffic") {
    if (type === "flooding") return "Never drive through floodwater";
    if (type === "incident" && severity === "major") return "Slow down near incident scene";
  }
  return null;
}

function synthesizeInsight(
  alertKind: "traffic" | "hazard",
  type: string,
  severity: string,
  impact: RouteImpact,
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  urgency: CapUrgency | undefined,
  certainty: CapCertainty | undefined,
  timestamp: string | null | undefined,
  distFromRouteKm: number | null,
): AlertInsight {
  const confidence = deriveConfidence(alertKind, certainty, severity, timestamp);
  const cfg = CONFIDENCE_CONFIG[confidence];

  return {
    expectedDelay: synthesizeDelay(alertKind, type, severity, startAt, endAt, impact),
    recommendation: synthesizeRecommendation(alertKind, type, severity, urgency, impact, distFromRouteKm),
    safetyWarning: synthesizeSafetyWarning(alertKind, type, severity, urgency),
    confidence,
    confidenceLabel: cfg.label,
    confidenceColor: cfg.color,
  };
}

export function enrichAlerts(
  traffic: TrafficOverlay | null,
  hazards: HazardOverlay | null,
  routeGeometry: string | null | undefined,
  userPosition: RoamPosition | null | undefined,
): EnrichedAlert[] {
  const rc = routeGeometry ? (() => { try { return decodePolyline6AsLngLat(routeGeometry); } catch { return null; } })() : null;

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
      rawGeometry: ev.geometry ?? undefined,
      insight: synthesizeInsight("traffic", ev.type ?? "unknown", ev.severity ?? "unknown", impact, ev.start_at, ev.end_at, undefined, undefined, ev.last_updated, dRoute),
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
      rawGeometry: ev.geometry ?? undefined,
      insight: synthesizeInsight("hazard", ev.kind ?? "unknown", ev.severity ?? "unknown", impact, ev.start_at, ev.end_at, ev.urgency, ev.certainty, ev.issued_at, dRoute),
    });
  }

  return out.sort((a, b) => a.relevanceScore - b.relevanceScore);
}

/* ══════════════════════════════════════════════════════════════════════
   Staleness helpers
   ══════════════════════════════════════════════════════════════════════ */

type FreshnessLevel = "fresh" | "stale" | "expired";

function overlayStaleness(createdAt: string | null | undefined): {
  level: FreshnessLevel;
  label: string;
  color: string;
  minutesAgo: number;
} {
  if (!createdAt) return { level: "expired", label: "No data", color: "var(--roam-text-muted)", minutesAgo: Infinity };
  try {
    const diff = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 5) return { level: "fresh", label: `Updated ${mins < 1 ? "just now" : `${mins}m ago`}`, color: "var(--roam-success)", minutesAgo: mins };
    if (mins < 30) return { level: "fresh", label: `Updated ${mins}m ago`, color: "var(--roam-success)", minutesAgo: mins };
    if (mins < 180) return { level: "stale", label: `Updated ${Math.floor(mins / 60)}h ${mins % 60}m ago`, color: "var(--roam-warn)", minutesAgo: mins };
    const hours = Math.floor(mins / 60);
    if (hours < 24) return { level: "stale", label: `Updated ${hours}h ago - connect to refresh`, color: "var(--roam-danger)", minutesAgo: mins };
    return { level: "expired", label: `Updated ${Math.floor(hours / 24)}d ago - data may be outdated`, color: "var(--roam-danger)", minutesAgo: mins };
  } catch {
    return { level: "expired", label: "Unknown age", color: "var(--roam-text-muted)", minutesAgo: Infinity };
  }
}

/* ══════════════════════════════════════════════════════════════════════
   useAlerts hook
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
    try { return decodePolyline6AsLngLat(routeGeometry); } catch { return null; }
  }, [routeGeometry]);

  const overlayKey = `${traffic?.created_at ?? ""}|${hazards?.created_at ?? ""}`;
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [prevOverlayKey, setPrevOverlayKey] = useState(overlayKey);

  // Reset dismissed IDs when overlay data changes (idiomatic React derived state)
  if (overlayKey !== prevOverlayKey) {
    setPrevOverlayKey(overlayKey);
    setDismissedIds(new Set());
  }

  const dismissAlert = useCallback((id: string) => {
    haptic.selection();
    setDismissedIds((prev) => new Set(prev).add(id));
  }, []);

  const [hideBehind, setHideBehind] = useState(false);
  const toggleHideBehind = useCallback(() => {
    haptic.selection();
    setHideBehind((v) => !v);
  }, []);

  // Stage 1: Route-based enrichment - expensive spatial pipeline, only rerun when overlays change
  const baseAlerts = useMemo(
    () => enrichAlerts(traffic ?? null, hazards ?? null, routeGeometry, null),
    [traffic, hazards, routeGeometry],
  );

  // Stage 2: Cheap position annotation - runs at GPS frequency but only does arithmetic
  const rawAlerts = useMemo(() => {
    if (!userPosition || baseAlerts.length === 0) return baseAlerts;
    let userKm: number | null = null;
    if (rc && rc.length >= 2) {
      const proj = projectOntoRoute(userPosition.lat, userPosition.lng, rc);
      userKm = proj.distKm < 50 ? proj.kmAlong : null;
    }
    return baseAlerts.map((a) => {
      const dUser = a.coord ? haversineKm(userPosition.lat, userPosition.lng, a.coord.lat, a.coord.lng) : null;
      const ahead = userKm != null && a.kmAlongRoute != null ? a.kmAlongRoute - userKm : null;
      const isAhead = ahead != null ? ahead > -2 : true;
      return {
        ...a,
        distFromUserKm: dUser,
        contextLabel: buildContextLabel(userKm, a.kmAlongRoute, dUser, a.distFromRouteKm, a.routeImpact),
        relevanceScore: relevanceScore(a.sevOrder, dUser, a.distFromRouteKm, ahead, a.routeImpact),
        isAhead,
      };
    }).sort((a, b) => a.relevanceScore - b.relevanceScore);
  }, [baseAlerts, userPosition, rc]);

  const dedupedAlerts = useMemo(() => deduplicateAlerts(rawAlerts), [rawAlerts]);

  const all = useMemo(() => {
    // Crucial bug fix: Informational alerts are entirely excluded from the active list
    // so they do not contradict the status or clutter the UI.
    let filtered = dedupedAlerts.filter((a) => !dismissedIds.has(a.id) && a.routeImpact !== "informational");
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

  const staleness = useMemo(() => {
    const trafficAge = overlayStaleness(traffic?.created_at);
    const hazardsAge = overlayStaleness(hazards?.created_at);
    const worst = trafficAge.minutesAgo > hazardsAge.minutesAgo ? trafficAge : hazardsAge;
    return { traffic: trafficAge, hazards: hazardsAge, worst };
  }, [traffic?.created_at, hazards?.created_at]);

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

  const { highCount, totalCount, behindCount, dismissedCount } = useMemo(() => ({
    highCount: all.filter((a) => a.sevOrder === 0).length,
    totalCount: all.length,
    behindCount: dedupedAlerts.filter((a) => !a.isAhead && !dismissedIds.has(a.id) && a.routeImpact !== "informational").length,
    dismissedCount: dismissedIds.size,
  }), [all, dedupedAlerts, dismissedIds]);

  // ── Unified alert batching for voice announcements ──
  // Converts the enriched alerts into the alertPriority system's UnifiedAlert format,
  // then deduplicates, adjusts for staleness, and batches by region.
  const voiceBatches = useMemo((): AlertBatch[] => {
    if (all.length === 0) return [];

    const userKm = (() => {
      if (!userPosition || !rc || rc.length < 2) return 0;
      const proj = projectOntoRoute(userPosition.lat, userPosition.lng, rc);
      return proj.distKm < 50 ? proj.kmAlong : 0;
    })();

    const unified: UnifiedAlert[] = all.map((a) => {
      const source = a.alertKind === "traffic" ? "traffic" as const : "hazard" as const;
      const sev = a.severity ?? "medium";
      const mod = a.typeLabel ?? undefined;
      return {
        id: a.id,
        source,
        urgency: baseUrgency(source, sev, mod),
        title: a.headline ?? "Alert",
        description: a.description ?? "",
        km_along: a.kmAlongRoute ?? null,
        data_created_at: a.alertKind === "traffic" ? (traffic?.created_at ?? null) : (hazards?.created_at ?? null),
        is_stale: a.alertKind === "traffic"
          ? isOverlayStale("traffic", traffic?.created_at ?? "")
          : isOverlayStale("hazards", hazards?.created_at ?? ""),
        spatial_key: a.coord ? `${Math.round(a.coord.lat * 100)},${Math.round(a.coord.lng * 100)}` : null,
      };
    });

    const prioritized = prioritizeAlerts(unified, 20);
    return batchAlerts(prioritized, userKm);
  }, [all, userPosition, rc, traffic, hazards]);

  return {
    all, next, routeBlockers, alertsForLeg,
    highCount, totalCount, staleness, assessment,
    hideBehind, toggleHideBehind, behindCount,
    dismissAlert, dismissedCount,
    voiceBatches,
  };
}

/* ══════════════════════════════════════════════════════════════════════
   StalenessBar
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
      background: worst.level === "expired" ? "var(--danger-tint)" : worst.level === "stale" ? "var(--severity-minor-tint)" : "transparent",
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
   AlertFiltersBar
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
            background: hideBehind ? "var(--info-tint)" : "var(--roam-surface-hover)",
            color: hideBehind ? "var(--roam-info)" : "var(--roam-text-muted)",
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
   RouteBlockedBanner
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
        background: "var(--danger-tint)",
        border: "2px solid var(--roam-border-strong)",
        boxShadow: "var(--shadow-soft)",
        transition: "all 0.15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: "var(--danger-tint)", border: "2px solid var(--roam-border-strong)",
          display: "grid", placeItems: "center", flexShrink: 0,
          animation: "roam-pulse-glow 2s ease-in-out infinite",
        }}>
          <Ban size={20} color="var(--roam-danger)" strokeWidth={2.5} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 950, color: "var(--roam-danger)", letterSpacing: "-0.2px", lineHeight: 1.2 }}>
            ⛔ Route blocked ahead
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--roam-text)", marginTop: 3, lineHeight: 1.4 }}>
            {primary.headline}
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--roam-text-muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
            {primary.contextLabel && <span>{primary.contextLabel.replace(/⛔ Route blocked ?·? ?/g, "")}</span>}
            {primary.source && <span>· {primary.source}</span>}
            {primary.timestamp && <span>· {timeAgo(primary.timestamp)}</span>}
            {additionalCount > 0 && <span style={{ color: "var(--roam-danger)", fontWeight: 950 }}>+ {additionalCount} more</span>}
          </div>

          {onRebuildRequested && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); haptic.medium(); onRebuildRequested(); }}
              style={{
                marginTop: 8, padding: "7px 14px", borderRadius: 10,
                border: "none", cursor: "pointer",
                background: "var(--roam-danger)", color: "var(--on-color)",
                fontSize: 11, fontWeight: 950, letterSpacing: "0.2px",
                display: "flex", alignItems: "center", gap: 6,
                boxShadow: "var(--shadow-soft)", transition: "opacity 0.1s",
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
   RouteAssessment
   ══════════════════════════════════════════════════════════════════════ */

export function RouteAssessment(_props: Record<string, unknown>) {
  // Purposely gutted and returning null.
  // We keep the component export so TripView doesn't crash on import,
  // but it physically removes the redundant UI pill from your bottom sheet.
  return null;
}

/* ══════════════════════════════════════════════════════════════════════
   AlertCard
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
    ? highlighted ? "var(--danger-tint)" : "var(--danger-tint)"
    : highlighted ? `color-mix(in srgb, ${alert.sevColor} 18%, var(--roam-surface))` : alert.sevBg;
  const cardBorder = isBlocker
    ? highlighted ? "var(--roam-danger)" : "var(--roam-border-strong)"
    : highlighted ? alert.sevColor : `color-mix(in srgb, ${alert.sevColor} 18%, transparent)`;

  const hasInsights = !compact && (alert.insight.expectedDelay || alert.insight.recommendation || alert.insight.safetyWarning);

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
        {/* Icon */}
        <div style={{
          width: compact ? 30 : 34, height: compact ? 30 : 34, borderRadius: compact ? 9 : 10,
          background: isBlocker ? "var(--danger-tint)" : `color-mix(in srgb, ${alert.sevColor} 12%, var(--roam-surface))`,
          border: `1px solid ${isBlocker ? "var(--roam-border-strong)" : `color-mix(in srgb, ${alert.sevColor} 15%, transparent)`}`,
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>
          {isBlocker ? <Ban size={compact ? 14 : 16} color="var(--roam-danger)" strokeWidth={2.5} /> : <AlertIcon iconKey={alert.iconKey} size={compact ? 14 : 16} />}
        </div>

        {/* Content - uses a 2-column grid for non-compact cards with insights */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {alert.contextLabel && (
            <div style={{
              fontSize: compact ? 10 : 11, fontWeight: 950,
              color: isBlocker ? "var(--roam-danger)" : alert.sevColor,
              marginBottom: 2, letterSpacing: "0.15px",
            }}>
              {alert.contextLabel}
            </div>
          )}

          {/* Two-column layout: left = headline+meta, right = insights */}
          <div style={hasInsights ? {
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "0 14px",
            alignItems: "center",
          } : undefined}>
            {/* Left column: headline, badges, metadata */}
            <div style={{ minWidth: 0 }}>
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
            </div>

            {/* Right column: synthesized insights (compact vertical list) */}
            {hasInsights && (
              <div style={{
                display: "flex", flexDirection: "column", gap: 3,
                paddingLeft: 10,
                borderLeft: `2px solid color-mix(in srgb, ${isBlocker ? "var(--roam-danger)" : alert.sevColor} 20%, transparent)`,
                whiteSpace: "nowrap",
              }}>
                {alert.insight.expectedDelay && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 750, color: "var(--roam-text)" }}>
                    <Timer size={10} strokeWidth={2.5} color="var(--roam-text-muted)" style={{ flexShrink: 0 }} />
                    {alert.insight.expectedDelay}
                  </div>
                )}
                {alert.insight.recommendation && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 750, color: isBlocker ? "var(--roam-danger)" : "var(--roam-text)" }}>
                    <Navigation size={10} strokeWidth={2.5} color={isBlocker ? "var(--roam-danger)" : "var(--roam-info)"} style={{ flexShrink: 0 }} />
                    {alert.insight.recommendation}
                  </div>
                )}
                {alert.insight.safetyWarning && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, color: "var(--roam-danger)" }}>
                    <ShieldAlert size={10} strokeWidth={2.5} color="var(--roam-danger)" style={{ flexShrink: 0 }} />
                    {alert.insight.safetyWarning}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 800 }}>
                  <CircleCheck size={8} strokeWidth={2.5} color={alert.insight.confidenceColor} style={{ flexShrink: 0 }} />
                  <span style={{ color: alert.insight.confidenceColor }}>{alert.insight.confidenceLabel}</span>
                </div>
              </div>
            )}
          </div>

          {expanded && alert.description && (
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: "var(--roam-text-muted)", lineHeight: 1.5 }}>
              {alert.description}
            </div>
          )}
        </div>

        {/* Right controls: dismiss, dot, expand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0, paddingTop: 2 }}>
          {onDismiss && (
            <div
              onClick={(e) => { e.stopPropagation(); onDismiss(alert.id); }}
              style={{
                width: 18, height: 18, borderRadius: 9,
                background: "var(--roam-surface-hover)",
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
              background: highlighted ? (isBlocker ? "var(--roam-danger)" : alert.sevColor) : `color-mix(in srgb, ${isBlocker ? "var(--roam-danger)" : alert.sevColor} 35%, transparent)`,
              transition: "background 0.2s ease",
              boxShadow: highlighted ? `0 0 6px ${isBlocker ? "var(--roam-danger)" : alert.sevColor}` : "none",
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
   NextAlertBanner
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

  // When no alerts are present, we safely return null instead of a huge, useless "Clear ahead" pill
  if (totalCount === 0 && blockers.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {blockers.length > 0 && (
        <RouteBlockedBanner blockers={blockers} onHighlight={onHighlight} onRebuildRequested={onRebuildRequested} />
      )}

      {next && next.routeImpact !== "blocks_route" ? (
        <AlertCard alert={next} highlighted={highlighted === next.id} onHighlight={onHighlight} onDismiss={onDismiss} />
      ) : !next && blockers.length === 0 && totalCount > 0 ? (
        <div style={{
          padding: "10px 14px", borderRadius: 14,
          background: highCount > 0 ? "var(--danger-tint)" : "var(--severity-minor-tint)",
          border: `1px solid var(--roam-border-strong)`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 10,
            background: highCount > 0 ? "var(--danger-tint)" : "var(--severity-minor-tint)",
            border: `1px solid var(--roam-border)`,
            display: "grid", placeItems: "center", flexShrink: 0,
          }}>
            {highCount > 0 ? <Siren size={15} color="var(--roam-danger)" strokeWidth={2.5} /> : <TriangleAlert size={15} color="var(--roam-warn)" strokeWidth={2.5} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 950, color: "var(--roam-text)" }}>
              {totalCount} alert{totalCount !== 1 ? "s" : ""} on route
            </div>
            {highCount > 0 && <div style={{ fontSize: 10, fontWeight: 800, color: "var(--roam-danger)", marginTop: 1 }}>{highCount} critical</div>}
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
   LegAlertStrip
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
  const displayColor = hasBlocker ? "var(--roam-danger)" : worst.sevColor;

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
          background: hasBlocker ? "var(--danger-tint)" : worst.sevBg,
          border: `1.5px solid color-mix(in srgb, ${displayColor} 20%, transparent)`,
          display: "flex", alignItems: "center", gap: 8, transition: "all 0.12s ease",
        }}
      >
        {hasBlocker ? <Ban size={14} color="var(--roam-danger)" strokeWidth={2.5} /> : <AlertIcon iconKey={worst.iconKey} size={14} />}
        <span style={{ fontSize: 11, fontWeight: 950, color: displayColor, flex: 1 }}>
          {alerts.length} alerts on this stretch{hasBlocker && " - route blocked"}
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
