// src/components/trip/TripMap.tsx
"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import maplibregl, { type Map as MLMap, type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";

import type { BBox4 } from "@/lib/types/geo";
import type { TripStop } from "@/lib/types/trip";
import type { PlaceItem, PlaceCategory } from "@/lib/types/places";
import type { TrafficOverlay, HazardOverlay, TrafficEvent, HazardEvent } from "@/lib/types/navigation";
import type { RoamPosition } from "@/lib/native/geolocation";

import { assetsApi } from "@/lib/api/assets";

type Props = {
  styleId: string;

  stops: TripStop[];
  geometry: string; // polyline6
  bbox: BBox4;

  focusedStopId?: string | null;
  onStopPress?: (stopId: string) => void;

  // Suggestions
  suggestions?: PlaceItem[] | null;
  filteredSuggestionIds?: Set<string> | null;
  focusedSuggestionId?: string | null;
  onSuggestionPress?: (placeId: string) => void;

  // Overlays
  traffic?: TrafficOverlay | null;
  hazards?: HazardOverlay | null;
  onTrafficEventPress?: (eventId: string) => void;
  onHazardEventPress?: (eventId: string) => void;

  // User location (from native geolocation)
  userPosition?: RoamPosition | null;

  // Map tap for placing stops
  onMapLongPress?: (lat: number, lng: number) => void;

  // Guide navigation
  planId?: string | null;
  onNavigateToGuide?: (placeId: string) => void;

  // External focus coordinate (e.g. from alert click)
  focusCoord?: { lat: number; lng: number; zoom?: number } | null;
};

/* ── Layer / source IDs ─────────────────────────────────────────────── */

const ROUTE_SRC = "roam-route-src";
const ROUTE_GLOW = "roam-route-glow";
const ROUTE_CASING = "roam-route-casing";
const ROUTE_LINE = "roam-route-line";

const STOPS_SRC = "roam-stops-src";
const STOPS_SPARSE_Z0 = "roam-stops-sparse-z0";
const STOPS_SPARSE_Z1 = "roam-stops-sparse-z1";
const STOPS_ALL = "roam-stops-all";
const STOP_LABELS = "roam-stop-labels";
const STOP_FOCUS_LAYER = "roam-stop-focus-layer";

const SUG_SRC = "roam-suggestions-src";
const SUG_CLUSTER_CIRCLE = "roam-sug-cluster-circle";
const SUG_CLUSTER_COUNT = "roam-sug-cluster-count";
const SUG_UNCLUSTERED = "roam-sug-unclustered";
const SUG_ICON_LAYER = "roam-sug-icon";
const SUG_LABEL_LAYER = "roam-sug-label";

const TRAFFIC_POINT_SRC = "roam-traffic-pt-src";
const TRAFFIC_LINE_SRC = "roam-traffic-line-src";
const TRAFFIC_POLY_SRC = "roam-traffic-poly-src";
const TRAFFIC_POINT_LAYER = "roam-traffic-pt";
const TRAFFIC_LINE_LAYER = "roam-traffic-line";
const TRAFFIC_POLY_LAYER = "roam-traffic-poly";
const TRAFFIC_PULSE_LAYER = "roam-traffic-pulse";

const HAZARD_POINT_SRC = "roam-hazard-pt-src";
const HAZARD_POLY_SRC = "roam-hazard-poly-src";
const HAZARD_POINT_LAYER = "roam-hazard-pt";
const HAZARD_POLY_LAYER = "roam-hazard-poly";
const HAZARD_POLY_OUTLINE = "roam-hazard-poly-outline";
const HAZARD_ICON_LAYER = "roam-hazard-icon";

const USER_LOC_SRC = "roam-user-loc-src";
const USER_LOC_ACCURACY = "roam-user-loc-accuracy";
const USER_LOC_DOT_OUTER = "roam-user-loc-dot-outer";
const USER_LOC_DOT_INNER = "roam-user-loc-dot-inner";
const USER_LOC_HEADING_SRC = "roam-user-heading-src";
const USER_LOC_HEADING = "roam-user-loc-heading";

/* ── Heading arrow image (SVG → data URL) ───────────────────────────── */

const HEADING_ARROW_ID = "roam-heading-arrow";
const HEADING_ARROW_SVG = `<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hg" x1="24" y1="4" x2="24" y2="28" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#2563eb" stop-opacity="0.15"/>
    </linearGradient>
  </defs>
  <path d="M24 4 L36 28 L24 22 L12 28 Z" fill="url(#hg)" stroke="#2563eb" stroke-width="1" stroke-opacity="0.4"/>
</svg>`;

function loadHeadingArrow(map: MLMap): Promise<void> {
  return new Promise((resolve) => {
    if (map.hasImage(HEADING_ARROW_ID)) { resolve(); return; }
    const img = new Image(48, 48);
    img.onload = () => { if (!map.hasImage(HEADING_ARROW_ID)) map.addImage(HEADING_ARROW_ID, img, { sdf: false }); resolve(); };
    img.onerror = () => resolve();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(HEADING_ARROW_SVG)}`;
  });
}

/* ── Category icon SVGs ──────────────────────────────────────────────── */

type CatConfig = { icon: string; color: string; size: "lg" | "md" | "sm" };

const CATEGORY_CONFIG: Record<string, CatConfig> = {
  // Essential services — large
  fuel:       { icon: "⛽", color: "#f59e0b", size: "lg" },
  hospital:   { icon: "🏥", color: "#ef4444", size: "lg" },
  mechanic:   { icon: "🔧", color: "#fb7185", size: "lg" },
  pharmacy:   { icon: "💊", color: "#f472b6", size: "lg" },
  water:      { icon: "💧", color: "#38bdf8", size: "lg" },

  // Accommodation — medium-large
  camp:       { icon: "⛺", color: "#22c55e", size: "lg" },
  hotel:      { icon: "🏨", color: "#818cf8", size: "md" },
  motel:      { icon: "🛏️", color: "#818cf8", size: "md" },
  hostel:     { icon: "🛌", color: "#818cf8", size: "md" },

  // Food & drink — medium
  grocery:    { icon: "🛒", color: "#34d399", size: "md" },
  cafe:       { icon: "☕", color: "#c084fc", size: "md" },
  restaurant: { icon: "🍽️", color: "#f97316", size: "md" },
  fast_food:  { icon: "🍔", color: "#facc15", size: "sm" },
  pub:        { icon: "🍺", color: "#f59e0b", size: "sm" },
  bar:        { icon: "🍸", color: "#e879f9", size: "sm" },

  // Nature & outdoors — medium
  park:          { icon: "🌿", color: "#4ade80", size: "md" },
  national_park: { icon: "🏞️", color: "#16a34a", size: "lg" },
  beach:         { icon: "🏖️", color: "#60a5fa", size: "md" },
  waterfall:     { icon: "💦", color: "#22d3ee", size: "md" },
  swimming_hole: { icon: "🏊", color: "#06b6d4", size: "md" },
  hiking:        { icon: "🥾", color: "#84cc16", size: "md" },
  picnic:        { icon: "🧺", color: "#a3e635", size: "sm" },
  viewpoint:     { icon: "👁️", color: "#8b5cf6", size: "md" },

  // Sightseeing — medium
  museum:     { icon: "🏛️", color: "#a78bfa", size: "md" },
  gallery:    { icon: "🎨", color: "#c084fc", size: "sm" },
  zoo:        { icon: "🦘", color: "#4ade80", size: "md" },
  theme_park: { icon: "🎢", color: "#f472b6", size: "md" },
  heritage:   { icon: "🏛️", color: "#d4a574", size: "md" },
  attraction: { icon: "⭐", color: "#fbbf24", size: "md" },

  // Town / utilities — small
  town:    { icon: "🏘️", color: "#eab308", size: "sm" },
  toilet:  { icon: "🚻", color: "#a78bfa", size: "sm" },
  address: { icon: "📍", color: "#94a3b8", size: "sm" },
  place:   { icon: "📍", color: "#94a3b8", size: "sm" },
  region:  { icon: "🗺️", color: "#94a3b8", size: "sm" },
};

const DEFAULT_CAT_CONFIG: CatConfig = { icon: "📍", color: "#94a3b8", size: "sm" };

function getCatConfig(cat: string): CatConfig {
  return CATEGORY_CONFIG[cat] ?? DEFAULT_CAT_CONFIG;
}

function catColor(c: PlaceCategory): string {
  return getCatConfig(c).color;
}

const SIZE_RADII: Record<CatConfig["size"], { base: number; z8: number; z12: number; z16: number }> = {
  lg: { base: 6, z8: 7, z12: 9, z16: 12 },
  md: { base: 4, z8: 5, z12: 7, z16: 10 },
  sm: { base: 3, z8: 4, z12: 5, z16: 8 },
};

/* ── Overlay icon images ─────────────────────────────────────────────── */

const OVERLAY_ICONS: Record<string, { svg: string; id: string }> = {};

function svgToDataUrl(svgStr: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
}

function makeCategoryMarkerSVG(emoji: string, bgColor: string, sizePx: number): string {
  const r = sizePx / 2;
  return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${r}" cy="${r}" r="${r - 1}" fill="${bgColor}" fill-opacity="0.92" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>
    <text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(sizePx * 0.48)}">${emoji}</text>
  </svg>`;
}

function loadCategoryIcons(map: MLMap): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [cat, cfg] of Object.entries(CATEGORY_CONFIG)) {
    const imgId = `roam-cat-${cat}`;
    if (map.hasImage(imgId)) continue;
    const sizePx = cfg.size === "lg" ? 36 : cfg.size === "md" ? 30 : 24;
    const svg = makeCategoryMarkerSVG(cfg.icon, cfg.color, sizePx);
    promises.push(
      new Promise<void>((resolve) => {
        const img = new Image(sizePx, sizePx);
        img.onload = () => {
          if (!map.hasImage(imgId)) map.addImage(imgId, img, { sdf: false });
          resolve();
        };
        img.onerror = () => resolve();
        img.src = svgToDataUrl(svg);
      }),
    );
  }
  // Default icon
  if (!map.hasImage("roam-cat-default")) {
    const svg = makeCategoryMarkerSVG("📍", "#94a3b8", 24);
    promises.push(
      new Promise<void>((resolve) => {
        const img = new Image(24, 24);
        img.onload = () => {
          if (!map.hasImage("roam-cat-default")) map.addImage("roam-cat-default", img, { sdf: false });
          resolve();
        };
        img.onerror = () => resolve();
        img.src = svgToDataUrl(svg);
      }),
    );
  }
  return Promise.all(promises).then(() => {});
}

/* ── Traffic/Hazard icon images ──────────────────────────────────────── */

function makeOverlayIconSVG(emoji: string, bgColor: string): string {
  return `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="14" fill="${bgColor}" fill-opacity="0.95" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/>
    <text x="16" y="16" text-anchor="middle" dominant-baseline="central" font-size="14">${emoji}</text>
  </svg>`;
}

const TRAFFIC_ICON_MAP: Record<string, { emoji: string; color: string }> = {
  closure:    { emoji: "⛔", color: "#ef4444" },
  flooding:   { emoji: "🌊", color: "#3b82f6" },
  congestion: { emoji: "🚗", color: "#f59e0b" },
  roadworks:  { emoji: "🚧", color: "#f97316" },
  hazard:     { emoji: "⚠️", color: "#eab308" },
  incident:   { emoji: "🚨", color: "#ef4444" },
  unknown:    { emoji: "❓", color: "#64748b" },
};

const HAZARD_ICON_MAP: Record<string, { emoji: string; color: string }> = {
  flood:           { emoji: "🌊", color: "#3b82f6" },
  cyclone:         { emoji: "🌀", color: "#7c3aed" },
  storm:           { emoji: "⛈️", color: "#6366f1" },
  fire:            { emoji: "🔥", color: "#ef4444" },
  wind:            { emoji: "💨", color: "#64748b" },
  heat:            { emoji: "🌡️", color: "#ea580c" },
  marine:          { emoji: "🌊", color: "#0ea5e9" },
  weather_warning: { emoji: "⚡", color: "#eab308" },
  unknown:         { emoji: "⚠️", color: "#64748b" },
};

function loadOverlayIcons(map: MLMap): Promise<void> {
  const all: Promise<void>[] = [];
  const loadOne = (id: string, emoji: string, color: string) => {
    if (map.hasImage(id)) return;
    const svg = makeOverlayIconSVG(emoji, color);
    all.push(
      new Promise<void>((resolve) => {
        const img = new Image(32, 32);
        img.onload = () => { if (!map.hasImage(id)) map.addImage(id, img, { sdf: false }); resolve(); };
        img.onerror = () => resolve();
        img.src = svgToDataUrl(svg);
      }),
    );
  };
  for (const [k, v] of Object.entries(TRAFFIC_ICON_MAP)) loadOne(`roam-traffic-${k}`, v.emoji, v.color);
  for (const [k, v] of Object.entries(HAZARD_ICON_MAP)) loadOne(`roam-hazard-${k}`, v.emoji, v.color);
  return Promise.all(all).then(() => {});
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function bboxToBounds(b: BBox4): LngLatBoundsLike {
  return [ [b.minLng, b.minLat], [b.maxLng, b.maxLat] ];
}

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
    coordinates.push([lng / factor, lat / factor]);
  }
  return coordinates;
}

function routeGeoJSON(polyline6: string) {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature", properties: {},
      geometry: { type: "LineString", coordinates: decodePolyline6(polyline6) },
    }],
  } as any;
}

function stopsGeoJSON(stops: TripStop[]) {
  return {
    type: "FeatureCollection",
    features: (stops ?? []).map((s, idx) => ({
      type: "Feature",
      properties: {
        id: s.id ?? `${idx}`,
        type: s.type ?? "poi",
        name: s.name ?? "",
        idx,
      },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    })),
  } as any;
}

function suggestionsGeoJSON(items: PlaceItem[], allowed?: Set<string> | null) {
  return {
    type: "FeatureCollection",
    features: (items ?? [])
      .filter((p) => (allowed ? allowed.has(p.id) : true))
      .map((p) => {
        const cfg = getCatConfig(p.category);
        return {
          type: "Feature",
          properties: {
            id: p.id,
            name: p.name ?? "",
            category: p.category ?? "unknown",
            color: cfg.color,
            sizeClass: cfg.size,
            iconId: CATEGORY_CONFIG[p.category] ? `roam-cat-${p.category}` : "roam-cat-default",
          },
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        };
      }),
  } as any;
}

/* ── Overlay GeoJSON builders ────────────────────────────────────────── */

function trafficPointsGeoJSON(overlay: TrafficOverlay | null) {
  if (!overlay) return { type: "FeatureCollection", features: [] } as any;
  return {
    type: "FeatureCollection",
    features: overlay.items
      .filter((ev) => {
        const g = ev.geometry;
        return g && g.type === "Point" && Array.isArray(g.coordinates);
      })
      .map((ev) => ({
        type: "Feature",
        properties: {
          id: ev.id,
          type: ev.type ?? "unknown",
          severity: ev.severity ?? "unknown",
          headline: ev.headline,
          iconId: `roam-traffic-${ev.type ?? "unknown"}`,
        },
        geometry: ev.geometry,
      })),
  } as any;
}

function trafficLinesGeoJSON(overlay: TrafficOverlay | null) {
  if (!overlay) return { type: "FeatureCollection", features: [] } as any;
  return {
    type: "FeatureCollection",
    features: overlay.items
      .filter((ev) => ev.geometry && (ev.geometry.type === "LineString" || ev.geometry.type === "MultiLineString"))
      .map((ev) => ({
        type: "Feature",
        properties: {
          id: ev.id,
          type: ev.type ?? "unknown",
          severity: ev.severity ?? "unknown",
          headline: ev.headline,
        },
        geometry: ev.geometry,
      })),
  } as any;
}

function trafficPolygonsGeoJSON(overlay: TrafficOverlay | null) {
  if (!overlay) return { type: "FeatureCollection", features: [] } as any;
  return {
    type: "FeatureCollection",
    features: overlay.items
      .filter((ev) => ev.geometry && (ev.geometry.type === "Polygon" || ev.geometry.type === "MultiPolygon"))
      .map((ev) => ({
        type: "Feature",
        properties: {
          id: ev.id,
          type: ev.type ?? "unknown",
          severity: ev.severity ?? "unknown",
          headline: ev.headline,
        },
        geometry: ev.geometry,
      })),
  } as any;
}

function hazardPointsGeoJSON(overlay: HazardOverlay | null) {
  if (!overlay) return { type: "FeatureCollection", features: [] } as any;
  // Events with point geometry, or events with bbox but no geometry (we synthesize a center point)
  return {
    type: "FeatureCollection",
    features: overlay.items
      .map((ev) => {
        if (ev.geometry && ev.geometry.type === "Point") {
          return {
            type: "Feature",
            properties: {
              id: ev.id,
              kind: ev.kind ?? "unknown",
              severity: ev.severity ?? "unknown",
              title: ev.title,
              iconId: `roam-hazard-${ev.kind ?? "unknown"}`,
            },
            geometry: ev.geometry,
          };
        }
        // Synthesize center from bbox if no point geometry
        if (ev.bbox && ev.bbox.length === 4 && !ev.geometry) {
          return {
            type: "Feature",
            properties: {
              id: ev.id,
              kind: ev.kind ?? "unknown",
              severity: ev.severity ?? "unknown",
              title: ev.title,
              iconId: `roam-hazard-${ev.kind ?? "unknown"}`,
            },
            geometry: {
              type: "Point",
              coordinates: [(ev.bbox[0] + ev.bbox[2]) / 2, (ev.bbox[1] + ev.bbox[3]) / 2],
            },
          };
        }
        return null;
      })
      .filter(Boolean),
  } as any;
}

function hazardPolygonsGeoJSON(overlay: HazardOverlay | null) {
  if (!overlay) return { type: "FeatureCollection", features: [] } as any;
  return {
    type: "FeatureCollection",
    features: overlay.items
      .filter((ev) => ev.geometry && (ev.geometry.type === "Polygon" || ev.geometry.type === "MultiPolygon"))
      .map((ev) => ({
        type: "Feature",
        properties: {
          id: ev.id,
          kind: ev.kind ?? "unknown",
          severity: ev.severity ?? "unknown",
          title: ev.title,
        },
        geometry: ev.geometry,
      })),
  } as any;
}

/* ── User location GeoJSON ───────────────────────────────────────────── */

function userLocGeoJSON(pos: RoamPosition | null | undefined) {
  if (!pos) return { type: "FeatureCollection", features: [] } as any;
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { accuracy: pos.accuracy, heading: pos.heading, speed: pos.speed },
      geometry: { type: "Point", coordinates: [pos.lng, pos.lat] },
    }],
  } as any;
}

function headingConeGeoJSON(pos: RoamPosition | null | undefined) {
  if (!pos || pos.heading == null || pos.speed == null || pos.speed < 0.5) {
    return { type: "FeatureCollection", features: [] } as any;
  }
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { heading: pos.heading },
      geometry: { type: "Point", coordinates: [pos.lng, pos.lat] },
    }],
  } as any;
}

function accuracyToPixels(accuracyM: number, lat: number, zoom: number): number {
  const metersPerPixel = (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * 6371008.8) / (256 * Math.pow(2, zoom));
  return Math.max(12, Math.min(200, accuracyM / metersPerPixel));
}

/* ── Style / PMTiles helpers ─────────────────────────────────────────── */

function rewriteStyleForPMTiles(style: any, origin: string) {
  if (!style?.sources || typeof style.sources !== "object") return style;
  const out = { ...style, sources: { ...style.sources } };
  for (const [k, src] of Object.entries<any>(out.sources)) {
    if (!src || typeof src !== "object") continue;
    if (typeof src.url === "string" && src.url.startsWith("pmtiles://")) {
      out.sources[k] = { ...src, url: normalizePmtilesUrl(src.url, origin) };
    } else if (Array.isArray(src.tiles)) {
      out.sources[k] = {
        ...src,
        tiles: src.tiles.map((t: string) =>
          typeof t === "string" && t.startsWith("pmtiles://") ? normalizePmtilesUrl(t, origin) : t,
        ),
      };
    }
  }
  return out;
}

function normalizePmtilesUrl(u: string, origin: string) {
  let inner = u.slice("pmtiles://".length).replace(/^\/+/, "");
  if (/^https?:\/\//i.test(inner)) return `pmtiles://${inner}`;
  const path = inner.startsWith("offline/") ? `/${inner}` : inner.startsWith("/") ? inner : `/${inner}`;
  return `pmtiles://${origin}${path}`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function addOrUpdateGeoJsonSource(map: MLMap, id: string, data: any, extraOpts?: Record<string, any>) {
  const src: any = map.getSource(id);
  if (!src) { map.addSource(id, { type: "geojson", data, ...extraOpts }); return; }
  if (src?.setData) src.setData(data);
}

function easeToCoord(map: MLMap, coord: [number, number], opts?: { zoom?: number; duration?: number }) {
  try {
    const z = opts?.zoom ?? Math.max(map.getZoom(), 13);
    map.easeTo({ center: coord, zoom: Math.min(z, 17), duration: opts?.duration ?? 450 });
  } catch {}
}

/* ── Severity color helpers for overlay layers ───────────────────────── */

const TRAFFIC_SEV_COLORS: Record<string, string> = {
  major: "#ef4444", moderate: "#f59e0b", minor: "#3b82f6", info: "#64748b", unknown: "#64748b",
};

const HAZARD_SEV_COLORS: Record<string, string> = {
  high: "#dc2626", medium: "#ea580c", low: "#2563eb", unknown: "#64748b",
};

/* ── Component ───────────────────────────────────────────────────────── */

export function TripMap(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const protocolRef = useRef<Protocol | null>(null);
  const accuracyAnimFrame = useRef<number | null>(null);

  // Stable callback refs so we don't re-bind closures
  const onNavToGuideRef = useRef(props.onNavigateToGuide);
  onNavToGuideRef.current = props.onNavigateToGuide;
  const onSugPressRef = useRef(props.onSuggestionPress);
  onSugPressRef.current = props.onSuggestionPress;
  const onTrafficPressRef = useRef(props.onTrafficEventPress);
  onTrafficPressRef.current = props.onTrafficEventPress;
  const onHazardPressRef = useRef(props.onHazardEventPress);
  onHazardPressRef.current = props.onHazardEventPress;

  const routeFC = useMemo(() => routeGeoJSON(props.geometry), [props.geometry]);
  const stopsFC = useMemo(() => stopsGeoJSON(props.stops), [props.stops]);
  const sugFC = useMemo(
    () => suggestionsGeoJSON(props.suggestions ?? [], props.filteredSuggestionIds ?? null),
    [props.suggestions, props.filteredSuggestionIds],
  );

  const trafficPtFC = useMemo(() => trafficPointsGeoJSON(props.traffic ?? null), [props.traffic]);
  const trafficLineFC = useMemo(() => trafficLinesGeoJSON(props.traffic ?? null), [props.traffic]);
  const trafficPolyFC = useMemo(() => trafficPolygonsGeoJSON(props.traffic ?? null), [props.traffic]);
  const hazardPtFC = useMemo(() => hazardPointsGeoJSON(props.hazards ?? null), [props.hazards]);
  const hazardPolyFC = useMemo(() => hazardPolygonsGeoJSON(props.hazards ?? null), [props.hazards]);

  const userLocFC = useMemo(() => userLocGeoJSON(props.userPosition), [props.userPosition]);
  const headingFC = useMemo(() => headingConeGeoJSON(props.userPosition), [props.userPosition]);

  /* ── Build popup HTML ───────────────────────────────────────────────── */

  const buildSuggestionPopupHtml = useCallback((name: string, category: string, placeId: string) => {
    const cfg = getCatConfig(category);
    return `<div style="font-family:inherit;min-width:160px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:18px">${cfg.icon}</span>
        <div>
          <div style="font-size:14px;font-weight:900;letter-spacing:-0.2px;color:var(--roam-text)">${escapeHtml(name)}</div>
          <div style="font-size:11px;font-weight:700;color:var(--roam-text-muted);text-transform:capitalize;margin-top:1px">${escapeHtml(category.replace("_", " "))}</div>
        </div>
      </div>
      <button
        data-roam-guide-place="${escapeHtml(placeId)}"
        style="
          display:block;width:100%;margin-top:8px;padding:8px 0;
          border:none;border-radius:10px;cursor:pointer;
          font-size:12px;font-weight:950;letter-spacing:0.2px;
          background:var(--roam-accent,#2563eb);color:#fff;
          box-shadow:0 2px 8px rgba(37,99,235,0.3);
          transition:opacity 0.1s;
        "
        onmouseover="this.style.opacity='0.85'"
        onmouseout="this.style.opacity='1'"
      >View in Guide</button>
    </div>`;
  }, []);

  const buildOverlayPopupHtml = useCallback((title: string, icon: string, severity: string, sevColor: string, description?: string | null) => {
    return `<div style="font-family:inherit;min-width:160px;max-width:260px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:18px">${icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:950;color:var(--roam-text);line-height:1.3">${escapeHtml(title)}</div>
          <span style="
            display:inline-block;margin-top:3px;
            font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;
            color:${sevColor};background:color-mix(in srgb, ${sevColor} 12%, transparent);
            padding:2px 7px;border-radius:5px;
          ">${escapeHtml(severity)}</span>
        </div>
      </div>
      ${description ? `<div style="font-size:11px;font-weight:600;color:var(--roam-text-muted);line-height:1.5;margin-top:6px">${escapeHtml(description.slice(0, 200))}${description.length > 200 ? "…" : ""}</div>` : ""}
    </div>`;
  }, []);

  /* ── Init map once ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const protocol = new Protocol();
    protocolRef.current = protocol;
    maplibregl.addProtocol("pmtiles", protocol.tile.bind(protocol));

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: { version: 8, sources: {}, layers: [] } as any,
      center: [(props.bbox.minLng + props.bbox.maxLng) / 2, (props.bbox.minLat + props.bbox.maxLat) / 2],
      zoom: 6,
      attributionControl: false,
      transformRequest: (url) => {
        if (typeof url === "string" && url.startsWith("pmtiles://")) return { url: normalizePmtilesUrl(url, origin) };
        return { url };
      },
    });
    mapRef.current = map;

    // Load style
    (async () => {
      try {
        const res = await fetch(assetsApi.styleUrl(props.styleId));
        const styleJson = await res.json();
        map.setStyle(rewriteStyleForPMTiles(styleJson, origin), { diff: false });
      } catch (e) { console.error("[TripMap] style load failed", e); }
    })();

    // Stop click handler
    const registerStopClick = (layerId: string) => {
      map.on("click", layerId, (e: any) => {
        const id = e?.features?.[0]?.properties?.id;
        if (id) props.onStopPress?.(String(id));
      });
      map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
    };

    // Long press for placing stops
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressPos: { x: number; y: number } | null = null;

    map.getCanvas().addEventListener("pointerdown", (e) => {
      longPressPos = { x: e.clientX, y: e.clientY };
      longPressTimer = setTimeout(() => {
        if (!longPressPos) return;
        const lngLat = map.unproject([e.offsetX, e.offsetY]);
        props.onMapLongPress?.(lngLat.lat, lngLat.lng);
      }, 600);
    });
    map.getCanvas().addEventListener("pointermove", (e) => {
      if (longPressPos && longPressTimer) {
        const dx = e.clientX - longPressPos.x, dy = e.clientY - longPressPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) { clearTimeout(longPressTimer); longPressTimer = null; }
      }
    });
    map.getCanvas().addEventListener("pointerup", () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      longPressPos = null;
    });

    // Global click handler for popup "View in Guide" button
    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const placeId = target?.getAttribute?.("data-roam-guide-place");
      if (placeId) {
        e.preventDefault();
        e.stopPropagation();
        onNavToGuideRef.current?.(placeId);
      }
    });

    map.on("style.load", async () => {
      // Load all custom icons
      await Promise.all([loadHeadingArrow(map), loadCategoryIcons(map), loadOverlayIcons(map)]);

      /* ── Route layers ──────────────────────────────────────────── */
      addOrUpdateGeoJsonSource(map, ROUTE_SRC, routeFC);

      if (!map.getLayer(ROUTE_GLOW)) {
        map.addLayer({
          id: ROUTE_GLOW, type: "line", source: ROUTE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "rgba(46,124,246,0.55)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 8, 10, 14, 14, 22],
            "line-blur": ["interpolate", ["linear"], ["zoom"], 4, 6, 14, 12],
            "line-opacity": 0.45,
          },
        });
      }
      if (!map.getLayer(ROUTE_CASING)) {
        map.addLayer({
          id: ROUTE_CASING, type: "line", source: ROUTE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "rgba(0,0,0,0.55)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 4.5, 10, 8.5, 14, 12.5],
            "line-opacity": 0.55,
          },
        });
      }
      if (!map.getLayer(ROUTE_LINE)) {
        map.addLayer({
          id: ROUTE_LINE, type: "line", source: ROUTE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "rgba(120,200,255,0.95)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 3, 10, 6.5, 14, 10],
            "line-opacity": 0.95,
          },
        });
      }

      /* ── Traffic overlay layers ────────────────────────────────── */
      addOrUpdateGeoJsonSource(map, TRAFFIC_POLY_SRC, trafficPolyFC);
      addOrUpdateGeoJsonSource(map, TRAFFIC_LINE_SRC, trafficLineFC);
      addOrUpdateGeoJsonSource(map, TRAFFIC_POINT_SRC, trafficPtFC);

      if (!map.getLayer(TRAFFIC_POLY_LAYER)) {
        map.addLayer({
          id: TRAFFIC_POLY_LAYER, type: "fill", source: TRAFFIC_POLY_SRC,
          paint: {
            "fill-color": [
              "match", ["get", "severity"],
              "major", "rgba(239,68,68,0.18)",
              "moderate", "rgba(245,158,11,0.14)",
              "minor", "rgba(59,130,246,0.10)",
              "rgba(100,116,139,0.08)",
            ],
            "fill-opacity": 0.8,
          },
        });
      }

      if (!map.getLayer(TRAFFIC_LINE_LAYER)) {
        map.addLayer({
          id: TRAFFIC_LINE_LAYER, type: "line", source: TRAFFIC_LINE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": [
              "match", ["get", "severity"],
              "major", "#ef4444",
              "moderate", "#f59e0b",
              "minor", "#3b82f6",
              "#64748b",
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 3, 12, 6, 16, 10],
            "line-opacity": 0.75,
            "line-dasharray": [2, 2],
          },
        });
      }

      // Pulsing ring behind traffic points
      if (!map.getLayer(TRAFFIC_PULSE_LAYER)) {
        map.addLayer({
          id: TRAFFIC_PULSE_LAYER, type: "circle", source: TRAFFIC_POINT_SRC,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 12, 12, 18, 16, 24],
            "circle-color": [
              "match", ["get", "severity"],
              "major", "rgba(239,68,68,0.20)",
              "moderate", "rgba(245,158,11,0.16)",
              "rgba(100,116,139,0.10)",
            ],
            "circle-stroke-color": [
              "match", ["get", "severity"],
              "major", "rgba(239,68,68,0.35)",
              "moderate", "rgba(245,158,11,0.30)",
              "rgba(100,116,139,0.20)",
            ],
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.9,
          },
        });
      }

      if (!map.getLayer(TRAFFIC_POINT_LAYER)) {
        map.addLayer({
          id: TRAFFIC_POINT_LAYER, type: "symbol", source: TRAFFIC_POINT_SRC,
          layout: {
            "icon-image": ["get", "iconId"],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.7, 12, 0.9, 16, 1.1],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": 1 },
        });
      }

      // Traffic point click → popup
      map.on("click", TRAFFIC_POINT_LAYER, (e: any) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const tType = p?.type ?? "unknown";
        const iconCfg = TRAFFIC_ICON_MAP[tType] ?? TRAFFIC_ICON_MAP.unknown;
        const sevColor = TRAFFIC_SEV_COLORS[p?.severity ?? "unknown"] ?? "#64748b";
        const html = buildOverlayPopupHtml(p?.headline ?? "Traffic Event", iconCfg.emoji, p?.severity ?? "unknown", sevColor);
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup" })
            .setLngLat(e.lngLat).setHTML(html).addTo(map);
        } catch {}
        onTrafficPressRef.current?.(p?.id);
      });

      /* ── Hazard overlay layers ─────────────────────────────────── */
      addOrUpdateGeoJsonSource(map, HAZARD_POLY_SRC, hazardPolyFC);
      addOrUpdateGeoJsonSource(map, HAZARD_POINT_SRC, hazardPtFC);

      if (!map.getLayer(HAZARD_POLY_LAYER)) {
        map.addLayer({
          id: HAZARD_POLY_LAYER, type: "fill", source: HAZARD_POLY_SRC,
          paint: {
            "fill-color": [
              "match", ["get", "severity"],
              "high", "rgba(220,38,38,0.14)",
              "medium", "rgba(234,88,12,0.10)",
              "low", "rgba(37,99,235,0.08)",
              "rgba(100,116,139,0.06)",
            ],
            "fill-opacity": 0.7,
          },
        });
      }
      if (!map.getLayer(HAZARD_POLY_OUTLINE)) {
        map.addLayer({
          id: HAZARD_POLY_OUTLINE, type: "line", source: HAZARD_POLY_SRC,
          paint: {
            "line-color": [
              "match", ["get", "severity"],
              "high", "rgba(220,38,38,0.6)",
              "medium", "rgba(234,88,12,0.5)",
              "low", "rgba(37,99,235,0.4)",
              "rgba(100,116,139,0.3)",
            ],
            "line-width": 2,
            "line-dasharray": [3, 2],
            "line-opacity": 0.8,
          },
        });
      }

      if (!map.getLayer(HAZARD_ICON_LAYER)) {
        map.addLayer({
          id: HAZARD_ICON_LAYER, type: "symbol", source: HAZARD_POINT_SRC,
          layout: {
            "icon-image": ["get", "iconId"],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.7, 12, 0.9, 16, 1.1],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": 1 },
        });
      }

      // Hazard point click → popup
      map.on("click", HAZARD_ICON_LAYER, (e: any) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const kind = p?.kind ?? "unknown";
        const iconCfg = HAZARD_ICON_MAP[kind] ?? HAZARD_ICON_MAP.unknown;
        const sevColor = HAZARD_SEV_COLORS[p?.severity ?? "unknown"] ?? "#64748b";
        const html = buildOverlayPopupHtml(p?.title ?? "Hazard", iconCfg.emoji, p?.severity ?? "unknown", sevColor);
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup" })
            .setLngLat(e.lngLat).setHTML(html).addTo(map);
        } catch {}
        onHazardPressRef.current?.(p?.id);
      });

      map.on("mouseenter", TRAFFIC_POINT_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", TRAFFIC_POINT_LAYER, () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", HAZARD_ICON_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", HAZARD_ICON_LAYER, () => (map.getCanvas().style.cursor = ""));

      /* ── Stops layers ──────────────────────────────────────────── */
      addOrUpdateGeoJsonSource(map, STOPS_SRC, stopsFC);

      const stopFill = [
        "match", ["get", "type"],
        "start", "rgba(34,197,94,0.95)",
        "end", "rgba(239,68,68,0.95)",
        "via", "rgba(168,85,247,0.95)",
        "rgba(46,124,246,0.95)",
      ] as any;

      if (!map.getLayer(STOPS_SPARSE_Z0)) {
        map.addLayer({
          id: STOPS_SPARSE_Z0, type: "circle", source: STOPS_SRC,
          minzoom: 0, maxzoom: 6,
          filter: ["any", ["==", ["get", "type"], "start"], ["==", ["get", "type"], "end"], ["==", ["%", ["get", "idx"], 6], 0]],
          paint: {
            "circle-color": stopFill,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 4, 6, 6],
            "circle-stroke-color": "rgba(0,0,0,0.45)", "circle-stroke-width": 1, "circle-opacity": 0.92,
          },
        });
      }
      if (!map.getLayer(STOPS_SPARSE_Z1)) {
        map.addLayer({
          id: STOPS_SPARSE_Z1, type: "circle", source: STOPS_SRC,
          minzoom: 6, maxzoom: 9,
          filter: ["any", ["==", ["get", "type"], "start"], ["==", ["get", "type"], "end"], ["==", ["%", ["get", "idx"], 3], 0]],
          paint: {
            "circle-color": stopFill,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 9, 7],
            "circle-stroke-color": "rgba(0,0,0,0.45)", "circle-stroke-width": 1, "circle-opacity": 0.94,
          },
        });
      }
      if (!map.getLayer(STOPS_ALL)) {
        map.addLayer({
          id: STOPS_ALL, type: "circle", source: STOPS_SRC, minzoom: 9,
          paint: {
            "circle-color": stopFill,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5.5, 13, 8, 16, 10],
            "circle-stroke-color": "rgba(0,0,0,0.45)",
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 16, 1.5],
            "circle-opacity": 0.96,
          },
        });
      }
      if (!map.getLayer(STOP_LABELS)) {
        map.addLayer({
          id: STOP_LABELS, type: "symbol", source: STOPS_SRC, minzoom: 10,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Bold"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 14, 12, 16, 14],
            "text-offset": [0, 1.4],
            "text-anchor": "top",
            "text-max-width": 8,
            "text-optional": true,
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "rgba(255,255,255,0.95)",
            "text-halo-color": "rgba(0,0,0,0.75)",
            "text-halo-width": 1.5,
          },
        });
      }
      if (!map.getLayer(STOP_FOCUS_LAYER)) {
        map.addLayer({
          id: STOP_FOCUS_LAYER, type: "circle", source: STOPS_SRC,
          filter: ["==", ["get", "id"], props.focusedStopId ?? ""],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 9, 10, 12, 14, 16],
            "circle-color": "rgba(255,255,255,0.12)",
            "circle-stroke-color": "rgba(255,255,255,0.85)", "circle-stroke-width": 2, "circle-opacity": 1,
          },
        });
      }

      registerStopClick(STOPS_SPARSE_Z0);
      registerStopClick(STOPS_SPARSE_Z1);
      registerStopClick(STOPS_ALL);

      /* ── Suggestions (clustered + icon layer) ──────────────────── */
      addOrUpdateGeoJsonSource(map, SUG_SRC, sugFC, { cluster: true, clusterMaxZoom: 13, clusterRadius: 50 });

      if (!map.getLayer(SUG_CLUSTER_CIRCLE)) {
        map.addLayer({
          id: SUG_CLUSTER_CIRCLE, type: "circle", source: SUG_SRC,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step", ["get", "point_count"],
              "rgba(99,102,241,0.88)", 20, "rgba(245,158,11,0.88)", 100, "rgba(239,68,68,0.88)",
            ],
            "circle-radius": ["step", ["get", "point_count"], 16, 20, 20, 100, 26],
            "circle-stroke-color": "rgba(255,255,255,0.25)", "circle-stroke-width": 2,
            "circle-opacity": 0.92,
          },
        });
      }
      if (!map.getLayer(SUG_CLUSTER_COUNT)) {
        map.addLayer({
          id: SUG_CLUSTER_COUNT, type: "symbol", source: SUG_SRC,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 12, "text-allow-overlap": true,
          },
          paint: { "text-color": "#ffffff" },
        });
      }

      // Unclustered: background circle (size varies by category importance)
      if (!map.getLayer(SUG_UNCLUSTERED)) {
        map.addLayer({
          id: SUG_UNCLUSTERED, type: "circle", source: SUG_SRC,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              8, ["match", ["get", "sizeClass"], "lg", 6, "md", 4, 3],
              12, ["match", ["get", "sizeClass"], "lg", 9, "md", 7, 5],
              16, ["match", ["get", "sizeClass"], "lg", 12, "md", 10, 8],
            ],
            "circle-color": ["get", "color"],
            "circle-stroke-color": [
              "case",
              ["==", ["get", "id"], props.focusedSuggestionId ?? ""],
              "rgba(255,255,255,0.95)",
              "rgba(0,0,0,0.35)",
            ],
            "circle-stroke-width": [
              "case",
              ["==", ["get", "id"], props.focusedSuggestionId ?? ""],
              2.5, 1.2,
            ],
            "circle-opacity": 0.92,
          },
        });
      }

      // Icon symbols on top of unclustered dots
      if (!map.getLayer(SUG_ICON_LAYER)) {
        map.addLayer({
          id: SUG_ICON_LAYER, type: "symbol", source: SUG_SRC,
          filter: ["!", ["has", "point_count"]],
          minzoom: 10,
          layout: {
            "icon-image": ["get", "iconId"],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.55, 14, 0.8, 18, 1.0],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": 1 },
        });
      }

      if (!map.getLayer(SUG_LABEL_LAYER)) {
        map.addLayer({
          id: SUG_LABEL_LAYER, type: "symbol", source: SUG_SRC,
          filter: ["!", ["has", "point_count"]],
          minzoom: 13,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 13],
            "text-offset": [0, 1.4],
            "text-anchor": "top",
            "text-max-width": 10,
            "text-optional": true,
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "rgba(255,255,255,0.9)",
            "text-halo-color": "rgba(0,0,0,0.7)",
            "text-halo-width": 1.2,
          },
        });
      }

      // Cluster click → expand
      map.on("click", SUG_CLUSTER_CIRCLE, (e: any) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [SUG_CLUSTER_CIRCLE] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id;
        if (clusterId == null) return;
        const source = map.getSource(SUG_SRC) as any;
        if (!source?.getClusterExpansionZoom) return;
        source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          const coords = (features[0].geometry as any)?.coordinates;
          if (coords) map.easeTo({ center: coords, zoom: Math.min(zoom, 16), duration: 350 });
        });
      });

      // Unclustered / icon click → popup with "View in Guide" button
      const handleSugClick = (e: any) => {
        const f = e?.features?.[0];
        const id = f?.properties?.id ? String(f.properties.id) : null;
        if (!id) return;

        const coords = (f.geometry as any)?.coordinates;
        if (Array.isArray(coords) && coords.length === 2) {
          easeToCoord(map, [Number(coords[0]), Number(coords[1])], { zoom: Math.max(map.getZoom(), 13), duration: 420 });
        }

        onSugPressRef.current?.(id);

        const name = f?.properties?.name ?? "";
        const cat = f?.properties?.category ?? "";
        const html = buildSuggestionPopupHtml(name, cat, id);
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup", maxWidth: "280px" })
            .setLngLat(e.lngLat).setHTML(html).addTo(map);
        } catch {}
      };

      map.on("click", SUG_UNCLUSTERED, handleSugClick);
      map.on("click", SUG_ICON_LAYER, handleSugClick);

      map.on("mouseenter", SUG_CLUSTER_CIRCLE, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", SUG_CLUSTER_CIRCLE, () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", SUG_UNCLUSTERED, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", SUG_UNCLUSTERED, () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", SUG_ICON_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", SUG_ICON_LAYER, () => (map.getCanvas().style.cursor = ""));

      /* ── User location layers ─────────────────────────────────── */
      addOrUpdateGeoJsonSource(map, USER_LOC_SRC, userLocFC);
      addOrUpdateGeoJsonSource(map, USER_LOC_HEADING_SRC, headingFC);

      if (!map.getLayer(USER_LOC_ACCURACY)) {
        map.addLayer({
          id: USER_LOC_ACCURACY, type: "circle", source: USER_LOC_SRC,
          paint: {
            "circle-radius": 30,
            "circle-color": "rgba(37,99,235,0.08)",
            "circle-stroke-color": "rgba(37,99,235,0.25)", "circle-stroke-width": 1.5, "circle-opacity": 1,
          },
        });
      }

      await loadHeadingArrow(map);
      if (!map.getLayer(USER_LOC_HEADING)) {
        map.addLayer({
          id: USER_LOC_HEADING, type: "symbol", source: USER_LOC_HEADING_SRC,
          layout: {
            "icon-image": HEADING_ARROW_ID,
            "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 14, 1.0, 18, 1.3],
            "icon-rotate": ["get", "heading"],
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true, "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": 0.9 },
        });
      }
      if (!map.getLayer(USER_LOC_DOT_OUTER)) {
        map.addLayer({
          id: USER_LOC_DOT_OUTER, type: "circle", source: USER_LOC_SRC,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 10, 9, 16, 12],
            "circle-color": "#ffffff", "circle-opacity": 0.95,
          },
        });
      }
      if (!map.getLayer(USER_LOC_DOT_INNER)) {
        map.addLayer({
          id: USER_LOC_DOT_INNER, type: "circle", source: USER_LOC_SRC,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 10, 6.5, 16, 9],
            "circle-color": "#2563eb", "circle-opacity": 1,
          },
        });
      }

      // Initial fit
      try { map.fitBounds(bboxToBounds(props.bbox), { padding: 60, duration: 0 }); } catch {}
    });

    // Accuracy ring radius on zoom
    map.on("zoom", () => {
      if (accuracyAnimFrame.current) cancelAnimationFrame(accuracyAnimFrame.current);
      accuracyAnimFrame.current = requestAnimationFrame(() => {
        if (!map.getLayer(USER_LOC_ACCURACY)) return;
        const pos = props.userPosition;
        if (!pos) return;
        map.setPaintProperty(USER_LOC_ACCURACY, "circle-radius", accuracyToPixels(pos.accuracy, pos.lat, map.getZoom()));
      });
    });

    return () => {
      if (accuracyAnimFrame.current) cancelAnimationFrame(accuracyAnimFrame.current);
      try { popupRef.current?.remove(); } catch {}
      try { map.remove(); } catch {}
      try { if (protocolRef.current) maplibregl.removeProtocol("pmtiles"); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Style change ───────────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    (async () => {
      try {
        const res = await fetch(assetsApi.styleUrl(props.styleId));
        const styleJson = await res.json();
        map.setStyle(rewriteStyleForPMTiles(styleJson, origin), { diff: false });
      } catch (e) { console.error("[TripMap] style load failed", e); }
    })();
  }, [props.styleId]);

  /* ── Data updates ───────────────────────────────────────────────────── */
  useEffect(() => { const s: any = mapRef.current?.getSource(ROUTE_SRC); s?.setData?.(routeFC); }, [routeFC]);
  useEffect(() => { const s: any = mapRef.current?.getSource(STOPS_SRC); s?.setData?.(stopsFC); }, [stopsFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(STOP_FOCUS_LAYER)) map.setFilter(STOP_FOCUS_LAYER, ["==", ["get", "id"], props.focusedStopId ?? ""]);
  }, [props.focusedStopId]);

  useEffect(() => { const s: any = mapRef.current?.getSource(SUG_SRC); s?.setData?.(sugFC); }, [sugFC]);

  /* ── Traffic / Hazard data updates ──────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const s1: any = map.getSource(TRAFFIC_POINT_SRC); s1?.setData?.(trafficPtFC);
    const s2: any = map.getSource(TRAFFIC_LINE_SRC); s2?.setData?.(trafficLineFC);
    const s3: any = map.getSource(TRAFFIC_POLY_SRC); s3?.setData?.(trafficPolyFC);
  }, [trafficPtFC, trafficLineFC, trafficPolyFC]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const s1: any = map.getSource(HAZARD_POINT_SRC); s1?.setData?.(hazardPtFC);
    const s2: any = map.getSource(HAZARD_POLY_SRC); s2?.setData?.(hazardPolyFC);
  }, [hazardPtFC, hazardPolyFC]);

  /* ── User location updates ──────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const locSrc: any = map.getSource(USER_LOC_SRC); if (locSrc?.setData) locSrc.setData(userLocFC);
    const headSrc: any = map.getSource(USER_LOC_HEADING_SRC); if (headSrc?.setData) headSrc.setData(headingFC);
    const pos = props.userPosition;
    if (pos && map.getLayer(USER_LOC_ACCURACY)) {
      map.setPaintProperty(USER_LOC_ACCURACY, "circle-radius", accuracyToPixels(pos.accuracy, pos.lat, map.getZoom()));
    }
  }, [userLocFC, headingFC, props.userPosition]);

  /* ── Focus stop → ease ──────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const id = props.focusedStopId ?? null; if (!id) return;
    const s = (props.stops ?? []).find((x) => String(x.id) === String(id));
    if (s) easeToCoord(map, [s.lng, s.lat], { zoom: Math.max(map.getZoom(), 12), duration: 420 });
  }, [props.focusedStopId, props.stops]);

  /* ── Focus suggestion → zoom/focus ──────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const id = props.focusedSuggestionId ?? null; if (!id) return;
    const p = (props.suggestions ?? []).find((x) => String(x.id) === String(id));
    if (p) { easeToCoord(map, [p.lng, p.lat], { zoom: Math.max(map.getZoom(), 13), duration: 420 }); return; }
    // Fallback: query source
    try {
      const feats = map.querySourceFeatures(SUG_SRC);
      for (const f of feats as any[]) {
        if (f?.properties?.id && String(f.properties.id) === id) {
          const coords = (f.geometry as any)?.coordinates;
          if (Array.isArray(coords) && coords.length === 2) { easeToCoord(map, [Number(coords[0]), Number(coords[1])], { zoom: Math.max(map.getZoom(), 13), duration: 420 }); break; }
        }
      }
    } catch {}
  }, [props.focusedSuggestionId, props.suggestions]);

  /* ── External focus coord → zoom to it ───────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (!props.focusCoord) return;
    const { lat, lng, zoom } = props.focusCoord;
    easeToCoord(map, [lng, lat], { zoom: zoom ?? 13, duration: 500 });
  }, [props.focusCoord]);

  /* ── Bbox change → refit ────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    try { map.fitBounds(bboxToBounds(props.bbox), { padding: 60, duration: 250 }); } catch {}
  }, [props.bbox.minLat, props.bbox.minLng, props.bbox.maxLat, props.bbox.maxLng]);

  return (
    <div className="trip-map-fullscreen">
      <div ref={containerRef} className="trip-map-inner" />
      <style>{`
        .trip-map-popup .maplibregl-popup-content {
          border-radius: 16px;
          padding: 14px 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15);
          background: var(--roam-surface);
          color: var(--roam-text);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .trip-map-popup .maplibregl-popup-close-button {
          font-size: 18px;
          font-weight: 900;
          color: var(--roam-text-muted);
          padding: 4px 8px;
          border-radius: 8px;
        }
        .trip-map-popup .maplibregl-popup-close-button:hover {
          background: var(--roam-surface-hover);
          color: var(--roam-text);
        }
        .trip-map-popup .maplibregl-popup-tip {
          border-top-color: var(--roam-surface);
        }
      `}</style>
    </div>
  );
}