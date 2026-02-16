// src/components/trip/TripAlertsPanel.tsx
"use client";

import { useMemo, useState, useCallback } from "react";
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
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════════════ */

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
   Enrichment engine — PROXIMITY-FIRST scoring
   ══════════════════════════════════════════════════════════════════════ */

function fmtKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function buildContextLabel(userKm: number | null, alertKm: number | null, userDist: number | null, routeDist: number | null): string {
  const parts: string[] = [];
  if (routeDist != null && routeDist > 25) parts.push(`${Math.round(routeDist)} km off-route`);
  if (userKm != null && alertKm != null) {
    const d = alertKm - userKm;
    if (Math.abs(d) < 2) parts.unshift("Right here");
    else if (d > 0) parts.unshift(`${fmtKm(Math.abs(d))} ahead`);
    else parts.unshift(`${fmtKm(Math.abs(d))} behind`);
  } else if (userDist != null) {
    parts.unshift(`${fmtKm(userDist)} away`);
  }
  return parts.join(" · ");
}

/**
 * PROXIMITY-FIRST relevance scoring.
 *
 * Formula: distFromUser * 10  +  sevOrder * 15  -  aheadBonus  +  offRoutePenalty
 *
 * Example outputs (lower = more urgent):
 *   2.5 km ahead, moderate (order 1): 2.5*10 + 1*15 - 30 = 10
 *   85 km ahead, major (order 0):     85*10 + 0*15 - 30 = 820
 *
 * A nearby moderate alert ALWAYS outranks a distant major alert.
 */
function relevanceScore(sevOrder: number, userDist: number | null, routeDist: number | null, ahead: number | null): number {
  let s = 0;

  // Primary factor: distance from user (proximity dominates)
  if (userDist != null) {
    s += userDist * 10;
  } else {
    // No user position available → push towards back but still rank by severity
    s += 500;
  }

  // Secondary factor: severity (lower sevOrder = more severe)
  s += sevOrder * 15;

  // Bonus: alerts ahead of the user are more relevant than behind
  if (ahead != null && ahead > 0) s -= 30;

  // Penalty: alerts far off-route are less relevant
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
    out.push({
      id: ev.id, alertKind: "traffic", headline: ev.headline, description: ev.description,
      iconKey: T_ICON_KEYS[ev.type ?? "unknown"], severity: ev.severity ?? "unknown",
      sevOrder: sev.order, sevColor: sev.color, sevBg: sev.bg, sevLabel: sev.label,
      typeLabel: (ev.type ?? "unknown").replace("_", " "),
      source: ev.source, timestamp: ev.last_updated,
      coord, distFromUserKm: dUser, kmAlongRoute: kmAlong, distFromRouteKm: dRoute,
      contextLabel: buildContextLabel(userKm, kmAlong, dUser, dRoute),
      relevanceScore: relevanceScore(sev.order, dUser, dRoute, ahead),
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
    out.push({
      id: ev.id, alertKind: "hazard", headline: ev.title, description: ev.description,
      iconKey: H_ICON_KEYS[ev.kind ?? "unknown"], severity: ev.severity ?? "unknown",
      sevOrder: sev.order, sevColor: sev.color, sevBg: sev.bg, sevLabel: sev.label,
      typeLabel: (ev.kind ?? "unknown").replace("_", " "),
      source: ev.source, timestamp: ev.issued_at,
      coord, distFromUserKm: dUser, kmAlongRoute: kmAlong, distFromRouteKm: dRoute,
      contextLabel: buildContextLabel(userKm, kmAlong, dUser, dRoute),
      relevanceScore: relevanceScore(sev.order, dUser, dRoute, ahead),
    });
  }

  return out.sort((a, b) => a.relevanceScore - b.relevanceScore);
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

  const all = useMemo(
    () => enrichAlerts(traffic ?? null, hazards ?? null, routeGeometry, userPosition),
    [traffic, hazards, routeGeometry, userPosition],
  );

  // The single most urgent upcoming alert (ahead + on-route)
  const next = useMemo(() => {
    const upcoming = all.filter((a) => {
      if (!a.coord) return false;
      if (!a.contextLabel.includes("ahead") && !a.contextLabel.includes("Right here")) return false;
      if (a.distFromRouteKm != null && a.distFromRouteKm > 25) return false;
      return true;
    });
    return upcoming.length > 0 ? upcoming[0] : null;
  }, [all]);

  // Compute km-along for each stop (for leg-based alert grouping)
  const stopKmAlongs = useMemo(() => {
    if (!rc || rc.length < 2 || !stops) return null;
    return stops.map((s) => projectOntoRoute(s.lat, s.lng, rc).kmAlong);
  }, [rc, stops]);

  // Get alerts for a leg segment between stop indices
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

  const highCount = all.filter((a) => a.sevOrder === 0).length;
  const totalCount = all.length;

  return { all, next, alertsForLeg, highCount, totalCount };
}

/* ══════════════════════════════════════════════════════════════════════
   AlertCard — used in NextAlertBanner and LegAlertStrip
   ══════════════════════════════════════════════════════════════════════ */

export function AlertCard({
  alert,
  compact = false,
  highlighted = false,
  onHighlight,
}: {
  alert: EnrichedAlert;
  compact?: boolean;
  highlighted?: boolean;
  onHighlight?: (ev: AlertHighlightEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const handleTap = () => {
    haptic.selection();
    if (alert.coord && onHighlight) {
      onHighlight({ id: alert.id, kind: alert.alertKind, lat: alert.coord.lat, lng: alert.coord.lng });
    }
    if (alert.description) setExpanded((v) => !v);
  };

  return (
    <div
      onClick={handleTap}
      style={{
        padding: compact ? "8px 10px" : "10px 14px",
        borderRadius: compact ? 12 : 14,
        background: highlighted
          ? `color-mix(in srgb, ${alert.sevColor} 18%, var(--roam-surface))`
          : alert.sevBg,
        border: `1.5px solid ${highlighted ? alert.sevColor : `color-mix(in srgb, ${alert.sevColor} 18%, transparent)`}`,
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: compact ? 8 : 10 }}>
        {/* Icon container */}
        <div style={{
          width: compact ? 30 : 34, height: compact ? 30 : 34,
          borderRadius: compact ? 9 : 10,
          background: `color-mix(in srgb, ${alert.sevColor} 12%, var(--roam-surface))`,
          border: `1px solid color-mix(in srgb, ${alert.sevColor} 15%, transparent)`,
          display: "grid", placeItems: "center",
          flexShrink: 0,
        }}>
          <AlertIcon iconKey={alert.iconKey} size={compact ? 14 : 16} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {alert.contextLabel && (
            <div style={{
              fontSize: compact ? 10 : 11, fontWeight: 950, color: alert.sevColor,
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
              <span style={{
                fontSize: 9, fontWeight: 950, color: alert.sevColor,
                background: `color-mix(in srgb, ${alert.sevColor} 12%, transparent)`,
                padding: "2px 6px", borderRadius: 6,
                textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0,
              }}>
                {alert.sevLabel}
              </span>
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

        {/* Expand chevron + highlight indicator */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0, paddingTop: 2 }}>
          {alert.coord && !compact && (
            <div style={{
              width: 7, height: 7, borderRadius: 7,
              background: highlighted ? alert.sevColor : `color-mix(in srgb, ${alert.sevColor} 35%, transparent)`,
              transition: "background 0.2s ease",
              boxShadow: highlighted ? `0 0 6px ${alert.sevColor}` : "none",
            }} />
          )}
          {alert.description && (
            <ChevronDown
              size={14}
              color="var(--roam-text-muted)"
              style={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease", marginTop: 2,
              }}
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

   Shows the single most important upcoming thing, or "Clear ahead".
   ══════════════════════════════════════════════════════════════════════ */

export function NextAlertBanner({
  next,
  totalCount,
  highCount,
  allAlerts,
  highlighted,
  onHighlight,
}: {
  next: EnrichedAlert | null;
  totalCount: number;
  highCount: number;
  allAlerts: EnrichedAlert[];
  highlighted?: string | null;
  onHighlight?: (ev: AlertHighlightEvent) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  // Clear ahead
  if (totalCount === 0) {
    return (
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
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--roam-text-muted)", marginTop: 1 }}>
            No alerts on your route
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Main banner: the single most urgent upcoming alert, or a summary */}
      {next ? (
        <AlertCard alert={next} highlighted={highlighted === next.id} onHighlight={onHighlight} />
      ) : (
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
            {highCount > 0 && (
              <div style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", marginTop: 1 }}>
                {highCount} critical
              </div>
            )}
          </div>
        </div>
      )}

      {/* "See all X alerts" toggle */}
      {totalCount > 1 && (
        <button
          type="button"
          onClick={() => { haptic.selection(); setShowAll((v) => !v); }}
          style={{
            padding: "7px 12px", borderRadius: 10, border: "none",
            background: "var(--roam-surface-hover)",
            color: "var(--roam-text-muted)",
            fontSize: 11, fontWeight: 900, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "all 0.12s ease",
          }}
        >
          {showAll ? "Hide" : `See all ${totalCount} alerts`}
          <ChevronDown
            size={12}
            style={{
              transform: showAll ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
            }}
          />
        </button>
      )}

      {/* Expanded list */}
      {showAll && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {allAlerts
            .filter((a) => a.id !== next?.id)
            .map((a) => (
              <AlertCard
                key={a.id}
                alert={a}
                compact
                highlighted={highlighted === a.id}
                onHighlight={onHighlight}
              />
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
}: {
  alerts: EnrichedAlert[];
  highlighted?: string | null;
  onHighlight?: (ev: AlertHighlightEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const worst = alerts.reduce((a, b) => (a.sevOrder < b.sevOrder ? a : b));
  const isCritical = worst.sevOrder === 0;

  // Single alert — show inline card directly
  if (alerts.length === 1) {
    return (
      <div style={{ paddingLeft: 20, position: "relative" }}>
        <div style={{
          position: "absolute", left: 13, top: -4, bottom: -4, width: 2,
          background: `color-mix(in srgb, ${worst.sevColor} 30%, transparent)`,
          borderRadius: 2,
        }} />
        <AlertCard
          alert={alerts[0]}
          compact
          highlighted={highlighted === alerts[0].id}
          onHighlight={onHighlight}
        />
      </div>
    );
  }

  // Multiple alerts — collapsible summary strip
  return (
    <div style={{ paddingLeft: 20, position: "relative" }}>
      <div style={{
        position: "absolute", left: 13, top: -4, bottom: -4, width: 2,
        background: `color-mix(in srgb, ${worst.sevColor} 30%, transparent)`,
        borderRadius: 2,
      }} />

      <div
        onClick={() => { haptic.selection(); setExpanded((v) => !v); }}
        style={{
          padding: "8px 12px", borderRadius: 11, cursor: "pointer",
          background: worst.sevBg,
          border: `1.5px solid color-mix(in srgb, ${worst.sevColor} 20%, transparent)`,
          display: "flex", alignItems: "center", gap: 8,
          transition: "all 0.12s ease",
        }}
      >
        <AlertIcon iconKey={worst.iconKey} size={14} />
        <span style={{ fontSize: 11, fontWeight: 950, color: worst.sevColor, flex: 1 }}>
          {alerts.length} alerts on this stretch
          {isCritical && " — including critical"}
        </span>
        <ChevronDown
          size={13}
          color="var(--roam-text-muted)"
          style={{
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        />
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {alerts.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              compact
              highlighted={highlighted === a.id}
              onHighlight={onHighlight}
            />
          ))}
        </div>
      )}
    </div>
  );
}