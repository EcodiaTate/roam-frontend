// src/components/trip/TripAlertsPanel.tsx
"use client";

import { useMemo, useState } from "react";
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

/* ── Alert focus event (emitted on card click) ────────────────────────── */

export type AlertFocusEvent = {
  id: string;
  kind: "traffic" | "hazard";
  lat: number;
  lng: number;
};

/* ── Severity / type styling ──────────────────────────────────────────── */

const TRAFFIC_SEVERITY_CONFIG: Record<TrafficSeverity, { color: string; bg: string; label: string; order: number }> = {
  major:    { color: "#ef4444", bg: "rgba(239,68,68,0.12)",   label: "Major",    order: 0 },
  moderate: { color: "#f59e0b", bg: "rgba(245,158,11,0.10)",  label: "Moderate", order: 1 },
  minor:    { color: "#3b82f6", bg: "rgba(59,130,246,0.10)",  label: "Minor",    order: 2 },
  info:     { color: "#64748b", bg: "rgba(100,116,139,0.08)", label: "Info",     order: 3 },
  unknown:  { color: "#64748b", bg: "rgba(100,116,139,0.08)", label: "Unknown",  order: 4 },
};

const HAZARD_SEVERITY_CONFIG: Record<HazardSeverity, { color: string; bg: string; label: string; order: number }> = {
  high:    { color: "#dc2626", bg: "rgba(220,38,38,0.12)",   label: "High",    order: 0 },
  medium:  { color: "#ea580c", bg: "rgba(234,88,12,0.10)",   label: "Medium",  order: 1 },
  low:     { color: "#2563eb", bg: "rgba(37,99,235,0.10)",   label: "Low",     order: 2 },
  unknown: { color: "#64748b", bg: "rgba(100,116,139,0.08)", label: "Unknown", order: 3 },
};

const TRAFFIC_TYPE_ICONS: Record<TrafficType, string> = {
  closure:    "⛔",
  flooding:   "🌊",
  congestion: "🚗",
  roadworks:  "🚧",
  hazard:     "⚠️",
  incident:   "🚨",
  unknown:    "❓",
};

const HAZARD_KIND_ICONS: Record<HazardKind, string> = {
  flood:            "🌊",
  cyclone:          "🌀",
  storm:            "⛈️",
  fire:             "🔥",
  wind:             "💨",
  heat:             "🌡️",
  marine:           "🌊",
  weather_warning:  "⚡",
  unknown:          "⚠️",
};

/* ── Geometry helpers ─────────────────────────────────────────────────── */

function decodePolyline6(poly: string): Array<[number, number]> {
  let index = 0, lat = 0, lng = 0;
  const coordinates: Array<[number, number]> = [];
  const factor = 1e6;
  while (index < poly.length) {
    let result = 0, shift = 0, b: number;
    do { b = poly.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do { b = poly.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lng / factor, lat / factor]); // [lng, lat]
  }
  return coordinates;
}

const DEG2RAD = Math.PI / 180;
const R_EARTH_KM = 6371;

/** Haversine distance in km between two points. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLng = (lng2 - lng1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLng / 2) ** 2;
  return R_EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Project a point onto a polyline and return:
 *  - `kmAlong`: cumulative distance along polyline to the nearest projection point
 *  - `distKm`: perpendicular distance from the point to the polyline
 *
 * The polyline is [lng, lat][] (GeoJSON order).
 */
function projectOntoRoute(
  lat: number,
  lng: number,
  routeCoords: Array<[number, number]>,
): { kmAlong: number; distKm: number } {
  let bestDist = Infinity;
  let bestKmAlong = 0;
  let cumKm = 0;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const [aLng, aLat] = routeCoords[i];
    const [bLng, bLat] = routeCoords[i + 1];
    const segLen = haversineKm(aLat, aLng, bLat, bLng);

    // Project point onto segment (approximate planar for short segments)
    const dx = bLng - aLng;
    const dy = bLat - aLat;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 0) {
      t = ((lng - aLng) * dx + (lat - aLat) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const projLng = aLng + t * dx;
    const projLat = aLat + t * dy;
    const d = haversineKm(lat, lng, projLat, projLng);

    if (d < bestDist) {
      bestDist = d;
      bestKmAlong = cumKm + t * segLen;
    }

    cumKm += segLen;
  }

  return { kmAlong: bestKmAlong, distKm: bestDist };
}

/** Extract a representative lat/lng from any GeoJSON geometry, or from a bbox array. */
function extractCoord(
  geometry: Record<string, any> | null | undefined,
  bbox: number[] | null | undefined,
): { lat: number; lng: number } | null {
  if (geometry) {
    if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
      return { lng: geometry.coordinates[0], lat: geometry.coordinates[1] };
    }
    if (geometry.type === "LineString" && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
      const mid = geometry.coordinates[Math.floor(geometry.coordinates.length / 2)];
      if (Array.isArray(mid)) return { lng: mid[0], lat: mid[1] };
    }
    if ((geometry.type === "Polygon" || geometry.type === "MultiPolygon") && Array.isArray(geometry.coordinates)) {
      const ring = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];
      if (Array.isArray(ring) && ring.length > 0) {
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

/* ── Enriched alert items ─────────────────────────────────────────────── */

type EnrichedTrafficItem = TrafficEvent & {
  coord: { lat: number; lng: number } | null;
  distFromUserKm: number | null;
  kmAlongRoute: number | null;
  distFromRouteKm: number | null;
  relevanceScore: number;
  contextLabel: string;
};

type EnrichedHazardItem = HazardEvent & {
  coord: { lat: number; lng: number } | null;
  distFromUserKm: number | null;
  kmAlongRoute: number | null;
  distFromRouteKm: number | null;
  relevanceScore: number;
  contextLabel: string;
};

function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function buildContextLabel(
  userKmAlong: number | null,
  alertKmAlong: number | null,
  distFromUserKm: number | null,
  distFromRouteKm: number | null,
): string {
  const parts: string[] = [];

  // Distance from route
  if (distFromRouteKm != null && distFromRouteKm > 25) {
    parts.push(`${Math.round(distFromRouteKm)} km from route`);
  }

  // Ahead / behind / nearby
  if (userKmAlong != null && alertKmAlong != null) {
    const delta = alertKmAlong - userKmAlong;
    const absDelta = Math.abs(delta);

    if (absDelta < 2) {
      parts.unshift("⚡ Right here");
    } else if (delta > 0) {
      parts.unshift(`↗ ${formatKm(absDelta)} ahead`);
    } else {
      parts.unshift(`↙ ${formatKm(absDelta)} behind you`);
    }
  } else if (distFromUserKm != null) {
    parts.unshift(`📍 ${formatKm(distFromUserKm)} away`);
  }

  return parts.join("  ·  ");
}

/**
 * Score: lower = more relevant = shown first.
 * Weighting: severity (0-4) * 100  -  proximity bonus  +  off-route penalty
 */
function relevanceScore(
  severityOrder: number,
  distFromUserKm: number | null,
  distFromRouteKm: number | null,
  kmAheadOfUser: number | null,
): number {
  let score = severityOrder * 100;

  // Bonus for being close to user (0-50 points saved)
  if (distFromUserKm != null) {
    score -= Math.max(0, 50 - distFromUserKm * 0.5);
  }

  // Bonus for being ahead (not behind)
  if (kmAheadOfUser != null && kmAheadOfUser > 0) {
    score -= 30;
  }

  // Penalty for being far from route
  if (distFromRouteKm != null && distFromRouteKm > 10) {
    score += distFromRouteKm * 2;
  }

  return score;
}

function enrichTraffic(
  items: TrafficEvent[],
  routeCoords: Array<[number, number]> | null,
  userPos: RoamPosition | null | undefined,
  userKmAlong: number | null,
): EnrichedTrafficItem[] {
  return items.map((ev) => {
    const coord = extractCoord(ev.geometry, ev.bbox);
    let distFromUserKm: number | null = null;
    let kmAlongRoute: number | null = null;
    let distFromRouteKm: number | null = null;

    if (coord) {
      if (userPos) distFromUserKm = haversineKm(userPos.lat, userPos.lng, coord.lat, coord.lng);
      if (routeCoords && routeCoords.length >= 2) {
        const proj = projectOntoRoute(coord.lat, coord.lng, routeCoords);
        kmAlongRoute = proj.kmAlong;
        distFromRouteKm = proj.distKm;
      }
    }

    const sevOrder = TRAFFIC_SEVERITY_CONFIG[ev.severity ?? "unknown"].order;
    const kmAhead = userKmAlong != null && kmAlongRoute != null ? kmAlongRoute - userKmAlong : null;

    return {
      ...ev, coord, distFromUserKm, kmAlongRoute, distFromRouteKm,
      relevanceScore: relevanceScore(sevOrder, distFromUserKm, distFromRouteKm, kmAhead),
      contextLabel: buildContextLabel(userKmAlong, kmAlongRoute, distFromUserKm, distFromRouteKm),
    };
  });
}

function enrichHazards(
  items: HazardEvent[],
  routeCoords: Array<[number, number]> | null,
  userPos: RoamPosition | null | undefined,
  userKmAlong: number | null,
): EnrichedHazardItem[] {
  return items.map((ev) => {
    const coord = extractCoord(ev.geometry, ev.bbox);
    let distFromUserKm: number | null = null;
    let kmAlongRoute: number | null = null;
    let distFromRouteKm: number | null = null;

    if (coord) {
      if (userPos) distFromUserKm = haversineKm(userPos.lat, userPos.lng, coord.lat, coord.lng);
      if (routeCoords && routeCoords.length >= 2) {
        const proj = projectOntoRoute(coord.lat, coord.lng, routeCoords);
        kmAlongRoute = proj.kmAlong;
        distFromRouteKm = proj.distKm;
      }
    }

    const sevOrder = HAZARD_SEVERITY_CONFIG[ev.severity ?? "unknown"].order;
    const kmAhead = userKmAlong != null && kmAlongRoute != null ? kmAlongRoute - userKmAlong : null;

    return {
      ...ev, coord, distFromUserKm, kmAlongRoute, distFromRouteKm,
      relevanceScore: relevanceScore(sevOrder, distFromUserKm, distFromRouteKm, kmAhead),
      contextLabel: buildContextLabel(userKmAlong, kmAlongRoute, distFromUserKm, distFromRouteKm),
    };
  });
}

/* ── Time helpers ─────────────────────────────────────────────────────── */

function timeAgo(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return ""; }
}

/* ── Card sub-components ──────────────────────────────────────────────── */

function TrafficAlertCard({
  event,
  onFocus,
}: {
  event: EnrichedTrafficItem;
  onFocus?: (focus: AlertFocusEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = TRAFFIC_SEVERITY_CONFIG[event.severity ?? "unknown"];
  const icon = TRAFFIC_TYPE_ICONS[event.type ?? "unknown"];
  const hasCoord = !!event.coord;

  const handleClick = () => {
    haptic.selection();
    if (hasCoord && onFocus) {
      onFocus({ id: event.id, kind: "traffic", lat: event.coord!.lat, lng: event.coord!.lng });
    } else {
      setExpanded((v) => !v);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        padding: "12px 14px", borderRadius: 14,
        background: sev.bg,
        border: `1px solid color-mix(in srgb, ${sev.color} 20%, transparent)`,
        cursor: "pointer",
        transition: "background 0.15s ease, transform 0.1s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Icon */}
        <div
          style={{
            width: 36, height: 36, borderRadius: 11,
            background: `color-mix(in srgb, ${sev.color} 15%, var(--roam-surface))`,
            display: "grid", placeItems: "center", fontSize: 17, flexShrink: 0,
          }}
        >
          {icon}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Context label — the engaging spatial info */}
          {event.contextLabel && (
            <div style={{ fontSize: 11, fontWeight: 950, color: sev.color, marginBottom: 3, letterSpacing: "0.2px" }}>
              {event.contextLabel}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 950, color: "var(--roam-text)", lineHeight: 1.3 }}>
              {event.headline}
            </span>
            <span
              style={{
                fontSize: 10, fontWeight: 900, color: sev.color,
                background: `color-mix(in srgb, ${sev.color} 12%, transparent)`,
                padding: "2px 7px", borderRadius: 6,
                textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0,
              }}
            >
              {sev.label}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11, fontWeight: 700, color: "var(--roam-text-muted)" }}>
            {event.type && event.type !== "unknown" && (
              <span style={{ textTransform: "capitalize" }}>{event.type.replace("_", " ")}</span>
            )}
            {event.source && <span>· {event.source}</span>}
            {event.last_updated && <span>· {timeAgo(event.last_updated)}</span>}
          </div>

          {expanded && event.description && (
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--roam-text-muted)", lineHeight: 1.5 }}>
              {event.description}
            </div>
          )}
        </div>

        {/* Tap hint + expand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0, marginTop: 2 }}>
          {hasCoord && (
            <div style={{
              fontSize: 9, fontWeight: 950, color: sev.color, opacity: 0.8,
              background: `color-mix(in srgb, ${sev.color} 10%, transparent)`,
              padding: "2px 5px", borderRadius: 4, letterSpacing: "0.5px",
            }}>
              MAP
            </div>
          )}
          {event.description && (
            <div
              style={{
                fontSize: 14, color: "var(--roam-text-muted)", marginTop: 2,
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
              }}
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            >
              ▾
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HazardAlertCard({
  event,
  onFocus,
}: {
  event: EnrichedHazardItem;
  onFocus?: (focus: AlertFocusEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = HAZARD_SEVERITY_CONFIG[event.severity ?? "unknown"];
  const icon = HAZARD_KIND_ICONS[event.kind ?? "unknown"];
  const hasCoord = !!event.coord;

  const handleClick = () => {
    haptic.selection();
    if (hasCoord && onFocus) {
      onFocus({ id: event.id, kind: "hazard", lat: event.coord!.lat, lng: event.coord!.lng });
    } else {
      setExpanded((v) => !v);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        padding: "12px 14px", borderRadius: 14,
        background: sev.bg,
        border: `1px solid color-mix(in srgb, ${sev.color} 20%, transparent)`,
        cursor: "pointer",
        transition: "background 0.15s ease, transform 0.1s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: 11,
            background: `color-mix(in srgb, ${sev.color} 15%, var(--roam-surface))`,
            display: "grid", placeItems: "center", fontSize: 17, flexShrink: 0,
          }}
        >
          {icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {event.contextLabel && (
            <div style={{ fontSize: 11, fontWeight: 950, color: sev.color, marginBottom: 3, letterSpacing: "0.2px" }}>
              {event.contextLabel}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 950, color: "var(--roam-text)", lineHeight: 1.3 }}>
              {event.title}
            </span>
            <span
              style={{
                fontSize: 10, fontWeight: 900, color: sev.color,
                background: `color-mix(in srgb, ${sev.color} 12%, transparent)`,
                padding: "2px 7px", borderRadius: 6,
                textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0,
              }}
            >
              {sev.label}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 11, fontWeight: 700, color: "var(--roam-text-muted)" }}>
            {event.kind && event.kind !== "unknown" && (
              <span style={{ textTransform: "capitalize" }}>{event.kind.replace("_", " ")}</span>
            )}
            {event.source && <span>· {event.source}</span>}
            {event.issued_at && <span>· {timeAgo(event.issued_at)}</span>}
          </div>

          {expanded && event.description && (
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--roam-text-muted)", lineHeight: 1.5 }}>
              {event.description}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0, marginTop: 2 }}>
          {hasCoord && (
            <div style={{
              fontSize: 9, fontWeight: 950, color: sev.color, opacity: 0.8,
              background: `color-mix(in srgb, ${sev.color} 10%, transparent)`,
              padding: "2px 5px", borderRadius: 4, letterSpacing: "0.5px",
            }}>
              MAP
            </div>
          )}
          {event.description && (
            <div
              style={{
                fontSize: 14, color: "var(--roam-text-muted)", marginTop: 2,
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
              }}
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            >
              ▾
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main panel ───────────────────────────────────────────────────────── */

type AlertFilter = "all" | "traffic" | "hazards" | "ahead";

export function TripAlertsPanel({
  traffic,
  hazards,
  routeGeometry,
  userPosition,
  onFocusAlert,
}: {
  traffic: TrafficOverlay | null;
  hazards: HazardOverlay | null;
  routeGeometry?: string | null;
  userPosition?: RoamPosition | null;
  onFocusAlert?: (focus: AlertFocusEvent) => void;
}) {
  const [filter, setFilter] = useState<AlertFilter>("all");

  // Decode route once
  const routeCoords = useMemo(() => {
    if (!routeGeometry) return null;
    try { return decodePolyline6(routeGeometry); } catch { return null; }
  }, [routeGeometry]);

  // Project user onto route
  const userKmAlong = useMemo(() => {
    if (!userPosition || !routeCoords || routeCoords.length < 2) return null;
    const proj = projectOntoRoute(userPosition.lat, userPosition.lng, routeCoords);
    return proj.distKm < 50 ? proj.kmAlong : null; // only if user is near the route
  }, [userPosition, routeCoords]);

  // Enrich + sort
  const enrichedTraffic = useMemo(
    () => enrichTraffic(traffic?.items ?? [], routeCoords, userPosition, userKmAlong)
        .sort((a, b) => a.relevanceScore - b.relevanceScore),
    [traffic, routeCoords, userPosition, userKmAlong],
  );

  const enrichedHazards = useMemo(
    () => enrichHazards(hazards?.items ?? [], routeCoords, userPosition, userKmAlong)
        .sort((a, b) => a.relevanceScore - b.relevanceScore),
    [hazards, routeCoords, userPosition, userKmAlong],
  );

  // "Ahead" filter: only items ahead of the user on the route
  const aheadTraffic = useMemo(
    () => enrichedTraffic.filter((e) => userKmAlong != null && e.kmAlongRoute != null && e.kmAlongRoute > userKmAlong),
    [enrichedTraffic, userKmAlong],
  );
  const aheadHazards = useMemo(
    () => enrichedHazards.filter((e) => userKmAlong != null && e.kmAlongRoute != null && e.kmAlongRoute > userKmAlong),
    [enrichedHazards, userKmAlong],
  );

  const totalCount = enrichedTraffic.length + enrichedHazards.length;
  const aheadCount = aheadTraffic.length + aheadHazards.length;
  const highSeverityCount =
    enrichedTraffic.filter((t) => t.severity === "major").length +
    enrichedHazards.filter((h) => h.severity === "high").length;

  if (totalCount === 0) {
    return (
      <div
        style={{
          padding: "16px 14px", borderRadius: 16,
          background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)",
          display: "flex", alignItems: "center", gap: 10,
        }}
      >
        <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(34,197,94,0.15)", display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 }}>
          ✓
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 950, color: "var(--roam-text)" }}>All clear on your route</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--roam-text-muted)", marginTop: 2 }}>
            No traffic incidents or weather hazards detected
          </div>
        </div>
      </div>
    );
  }

  const filterTabs: { key: AlertFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: totalCount },
    ...(userKmAlong != null ? [{ key: "ahead" as AlertFilter, label: "Ahead", count: aheadCount }] : []),
    { key: "traffic", label: "Traffic", count: enrichedTraffic.length },
    { key: "hazards", label: "Hazards", count: enrichedHazards.length },
  ];

  const shownTraffic = filter === "hazards" ? [] : filter === "ahead" ? aheadTraffic : enrichedTraffic;
  const shownHazards = filter === "traffic" ? [] : filter === "ahead" ? aheadHazards : enrichedHazards;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Critical alert banner */}
      {highSeverityCount > 0 && (
        <div
          style={{
            padding: "10px 14px", borderRadius: 12,
            background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.18)",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          <span style={{ fontSize: 14 }}>🚨</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#ef4444" }}>
            {highSeverityCount} critical alert{highSeverityCount !== 1 ? "s" : ""} on your route
          </span>
        </div>
      )}

      {/* "Ahead" teaser when user position is known */}
      {userKmAlong != null && aheadCount > 0 && filter !== "ahead" && (
        <div
          onClick={() => { haptic.selection(); setFilter("ahead"); }}
          style={{
            padding: "10px 14px", borderRadius: 12, cursor: "pointer",
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          <span style={{ fontSize: 13 }}>↗</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: "#f59e0b" }}>
            {aheadCount} alert{aheadCount !== 1 ? "s" : ""} ahead of you — tap to filter
          </span>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        {filterTabs.map((tab) => {
          if (tab.count === 0 && tab.key !== "all") return null;
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { haptic.selection(); setFilter(tab.key); }}
              style={{
                padding: "6px 12px", borderRadius: 10, border: "none",
                fontSize: 12, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap",
                background: active ? "var(--roam-accent, #2563eb)" : "var(--roam-surface-hover)",
                color: active ? "#fff" : "var(--roam-text-muted)",
                transition: "all 0.12s ease",
              }}
            >
              {tab.label}
              <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 950, opacity: 0.8 }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tap-to-zoom hint */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--roam-text-muted)", paddingLeft: 2 }}>
        Tap an alert to jump to it on the map
      </div>

      {/* Alert cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {shownTraffic.map((ev) => (
          <TrafficAlertCard key={ev.id} event={ev} onFocus={onFocusAlert} />
        ))}
        {shownHazards.map((ev) => (
          <HazardAlertCard key={ev.id} event={ev} onFocus={onFocusAlert} />
        ))}
        {shownTraffic.length === 0 && shownHazards.length === 0 && (
          <div style={{ padding: "14px", borderRadius: 12, background: "var(--roam-surface-hover)", textAlign: "center", fontSize: 12, fontWeight: 800, color: "var(--roam-text-muted)" }}>
            No alerts match this filter
          </div>
        )}
      </div>
    </div>
  );
}