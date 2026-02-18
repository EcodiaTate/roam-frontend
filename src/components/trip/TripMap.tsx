// src/components/trip/TripMap.tsx
"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import { rewriteStyleForLocalServer, isFullyOfflineCapable } from "@/lib/offline/basemapManager";

import maplibregl, { type Map as MLMap, type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";

import type { BBox4 } from "@/lib/types/geo";
import type { TripStop } from "@/lib/types/trip";
import type { PlaceItem, PlaceCategory } from "@/lib/types/places";
import type { TrafficOverlay, HazardOverlay, TrafficEvent, HazardEvent } from "@/lib/types/navigation";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { FuelStation, FuelTrackingState } from "@/lib/types/fuel";

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

  // Alert highlight — pulses the marker in-place without moving the camera
  highlightedAlertId?: string | null;

  fuelStations?: FuelStation[] | null;
  fuelTracking?: FuelTrackingState | null;

   // ── Active navigation mode ──
   /** When true, map is in heading-up tracking mode. Disables bbox refit. */
   navigationMode?: boolean;
   /** Ref that TripMap populates with the MapLibre instance for external control */
   mapInstanceRef?: React.MutableRefObject<import("maplibre-gl").Map | null>;
 };

/* ── Layer / source IDs ─────────────────────────────────────────────── */

const ROUTE_SRC = "roam-route-src";
const ROUTE_GLOW = "roam-route-glow";
const ROUTE_CASING = "roam-route-casing";
const ROUTE_LINE = "roam-route-line";

const STOPS_SRC = "roam-stops-src";
const STOPS_SHADOW = "roam-stops-shadow";
const STOPS_OUTER = "roam-stops-outer";
const STOPS_INNER = "roam-stops-inner";
const STOP_PULSE = "roam-stop-pulse";
const STOP_ICON_LAYER = "roam-stop-icon";
const STOP_LABELS = "roam-stop-labels";
const STOP_FOCUS_RING = "roam-stop-focus-ring";

const SUG_SRC = "roam-suggestions-src";
const SUG_CLUSTER_CIRCLE = "roam-sug-cluster-circle";
const SUG_CLUSTER_COUNT = "roam-sug-cluster-count";
const SUG_UNCLUSTERED = "roam-sug-unclustered";
const SUG_ICON_LAYER = "roam-sug-icon";
const SUG_LABEL_LAYER = "roam-sug-label";

const TRAFFIC_POINT_SRC = "roam-traffic-pt-src";
const TRAFFIC_LINE_SRC = "roam-traffic-line-src";
const TRAFFIC_POLY_SRC = "roam-traffic-poly-src";
const TRAFFIC_POLY_LAYER = "roam-traffic-poly";
const TRAFFIC_LINE_CASING = "roam-traffic-line-casing";
const TRAFFIC_LINE_LAYER = "roam-traffic-line";
const TRAFFIC_PULSE_LAYER = "roam-traffic-pulse";
const TRAFFIC_POINT_LAYER = "roam-traffic-pt";

const HAZARD_POINT_SRC = "roam-hazard-pt-src";
const HAZARD_POLY_SRC = "roam-hazard-poly-src";
const HAZARD_POLY_LAYER = "roam-hazard-poly";
const HAZARD_POLY_OUTLINE = "roam-hazard-poly-outline";
const HAZARD_ICON_LAYER = "roam-hazard-icon";

const ALERT_HIGHLIGHT_SRC = "roam-alert-highlight-src";
const ALERT_HIGHLIGHT_RING = "roam-alert-highlight-ring";
const ALERT_HIGHLIGHT_PING = "roam-alert-highlight-ping";

const USER_LOC_SRC = "roam-user-loc-src";
const USER_LOC_ACCURACY = "roam-user-loc-accuracy";
const USER_LOC_DOT_OUTER = "roam-user-loc-dot-outer";
const USER_LOC_DOT_INNER = "roam-user-loc-dot-inner";
const USER_LOC_HEADING_SRC = "roam-user-heading-src";
const USER_LOC_HEADING = "roam-user-loc-heading";

const FUEL_SRC = "roam-fuel-src";
const FUEL_CIRCLE_LAYER = "roam-fuel-circle";
const FUEL_ICON_LAYER = "roam-fuel-icon";
const FUEL_LABEL_LAYER = "roam-fuel-label";

/* ══════════════════════════════════════════════════════════════════════
   SVG Icon System — clean vector icons, no emojis
   ══════════════════════════════════════════════════════════════════════ */

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Creates a clean, professional map marker SVG with a vector icon path.
 * All icons are drawn inside a filled circle with a subtle border.
 */
function makeIconSVG(pathD: string, bgColor: string, sizePx: number, iconColor: string = "#fff"): string {
  const r = sizePx / 2;
  // Icon is drawn in a 24x24 viewbox, scaled and centered within the circle
  const iconScale = (sizePx * 0.38) / 24;
  const iconOff = (sizePx - 24 * iconScale) / 2;
  return `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="ds" x="-20%" y="-10%" width="140%" height="150%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.25"/></filter></defs>
    <circle cx="${r}" cy="${r}" r="${r - 1.5}" fill="${bgColor}" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" filter="url(#ds)"/>
    <g transform="translate(${iconOff},${iconOff}) scale(${iconScale.toFixed(3)})">
      <path d="${pathD}" fill="${iconColor}" fill-rule="evenodd"/>
    </g>
  </svg>`;
}

/* ── Icon path data (24x24 viewBox) — clean Lucide-style strokes ──── */

const ICON_PATHS = {
  // ── Essential services ──
  fuel: "M6 2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-5h1a3 3 0 0 0 3-3V6.5l1.3-1.3a1 1 0 0 0-1.4-1.4L16.6 5.1A3 3 0 0 0 14 4h-1V3a1 1 0 1 0-2 0v1H8V3a1 1 0 1 0-2 0v1Zm6 2H6v6h6V4Zm2 6a1 1 0 0 1 1-1h1v1a1 1 0 0 1-1 1h-1v-1Z",
  hospital: "M8 2a1 1 0 0 1 1 1v5h6V3a1 1 0 1 1 2 0v18a1 1 0 1 1-2 0v-5H9v5a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm1 8v4h6v-4H9Z",
  cross: "M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8V2Z",
  wrench:
    "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6-1.4 1.4-1.6-1.6a1 1 0 0 0-1.4 0l-5 5A3.8 3.8 0 0 0 2 18.5 3.5 3.5 0 0 0 5.5 22a3.8 3.8 0 0 0 3.4-4.9l5-5a1 1 0 0 0 0-1.4l-1.6-1.6 1.4-1.4 1.6 1.6a1 1 0 0 0 1.4 0l2-2A5 5 0 0 0 22 5.5V3l-2 2h-2V3l-2 2a1 1 0 0 0 0 1.4Z",
  droplet: "M12 2.7 6.3 10A7 7 0 0 0 5 14a7 7 0 1 0 14 0 7 7 0 0 0-1.3-4L12 2.7Z",
  pill: "M10.5 1.5a4.95 4.95 0 0 0-7 7l12 12a4.95 4.95 0 0 0 7-7l-12-12ZM7 7l5 5",

  // ── Accommodation ──
  tent: "M3 21h18L12 3 3 21Zm9-14.7 5.7 12.7H6.3L12 6.3Z",
  bed: "M2 12V5a1 1 0 0 1 1-1h5a2 2 0 0 1 2 2v2h10a2 2 0 0 1 2 2v2M2 12v5h20v-5M2 12h20M7 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z",
  building:
    "M3 21V3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v18M3 21h18M12 7h4a1 1 0 0 1 1 1v13M7 5h2M7 9h2M7 13h2M7 17h2M15 11h2M15 15h2",

  // ── Food & drink ──
  cart: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6Zm0 2h12l2 2H4l2-2Zm2 6a4 4 0 1 0 8 0H8Z",
  coffee: "M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8ZM6 2v2M10 2v2M14 2v2",
  utensils: "M3 2v6a3 3 0 0 0 3 3h1v11h2V11h1a3 3 0 0 0 3-3V2M3 2v4h2V2M9 2v4h2V2M17 2c-2.5 0-4 1.5-4 4v6h4V2Zm0 10v10",
  beer: "M17 11h1a3 3 0 0 1 0 6h-1M2 6l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13H2ZM6 2v4M10 2v4",

  // ── Nature & outdoors ──
  tree: "M12 2 4 14h5v8h6v-8h5L12 2Z",
  mountain: "M2 20 8.5 8l3 4.5L15 8l7 12H2Zm6.5-12L12 2l3.5 6",
  wave: "M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0M2 17c2-3 4-3 6 0s4 3 6 0 4-3 6 0",
  sun_wave: "M12 2v2M4.9 4.9l1.4 1.4M2 12h2M4.9 19.1l1.4-1.4M20 12h2M18.7 6.3l1.4-1.4M12 6a6 6 0 0 1 6 6",
  swim: "M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6-0M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 12l6-6 6 6",
  boot: "M4 16v4h12.5a3.5 3.5 0 0 0 3.5-3.5V14l-5-2v-2a2 2 0 0 0-2-2h-1l-1-4H9L7 8v5l-3 3Z",
  basket: "M4 10l-2 8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2l-2-8H4ZM8 2l-4 8M16 2l4 8M12 14v4M8 14v4M16 14v4",
  eye: "M2.1 12A10 10 0 0 1 12 5a10 10 0 0 1 9.9 7A10 10 0 0 1 12 19a10 10 0 0 1-9.9-7ZM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",

  // ── Sightseeing ──
  columns: "M4 3v18M10 3v18M16 3v18M2 3h20M2 21h20M2 6h20M2 18h20",
  palette:
    "M12 2a10 10 0 0 0-1 20 2 2 0 0 0 2-2v-.5a2 2 0 0 1 2-2h1.5A2 2 0 0 0 18.5 15.5 10 10 0 0 0 12 2ZM8.5 8a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM16 9a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z",
  paw: "M12 13c-1.5 2.5-4 4-4 6a4 4 0 0 0 8 0c0-2-2.5-3.5-4-6ZM5 8a2 2 0 1 1 4 0 2 2 0 0 1-4 0ZM15 8a2 2 0 1 1 4 0 2 2 0 0 1-4 0ZM3 14a2 2 0 1 1 4 0 2 2 0 0 1-4 0ZM17 14a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z",
  star: "M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 7L12 17.8 5.8 21.2 7 14.2 2 9.3l6.9-1L12 2Z",
  landmark: "M6 22V12M18 22V12M2 22h20M12 2l10 10H2L12 2Z",

  // ── Utilities ──
  town:
    "M3 21V8l4-4 4 4v13M11 21V12h5l4 4v5M7 9v.01M7 13v.01M7 17v.01M15 17v.01",
  wc: "M5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 6v4m0 0-2 5m2-5 2 5M19 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0 6v1m0 0c-1.5 0-2.5 2.5-2.5 4v4h5v-4c0-1.5-1-4-2.5-4Z",
  pin: "M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  map_marker: "M9 11l3 3L22 4M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9",

  // ── Traffic overlay ──
  x_circle: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.5 6.5L12 12l-3.5 3.5M15.5 15.5 12 12 8.5 8.5",
  flood_wave: "M2 6c2-3 4-3 6 0s4 3 6 0 4-3 6 0M2 11c2-3 4-3 6 0s4 3 6 0 4-3 6 0M2 16c2-3 4-3 6 0s4 3 6 0 4-3 6 0",
  car: "M7 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 13l1.5-5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1L19 13M3 13h18v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4Z",
  cone: "M9.5 21H4l4-14h8l4 14h-5.5M8 7l1-5h6l1 5M8 11h8M9 15h6",
  triangle_alert: "M12 3 2 21h20L12 3Zm0 7v4m0 3v.01",
  siren:
    "M12 2v2M4.9 4.9l1.4 1.4M19.1 4.9l-1.4 1.4M2 12h2M20 12h2M7 17.5A7 7 0 0 1 12 5a7 7 0 0 1 5 12.5M7 17.5v2.5h10v-2.5",
  question: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 14v.01M12 12a2 2 0 1 0-2-2",

  // ── Hazard overlay ──
  cyclone:
    "M12 12a3 3 0 1 0 0 .01M21 12c-1 5-6 8-9 8-5 0-9-4-9-9a9 9 0 0 1 15-6.7M3 12c1-5 6-8 9-8 5 0 9 4 9 9a9 9 0 0 1-15 6.7",
  lightning: "M13 2 3 14h8l-1 8 10-12h-8l1-8Z",
  flame: "M12 2c0 4-4 6-4 10a4 4 0 0 0 4 4 4 4 0 0 0 4-4c0-4-4-6-4-10Zm0 12a2 2 0 0 1-2-2c0-1.3 2-2.5 2-4 0 1.5 2 2.7 2 4a2 2 0 0 1-2 2Z",
  wind: "M17.7 7.7A2.5 2.5 0 1 0 15 4.5H2M9.6 4.6A2 2 0 1 1 11 2H2M12 19a3 3 0 1 0 3-3H2",
  thermometer: "M14 14.8A4 4 0 0 1 8 18a4 4 0 0 1 2-6.8V4a2 2 0 1 1 4 0v10.8ZM12 8H10",
  anchor: "M12 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3Zm0 6v14M5 12H2a10 10 0 0 0 20 0h-3",

  // ── Stop type icons ──
  flag_start: "M4 2v20M4 2l12 7-12 7",
  flag_end: "M4 2v20M4 2h14l-4 5 4 5H4",
  circle_dot: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z",
  diamond: "M12 2l8 10-8 10-8-10L12 2Z",
};

/* ── Category → icon + color config ──────────────────────────────────── */

type CatConfig = { icon: keyof typeof ICON_PATHS; color: string; size: "lg" | "md" | "sm" };

const CATEGORY_CONFIG: Record<string, CatConfig> = {
  // ── Essentials & safety ─────────────────────────────────────────────
  fuel: { icon: "fuel", color: "#d97706", size: "lg" },
  ev_charging: { icon: "lightning", color: "#2563eb", size: "lg" },
  rest_area: { icon: "car", color: "#6366f1", size: "md" },
  toilet: { icon: "wc", color: "#8b5cf6", size: "sm" },
  water: { icon: "droplet", color: "#0284c7", size: "lg" },
  dump_point: { icon: "droplet", color: "#0d9488", size: "sm" },
  mechanic: { icon: "wrench", color: "#e11d48", size: "lg" },
  hospital: { icon: "cross", color: "#dc2626", size: "lg" },
  pharmacy: { icon: "pill", color: "#db2777", size: "lg" },
  // ── Supplies ────────────────────────────────────────────────────────
  grocery: { icon: "cart", color: "#059669", size: "md" },
  town: { icon: "town", color: "#a16207", size: "sm" },
  atm: { icon: "pin", color: "#0891b2", size: "sm" },
  laundromat: { icon: "pin", color: "#64748b", size: "sm" },
  // ── Food & drink ────────────────────────────────────────────────────
  bakery: { icon: "star", color: "#ea580c", size: "md" },
  cafe: { icon: "coffee", color: "#9333ea", size: "md" },
  restaurant: { icon: "utensils", color: "#ea580c", size: "md" },
  fast_food: { icon: "utensils", color: "#ca8a04", size: "sm" },
  pub: { icon: "beer", color: "#d97706", size: "sm" },
  bar: { icon: "beer", color: "#c026d3", size: "sm" },
  // ── Accommodation ───────────────────────────────────────────────────
  camp: { icon: "tent", color: "#16a34a", size: "lg" },
  hotel: { icon: "building", color: "#7c3aed", size: "md" },
  motel: { icon: "bed", color: "#7c3aed", size: "md" },
  hostel: { icon: "bed", color: "#7c3aed", size: "md" },
  // ── Nature & outdoors ───────────────────────────────────────────────
  viewpoint: { icon: "eye", color: "#7c3aed", size: "md" },
  waterfall: { icon: "wave", color: "#0891b2", size: "md" },
  swimming_hole: { icon: "swim", color: "#0891b2", size: "md" },
  beach: { icon: "sun_wave", color: "#2563eb", size: "md" },
  national_park: { icon: "mountain", color: "#15803d", size: "lg" },
  hiking: { icon: "boot", color: "#65a30d", size: "md" },
  picnic: { icon: "basket", color: "#84cc16", size: "sm" },
  hot_spring: { icon: "thermometer", color: "#ea580c", size: "md" },
  // ── Family & recreation ─────────────────────────────────────────────
  playground: { icon: "paw", color: "#f59e0b", size: "sm" },
  pool: { icon: "swim", color: "#0ea5e9", size: "md" },
  zoo: { icon: "paw", color: "#22c55e", size: "md" },
  theme_park: { icon: "star", color: "#ec4899", size: "md" },
  // ── Culture & sightseeing ───────────────────────────────────────────
  visitor_info: { icon: "pin", color: "#4f46e5", size: "sm" },
  museum: { icon: "columns", color: "#8b5cf6", size: "md" },
  gallery: { icon: "palette", color: "#a855f7", size: "sm" },
  heritage: { icon: "landmark", color: "#b45309", size: "md" },
  winery: { icon: "beer", color: "#9f1239", size: "md" },
  brewery: { icon: "beer", color: "#b45309", size: "md" },
  attraction: { icon: "star", color: "#eab308", size: "md" },
  market: { icon: "cart", color: "#65a30d", size: "md" },
  park: { icon: "tree", color: "#22c55e", size: "md" },
  // ── Geocoding (Mapbox) ──────────────────────────────────────────────
  address: { icon: "pin", color: "#64748b", size: "sm" },
  place: { icon: "pin", color: "#64748b", size: "sm" },
  region: { icon: "map_marker", color: "#64748b", size: "sm" },
};

const DEFAULT_CAT_CONFIG: CatConfig = { icon: "pin", color: "#64748b", size: "sm" };

function getCatConfig(cat: string): CatConfig {
  return CATEGORY_CONFIG[cat] ?? DEFAULT_CAT_CONFIG;
}

/* ── Traffic/hazard overlay icon configs ─────────────────────────────── */

const TRAFFIC_ICON_CFG: Record<string, { icon: keyof typeof ICON_PATHS; color: string }> = {
  closure: { icon: "x_circle", color: "#ef4444" },
  flooding: { icon: "flood_wave", color: "#3b82f6" },
  congestion: { icon: "car", color: "#f59e0b" },
  roadworks: { icon: "cone", color: "#f97316" },
  hazard: { icon: "triangle_alert", color: "#eab308" },
  incident: { icon: "siren", color: "#ef4444" },
  unknown: { icon: "question", color: "#64748b" },
};

const HAZARD_ICON_CFG: Record<string, { icon: keyof typeof ICON_PATHS; color: string }> = {
  flood: { icon: "flood_wave", color: "#3b82f6" },
  cyclone: { icon: "cyclone", color: "#7c3aed" },
  storm: { icon: "lightning", color: "#6366f1" },
  fire: { icon: "flame", color: "#ef4444" },
  wind: { icon: "wind", color: "#64748b" },
  heat: { icon: "thermometer", color: "#ea580c" },
  marine: { icon: "anchor", color: "#0ea5e9" },
  weather_warning: { icon: "lightning", color: "#eab308" },
  unknown: { icon: "triangle_alert", color: "#64748b" },
};

/* ── Load all icon images into the map ───────────────────────────────── */

const SIZE_PX: Record<CatConfig["size"], number> = { lg: 36, md: 30, sm: 24 };

function loadCategoryIcons(map: MLMap): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [cat, cfg] of Object.entries(CATEGORY_CONFIG)) {
    const imgId = `roam-cat-${cat}`;
    if (map.hasImage(imgId)) continue;
    const px = SIZE_PX[cfg.size];
    const pathD = ICON_PATHS[cfg.icon] ?? ICON_PATHS.pin;
    const svg = makeIconSVG(pathD, cfg.color, px);
    promises.push(loadSVGImage(map, imgId, svg, px));
  }
  // Default
  if (!map.hasImage("roam-cat-default")) {
    const svg = makeIconSVG(ICON_PATHS.pin, "#64748b", 24);
    promises.push(loadSVGImage(map, "roam-cat-default", svg, 24));
  }
  return Promise.all(promises).then(() => {});
}

function loadOverlayIcons(map: MLMap): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [k, v] of Object.entries(TRAFFIC_ICON_CFG)) {
    const id = `roam-traffic-${k}`;
    if (map.hasImage(id)) continue;
    const pathD = ICON_PATHS[v.icon] ?? ICON_PATHS.triangle_alert;
    promises.push(loadSVGImage(map, id, makeIconSVG(pathD, v.color, 32), 32));
  }
  for (const [k, v] of Object.entries(HAZARD_ICON_CFG)) {
    const id = `roam-hazard-${k}`;
    if (map.hasImage(id)) continue;
    const pathD = ICON_PATHS[v.icon] ?? ICON_PATHS.triangle_alert;
    promises.push(loadSVGImage(map, id, makeIconSVG(pathD, v.color, 32), 32));
  }
  return Promise.all(promises).then(() => {});
}

function loadStopIcons(map: MLMap): Promise<void> {
  const defs: Array<{ id: string; icon: keyof typeof ICON_PATHS; color: string; px: number }> = [
    { id: "roam-stop-start", icon: "flag_start", color: "#16a34a", px: 40 },
    { id: "roam-stop-end", icon: "flag_end", color: "#dc2626", px: 40 },
    { id: "roam-stop-via", icon: "diamond", color: "#9333ea", px: 34 },
    { id: "roam-stop-poi", icon: "circle_dot", color: "#2563eb", px: 34 },
  ];
  const promises: Promise<void>[] = [];
  for (const d of defs) {
    if (map.hasImage(d.id)) continue;
    const pathD = ICON_PATHS[d.icon];
    promises.push(loadSVGImage(map, d.id, makeIconSVG(pathD, d.color, d.px), d.px));
  }
  return Promise.all(promises).then(() => {});
}

function loadSVGImage(map: MLMap, id: string, svg: string, px: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image(px, px);
    img.onload = () => {
      if (!map.hasImage(id)) map.addImage(id, img, { sdf: false });
      resolve();
    };
    img.onerror = () => resolve();
    img.src = svgToDataUrl(svg);
  });
}

/* ── Heading arrow SVG ───────────────────────────────────────────────── */

const HEADING_ARROW_ID = "roam-heading-arrow";
const HEADING_ARROW_SVG = `<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="hg" x1="24" y1="4" x2="24" y2="28" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.85"/>
    <stop offset="100%" stop-color="#2563eb" stop-opacity="0.15"/>
  </linearGradient></defs>
  <path d="M24 4 L36 28 L24 22 L12 28 Z" fill="url(#hg)" stroke="#2563eb" stroke-width="1" stroke-opacity="0.4"/>
</svg>`;

function loadHeadingArrow(map: MLMap): Promise<void> {
  return loadSVGImage(map, HEADING_ARROW_ID, HEADING_ARROW_SVG, 48);
}

function loadFuelIcons(map: MLMap): Promise<void> {
  const defs = [
    { id: "roam-fuel-ok", color: "#22c55e" },
    { id: "roam-fuel-warn", color: "#f59e0b" },
    { id: "roam-fuel-critical", color: "#ef4444" },
  ];
  const promises: Promise<void>[] = [];
  for (const d of defs) {
    if (map.hasImage(d.id)) continue;
    const svg = makeIconSVG(ICON_PATHS.fuel, d.color, 38, "#fff");
    promises.push(loadSVGImage(map, d.id, svg, 38));
  }
  return Promise.all(promises).then(() => {});
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function bboxToBounds(b: BBox4): LngLatBoundsLike {
  return [
    [b.minLng, b.minLat],
    [b.maxLng, b.maxLat],
  ];
}

function decodePolyline6(poly: string): Array<[number, number]> {
  let index = 0,
    lat = 0,
    lng = 0;
  const coordinates: Array<[number, number]> = [];
  const factor = 1e6;
  while (index < poly.length) {
    let result = 0,
      shift = 0,
      b: number;
    do {
      b = poly.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      b = poly.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lng / factor, lat / factor]);
  }
  return coordinates;
}

function routeGeoJSON(polyline6: string) {
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: decodePolyline6(polyline6) } }],
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
        iconId: `roam-stop-${s.type ?? "poi"}`,
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
      .filter((ev) => ev.geometry && ev.geometry.type === "Point" && Array.isArray(ev.geometry.coordinates))
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
        properties: { id: ev.id, type: ev.type ?? "unknown", severity: ev.severity ?? "unknown", headline: ev.headline },
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
        properties: { id: ev.id, type: ev.type ?? "unknown", severity: ev.severity ?? "unknown", headline: ev.headline },
        geometry: ev.geometry,
      })),
  } as any;
}

function hazardPointsGeoJSON(overlay: HazardOverlay | null) {
  if (!overlay) return { type: "FeatureCollection", features: [] } as any;
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
            geometry: { type: "Point", coordinates: [(ev.bbox[0] + ev.bbox[2]) / 2, (ev.bbox[1] + ev.bbox[3]) / 2] },
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
        properties: { id: ev.id, kind: ev.kind ?? "unknown", severity: ev.severity ?? "unknown", title: ev.title },
        geometry: ev.geometry,
      })),
  } as any;
}

/* ── User location GeoJSON ───────────────────────────────────────────── */

function userLocGeoJSON(pos: RoamPosition | null | undefined) {
  if (!pos) return { type: "FeatureCollection", features: [] } as any;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { accuracy: pos.accuracy, heading: pos.heading, speed: pos.speed },
        geometry: { type: "Point", coordinates: [pos.lng, pos.lat] },
      },
    ],
  } as any;
}

function headingConeGeoJSON(pos: RoamPosition | null | undefined) {
  if (!pos || pos.heading == null || pos.speed == null || pos.speed < 0.5) return { type: "FeatureCollection", features: [] } as any;
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { heading: pos.heading }, geometry: { type: "Point", coordinates: [pos.lng, pos.lat] } }],
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
        tiles: src.tiles.map((t: string) => (typeof t === "string" && t.startsWith("pmtiles://") ? normalizePmtilesUrl(t, origin) : t)),
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
  if (!src) {
    map.addSource(id, { type: "geojson", data, ...extraOpts });
    return;
  }
  if (src?.setData) src.setData(data);
}

function easeToCoord(map: MLMap, coord: [number, number], opts?: { zoom?: number; duration?: number }) {
  try {
    const z = opts?.zoom ?? Math.max(map.getZoom(), 13);
    map.easeTo({ center: coord, zoom: Math.min(z, 17), duration: opts?.duration ?? 450 });
  } catch {}
}

/* ── Severity color helpers ──────────────────────────────────────────── */

const TRAFFIC_SEV_COLORS: Record<string, string> = {
  major: "#ef4444",
  moderate: "#f59e0b",
  minor: "#3b82f6",
  info: "#64748b",
  unknown: "#64748b",
};
const HAZARD_SEV_COLORS: Record<string, string> = { high: "#dc2626", medium: "#ea580c", low: "#2563eb", unknown: "#64748b" };

/* ══════════════════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════════════════ */

export function TripMap(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const protocolRef = useRef<Protocol | null>(null);
  const accuracyAnimFrame = useRef<number | null>(null);

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

  const fuelFC = useMemo<GeoJSON.FeatureCollection>(() => {
    const stations = props.fuelStations;
    if (!stations || stations.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: stations.map((st) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [st.lng, st.lat] },
        properties: {
          id: st.place_id,
          name: st.name,
          km: st.km_along_route,
          snap_m: st.snap_distance_m,
          side: st.side,
          // Determine color based on what comes AFTER this station
          fuel_level: "ok", // will be overridden below
        },
      })),
    };
  }, [props.fuelStations]);

  /* ── Build popup HTML ───────────────────────────────────────────────── */

  const buildSuggestionPopupHtml = useCallback((name: string, category: string, placeId: string) => {
    const cfg = getCatConfig(category);
    return `<div style="font-family:inherit;min-width:160px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div style="width:28px;height:28px;border-radius:8px;background:${cfg.color};display:grid;place-items:center;flex-shrink:0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_PATHS[cfg.icon] ?? ICON_PATHS.pin}"/></svg>
        </div>
        <div>
          <div style="font-size:14px;font-weight:900;letter-spacing:-0.2px;color:var(--roam-text)">${escapeHtml(name)}</div>
          <div style="font-size:11px;font-weight:700;color:var(--roam-text-muted);text-transform:capitalize;margin-top:1px">${escapeHtml(category.replace("_", " "))}</div>
        </div>
      </div>
      <button data-roam-guide-place="${escapeHtml(
        placeId,
      )}" style="display:block;width:100%;margin-top:8px;padding:8px 0;border:none;border-radius:10px;cursor:pointer;font-size:12px;font-weight:950;letter-spacing:0.2px;background:var(--roam-accent,#4a6c53);color:#fff;box-shadow:0 2px 8px rgba(74,108,83,0.35);transition:opacity 0.1s" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">View in Guide</button>
    </div>`;
  }, []);

  const buildOverlayPopupHtml = useCallback((title: string, severity: string, sevColor: string, description?: string | null) => {
    return `<div style="font-family:inherit;min-width:160px;max-width:260px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:950;color:var(--roam-text);line-height:1.3">${escapeHtml(title)}</div>
          <span style="display:inline-block;margin-top:3px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px;color:${sevColor};background:color-mix(in srgb, ${sevColor} 12%, transparent);padding:2px 7px;border-radius:5px;">${escapeHtml(
            severity,
          )}</span>
        </div>
      </div>
      ${
        description
          ? `<div style="font-size:11px;font-weight:600;color:var(--roam-text-muted);line-height:1.5;margin-top:6px">${escapeHtml(
              description.slice(0, 200),
            )}${description.length > 200 ? "…" : ""}</div>`
          : ""
      }
    </div>`;
  }, []);

  /* ══════════════════════════════════════════════════════════════════════
     Init map once
     ══════════════════════════════════════════════════════════════════════ */
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
    if (props.mapInstanceRef) props.mapInstanceRef.current = map;
    // Load style
    (async () => {
      try {
        const res = await fetch(assetsApi.styleUrl(props.styleId));
        let styleJson = await res.json();

        // If the local tile server is running, rewrite ALL source/glyph/sprite
        // URLs to point to localhost. This is the offline-first path.
        if (isFullyOfflineCapable()) {
          styleJson = rewriteStyleForLocalServer(styleJson);
        }

        // Then apply the existing PMTiles URL normalization for Capacitor safety
        map.setStyle(rewriteStyleForPMTiles(styleJson, origin), { diff: false });
      } catch (e) {
        console.error("[TripMap] style load failed", e);
      }
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
        const dx = e.clientX - longPressPos.x,
          dy = e.clientY - longPressPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    });
    map.getCanvas().addEventListener("pointerup", () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
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
      await Promise.all([loadHeadingArrow(map), loadCategoryIcons(map), loadOverlayIcons(map), loadStopIcons(map), loadFuelIcons(map)]);

      /* ════════════════════════════════════════════════════════════════
         LAYER ORDER (bottom → top):
         1. Route (glow → casing → line)
         2. Traffic overlays (poly → line casing → line → pulse → icons)
         3. Hazard overlays (poly → outline → icons)
         4. Suggestions (clusters → unclustered → icons → labels)
         5. Stops (shadow → outer → inner → icons → labels → focus ring)
         6. User location (accuracy → heading → dots)
         7. Fuel stations (circle → icon → label)
         8. Alert highlight (ring → ping animation)
         ════════════════════════════════════════════════════════════════ */

      /* ── 1. Route layers — warm outback amber/gold ─────────────────── */
      addOrUpdateGeoJsonSource(map, ROUTE_SRC, routeFC);

      // Outer glow — warm amber haze
      if (!map.getLayer(ROUTE_GLOW)) {
        map.addLayer({
          id: ROUTE_GLOW,
          type: "line",
          source: ROUTE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "rgba(212,148,58,0.4)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 10, 10, 16, 14, 24],
            "line-blur": ["interpolate", ["linear"], ["zoom"], 4, 8, 14, 14],
            "line-opacity": 0.5,
          },
        });
      }

      // Dark casing — deep brown-black for contrast
      if (!map.getLayer(ROUTE_CASING)) {
        map.addLayer({
          id: ROUTE_CASING,
          type: "line",
          source: ROUTE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "rgba(45,32,18,0.7)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 5, 10, 9, 14, 13],
            "line-opacity": 0.65,
          },
        });
      }

      // Main route line — warm golden amber
      if (!map.getLayer(ROUTE_LINE)) {
        map.addLayer({
          id: ROUTE_LINE,
          type: "line",
          source: ROUTE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "rgba(218,165,72,0.95)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 3, 10, 6.5, 14, 10],
            "line-opacity": 0.95,
          },
        });
      }

      /* ── 2. Traffic overlay layers (ABOVE route) ───────────────────── */
      addOrUpdateGeoJsonSource(map, TRAFFIC_POLY_SRC, trafficPolyFC);
      addOrUpdateGeoJsonSource(map, TRAFFIC_LINE_SRC, trafficLineFC);
      addOrUpdateGeoJsonSource(map, TRAFFIC_POINT_SRC, trafficPtFC);

      if (!map.getLayer(TRAFFIC_POLY_LAYER)) {
        map.addLayer({
          id: TRAFFIC_POLY_LAYER,
          type: "fill",
          source: TRAFFIC_POLY_SRC,
          paint: {
            "fill-color": [
              "match",
              ["get", "severity"],
              "major",
              "rgba(239,68,68,0.22)",
              "moderate",
              "rgba(245,158,11,0.18)",
              "minor",
              "rgba(59,130,246,0.12)",
              "rgba(100,116,139,0.08)",
            ],
            "fill-opacity": 0.85,
          },
        });
      }

      // Traffic line casing for extra weight
      if (!map.getLayer(TRAFFIC_LINE_CASING)) {
        map.addLayer({
          id: TRAFFIC_LINE_CASING,
          type: "line",
          source: TRAFFIC_LINE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": [
              "match",
              ["get", "severity"],
              "major",
              "rgba(153,27,27,0.5)",
              "moderate",
              "rgba(146,64,14,0.4)",
              "minor",
              "rgba(30,64,175,0.3)",
              "rgba(51,65,85,0.25)",
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 6, 12, 10, 16, 16],
            "line-opacity": 0.7,
          },
        });
      }

      if (!map.getLayer(TRAFFIC_LINE_LAYER)) {
        map.addLayer({
          id: TRAFFIC_LINE_LAYER,
          type: "line",
          source: TRAFFIC_LINE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["match", ["get", "severity"], "major", "#ef4444", "moderate", "#f59e0b", "minor", "#3b82f6", "#64748b"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 4, 12, 7, 16, 12],
            "line-opacity": 0.85,
            "line-dasharray": [2, 1.5],
          },
        });
      }

      // Pulsing halo behind traffic point icons
      if (!map.getLayer(TRAFFIC_PULSE_LAYER)) {
        map.addLayer({
          id: TRAFFIC_PULSE_LAYER,
          type: "circle",
          source: TRAFFIC_POINT_SRC,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 14, 12, 20, 16, 26],
            "circle-color": [
              "match",
              ["get", "severity"],
              "major",
              "rgba(239,68,68,0.18)",
              "moderate",
              "rgba(245,158,11,0.14)",
              "rgba(100,116,139,0.08)",
            ],
            "circle-stroke-color": [
              "match",
              ["get", "severity"],
              "major",
              "rgba(239,68,68,0.35)",
              "moderate",
              "rgba(245,158,11,0.28)",
              "rgba(100,116,139,0.18)",
            ],
            "circle-stroke-width": 2,
            "circle-opacity": 0.9,
          },
        });
      }

      if (!map.getLayer(TRAFFIC_POINT_LAYER)) {
        map.addLayer({
          id: TRAFFIC_POINT_LAYER,
          type: "symbol",
          source: TRAFFIC_POINT_SRC,
          layout: {
            "icon-image": ["get", "iconId"],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.7, 12, 0.9, 16, 1.1],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": 1 },
        });
      }

      // Traffic click → popup
      map.on("click", TRAFFIC_POINT_LAYER, (e: any) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const sevColor = TRAFFIC_SEV_COLORS[p?.severity ?? "unknown"] ?? "#64748b";
        const html = buildOverlayPopupHtml(p?.headline ?? "Traffic Event", p?.severity ?? "unknown", sevColor);
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup" })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
        } catch {}
        onTrafficPressRef.current?.(p?.id);
      });

      /* ── 3. Hazard overlay layers ──────────────────────────────────── */
      addOrUpdateGeoJsonSource(map, HAZARD_POLY_SRC, hazardPolyFC);
      addOrUpdateGeoJsonSource(map, HAZARD_POINT_SRC, hazardPtFC);

      if (!map.getLayer(HAZARD_POLY_LAYER)) {
        map.addLayer({
          id: HAZARD_POLY_LAYER,
          type: "fill",
          source: HAZARD_POLY_SRC,
          paint: {
            "fill-color": [
              "match",
              ["get", "kind"],
              "flood",    "rgba(59,130,246,0.20)",
              "fire",     "rgba(239,68,68,0.20)",
              "cyclone",  "rgba(124,58,237,0.18)",
              "storm",    "rgba(99,102,241,0.16)",
              "heat",     "rgba(234,88,12,0.16)",
              "wind",     "rgba(100,116,139,0.14)",
              "marine",   "rgba(14,165,233,0.14)",
              // Fallback to severity-based coloring for unknown kinds
              [
                "match",
                ["get", "severity"],
                "high",   "rgba(220,38,38,0.18)",
                "medium", "rgba(234,88,12,0.14)",
                "low",    "rgba(37,99,235,0.10)",
                "rgba(100,116,139,0.06)",
              ],
            ],
            "fill-opacity": 0.75,
          },
        });
      }
      if (!map.getLayer(HAZARD_POLY_OUTLINE)) {
        map.addLayer({
          id: HAZARD_POLY_OUTLINE,
          type: "line",
          source: HAZARD_POLY_SRC,
          paint: {
            "line-color": [
              "match",
              ["get", "kind"],
              "flood",    "rgba(59,130,246,0.55)",
              "fire",     "rgba(239,68,68,0.60)",
              "cyclone",  "rgba(124,58,237,0.55)",
              "storm",    "rgba(99,102,241,0.50)",
              "heat",     "rgba(234,88,12,0.50)",
              "wind",     "rgba(100,116,139,0.45)",
              "marine",   "rgba(14,165,233,0.45)",
              [
                "match",
                ["get", "severity"],
                "high",   "rgba(220,38,38,0.6)",
                "medium", "rgba(234,88,12,0.5)",
                "low",    "rgba(37,99,235,0.4)",
                "rgba(100,116,139,0.3)",
              ],
            ],
            "line-width": 2.5,
            "line-dasharray": [3, 2],
            "line-opacity": 0.85,
          },
        });
      }

      if (!map.getLayer(HAZARD_ICON_LAYER)) {
        map.addLayer({
          id: HAZARD_ICON_LAYER,
          type: "symbol",
          source: HAZARD_POINT_SRC,
          layout: {
            "icon-image": ["get", "iconId"],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.7, 12, 0.9, 16, 1.1],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": 1 },
        });
      }

      // Hazard click → popup
      map.on("click", HAZARD_ICON_LAYER, (e: any) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const sevColor = HAZARD_SEV_COLORS[p?.severity ?? "unknown"] ?? "#64748b";
        const html = buildOverlayPopupHtml(p?.title ?? "Hazard", p?.severity ?? "unknown", sevColor);
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup" })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
        } catch {}
        onHazardPressRef.current?.(p?.id);
      });

      // Traffic line click → popup
      map.on("click", TRAFFIC_LINE_LAYER, (e: any) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const sevColor = TRAFFIC_SEV_COLORS[p?.severity ?? "unknown"] ?? "#64748b";
        const html = buildOverlayPopupHtml(p?.headline ?? "Traffic Event", p?.severity ?? "unknown", sevColor);
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup" })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
        } catch {}
        onTrafficPressRef.current?.(p?.id);
      });

      // Traffic polygon click → popup
      map.on("click", TRAFFIC_POLY_LAYER, (e: any) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const sevColor = TRAFFIC_SEV_COLORS[p?.severity ?? "unknown"] ?? "#64748b";
        const html = buildOverlayPopupHtml(p?.headline ?? "Traffic Event", p?.severity ?? "unknown", sevColor);
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup" })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
        } catch {}
        onTrafficPressRef.current?.(p?.id);
      });

      // Hazard polygon click → popup
      map.on("click", HAZARD_POLY_LAYER, (e: any) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const sevColor = HAZARD_SEV_COLORS[p?.severity ?? "unknown"] ?? "#64748b";
        const html = buildOverlayPopupHtml(p?.title ?? "Hazard Zone", p?.severity ?? "unknown", sevColor, null);
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup" })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
        } catch {}
        onHazardPressRef.current?.(p?.id);
      });

      map.on("mouseenter", TRAFFIC_POINT_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", TRAFFIC_POINT_LAYER, () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", TRAFFIC_LINE_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", TRAFFIC_LINE_LAYER, () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", TRAFFIC_POLY_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", TRAFFIC_POLY_LAYER, () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", HAZARD_ICON_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", HAZARD_ICON_LAYER, () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", HAZARD_POLY_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", HAZARD_POLY_LAYER, () => (map.getCanvas().style.cursor = ""));
      /* ── 4. Suggestions (clustered + icon layer) ───────────────────── */
      addOrUpdateGeoJsonSource(map, SUG_SRC, sugFC, { cluster: true, clusterMaxZoom: 13, clusterRadius: 50 });

      if (!map.getLayer(SUG_CLUSTER_CIRCLE)) {
        map.addLayer({
          id: SUG_CLUSTER_CIRCLE,
          type: "circle",
          source: SUG_SRC,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": ["step", ["get", "point_count"], "rgba(74,108,83,0.88)", 20, "rgba(180,83,9,0.88)", 100, "rgba(184,74,57,0.88)"],
            "circle-radius": ["step", ["get", "point_count"], 16, 20, 20, 100, 26],
            "circle-stroke-color": "rgba(255,255,255,0.3)",
            "circle-stroke-width": 2,
            "circle-opacity": 0.92,
          },
        });
      }
      if (!map.getLayer(SUG_CLUSTER_COUNT)) {
        map.addLayer({
          id: SUG_CLUSTER_COUNT,
          type: "symbol",
          source: SUG_SRC,
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true },
          paint: { "text-color": "#ffffff" },
        });
      }

      if (!map.getLayer(SUG_UNCLUSTERED)) {
        map.addLayer({
          id: SUG_UNCLUSTERED,
          type: "circle",
          source: SUG_SRC,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              ["match", ["get", "sizeClass"], "lg", 6, "md", 4, 3],
              12,
              ["match", ["get", "sizeClass"], "lg", 9, "md", 7, 5],
              16,
              ["match", ["get", "sizeClass"], "lg", 12, "md", 10, 8],
            ],
            "circle-color": ["get", "color"],
            "circle-stroke-color": ["case", ["==", ["get", "id"], props.focusedSuggestionId ?? ""], "rgba(255,255,255,0.95)", "rgba(0,0,0,0.3)"],
            "circle-stroke-width": ["case", ["==", ["get", "id"], props.focusedSuggestionId ?? ""], 2.5, 1.2],
            "circle-opacity": 0.92,
          },
        });
      }

      if (!map.getLayer(SUG_ICON_LAYER)) {
        map.addLayer({
          id: SUG_ICON_LAYER,
          type: "symbol",
          source: SUG_SRC,
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
          id: SUG_LABEL_LAYER,
          type: "symbol",
          source: SUG_SRC,
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
          paint: { "text-color": "rgba(255,255,255,0.9)", "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1.2 },
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

      // Suggestion click → popup
      const handleSugClick = (e: any) => {
        const f = e?.features?.[0];
        const id = f?.properties?.id ? String(f.properties.id) : null;
        if (!id) return;
        const coords = (f.geometry as any)?.coordinates;
        if (Array.isArray(coords) && coords.length === 2) easeToCoord(map, [Number(coords[0]), Number(coords[1])], { zoom: Math.max(map.getZoom(), 13), duration: 420 });
        onSugPressRef.current?.(id);
        const html = buildSuggestionPopupHtml(f?.properties?.name ?? "", f?.properties?.category ?? "", id);
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup", maxWidth: "280px" })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
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

      /* ── 5. Stop layers — beautiful themed markers ─────────────────── */
      addOrUpdateGeoJsonSource(map, STOPS_SRC, stopsFC);

      const stopColor = ["match", ["get", "type"], "start", "#16a34a", "end", "#dc2626", "via", "#9333ea", "#2563eb"] as any;

      // Drop shadow circle (subtle, larger, behind)
      if (!map.getLayer(STOPS_SHADOW)) {
        map.addLayer({
          id: STOPS_SHADOW,
          type: "circle",
          source: STOPS_SRC,
          minzoom: 5,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 6, 10, 10, 14, 15, 17, 20],
            "circle-color": "rgba(0,0,0,0.25)",
            "circle-blur": 0.6,
            "circle-translate": [0, 2],
          },
        });
      }

      // Outer ring — white border with themed color
      if (!map.getLayer(STOPS_OUTER)) {
        map.addLayer({
          id: STOPS_OUTER,
          type: "circle",
          source: STOPS_SRC,
          minzoom: 3,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 6, 5.5, 10, 8, 14, 12, 17, 16],
            "circle-color": "#fff",
            "circle-stroke-color": stopColor,
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 3, 1.5, 10, 2.5, 14, 3.5],
            "circle-opacity": 1,
          },
        });
      }

      // Inner filled circle — themed color
      if (!map.getLayer(STOPS_INNER)) {
        map.addLayer({
          id: STOPS_INNER,
          type: "circle",
          source: STOPS_SRC,
          minzoom: 3,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 6, 3.5, 10, 5.5, 14, 8, 17, 11],
            "circle-color": stopColor,
            "circle-opacity": 1,
          },
        });
      }

      // Subtle pulse on start/end at higher zooms
      if (!map.getLayer(STOP_PULSE)) {
        map.addLayer({
          id: STOP_PULSE,
          type: "circle",
          source: STOPS_SRC,
          minzoom: 8,
          filter: ["any", ["==", ["get", "type"], "start"], ["==", ["get", "type"], "end"]],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 14, 14, 22],
            "circle-color": "transparent",
            "circle-stroke-color": ["match", ["get", "type"], "start", "rgba(22,163,74,0.2)", "end", "rgba(220,38,38,0.2)", "transparent"],
            "circle-stroke-width": 2,
            "circle-opacity": 0.8,
          },
        });
      }

      // Icon symbols on stops (at higher zoom)
      if (!map.getLayer(STOP_ICON_LAYER)) {
        map.addLayer({
          id: STOP_ICON_LAYER,
          type: "symbol",
          source: STOPS_SRC,
          minzoom: 11,
          layout: {
            "icon-image": ["get", "iconId"],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.45, 14, 0.65, 17, 0.85],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 13, 0.9] },
        });
      }

      // Labels
      if (!map.getLayer(STOP_LABELS)) {
        map.addLayer({
          id: STOP_LABELS,
          type: "symbol",
          source: STOPS_SRC,
          minzoom: 9,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Bold"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 14, 13, 16, 15],
            "text-offset": [0, 1.6],
            "text-anchor": "top",
            "text-max-width": 8,
            "text-optional": true,
            "text-allow-overlap": false,
          },
          paint: { "text-color": "rgba(255,255,255,0.95)", "text-halo-color": "rgba(0,0,0,0.75)", "text-halo-width": 1.5 },
        });
      }

      // Focus ring — animated outer highlight
      if (!map.getLayer(STOP_FOCUS_RING)) {
        map.addLayer({
          id: STOP_FOCUS_RING,
          type: "circle",
          source: STOPS_SRC,
          filter: ["==", ["get", "id"], props.focusedStopId ?? ""],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 10, 10, 14, 14, 20, 17, 26],
            "circle-color": "transparent",
            "circle-stroke-color": "rgba(255,255,255,0.85)",
            "circle-stroke-width": 2.5,
            "circle-opacity": 1,
          },
        });
      }

      registerStopClick(STOPS_SHADOW);
      registerStopClick(STOPS_OUTER);
      registerStopClick(STOPS_INNER);

      /* ── 6. User location layers ───────────────────────────────────── */
      addOrUpdateGeoJsonSource(map, USER_LOC_SRC, userLocFC);
      addOrUpdateGeoJsonSource(map, USER_LOC_HEADING_SRC, headingFC);

      if (!map.getLayer(USER_LOC_ACCURACY)) {
        map.addLayer({
          id: USER_LOC_ACCURACY,
          type: "circle",
          source: USER_LOC_SRC,
          paint: {
            "circle-radius": 30,
            "circle-color": "rgba(37,99,235,0.07)",
            "circle-stroke-color": "rgba(37,99,235,0.22)",
            "circle-stroke-width": 1.5,
            "circle-opacity": 1,
          },
        });
      }

      if (!map.getLayer(USER_LOC_HEADING)) {
        map.addLayer({
          id: USER_LOC_HEADING,
          type: "symbol",
          source: USER_LOC_HEADING_SRC,
          layout: {
            "icon-image": HEADING_ARROW_ID,
            "icon-size": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 14, 1.0, 18, 1.3],
            "icon-rotate": ["get", "heading"],
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": 0.9 },
        });
      }
      if (!map.getLayer(USER_LOC_DOT_OUTER)) {
        map.addLayer({
          id: USER_LOC_DOT_OUTER,
          type: "circle",
          source: USER_LOC_SRC,
          paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 10, 9, 16, 12], "circle-color": "#ffffff", "circle-opacity": 0.95 },
        });
      }
      if (!map.getLayer(USER_LOC_DOT_INNER)) {
        map.addLayer({
          id: USER_LOC_DOT_INNER,
          type: "circle",
          source: USER_LOC_SRC,
          paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 10, 6.5, 16, 9], "circle-color": "#2563eb", "circle-opacity": 1 },
        });
      }

      // ── Fuel station layers ──
      if (!map.getSource(FUEL_SRC)) {
        map.addSource(FUEL_SRC, { type: "geojson", data: fuelFC });
      } else {
        const s: any = map.getSource(FUEL_SRC);
        s?.setData?.(fuelFC);
      }

      if (!map.getLayer(FUEL_CIRCLE_LAYER)) {
        map.addLayer({
          id: FUEL_CIRCLE_LAYER,
          type: "circle",
          source: FUEL_SRC,
          paint: {
            "circle-radius": 12,
            "circle-color": "rgba(0,0,0,0.08)",
            "circle-blur": 0.6,
          },
        });
      }

      if (!map.getLayer(FUEL_ICON_LAYER)) {
        map.addLayer({
          id: FUEL_ICON_LAYER,
          type: "symbol",
          source: FUEL_SRC,
          layout: {
            "icon-image": ["match", ["get", "fuel_level"], "warn", "roam-fuel-warn", "critical", "roam-fuel-critical", "roam-fuel-ok"],
            "icon-size": 1,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
      }

      if (!map.getLayer(FUEL_LABEL_LAYER)) {
        map.addLayer({
          id: FUEL_LABEL_LAYER,
          type: "symbol",
          source: FUEL_SRC,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Open Sans Bold"],
            "text-size": 10,
            "text-offset": [0, 1.8],
            "text-anchor": "top",
            "text-max-width": 8,
          },
          paint: {
            "text-color": "#1a1a1a",
            "text-halo-color": "rgba(255,255,255,0.9)",
            "text-halo-width": 1.5,
          },
          minzoom: 9,
        });
      }

      // Initial fit
      try {
        map.fitBounds(bboxToBounds(props.bbox), { padding: 60, duration: 0 });
      } catch {}
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
      try {
        popupRef.current?.remove();
      } catch {}
      try {
        map.remove();
      } catch {}
      try {
        if (protocolRef.current) maplibregl.removeProtocol("pmtiles");
      } catch {}
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
        let styleJson = await res.json();
        if (isFullyOfflineCapable()) {
          styleJson = rewriteStyleForLocalServer(styleJson);
        }
        map.setStyle(rewriteStyleForPMTiles(styleJson, origin), { diff: false });
      } catch (e) {
        console.error("[TripMap] style load failed", e);
      }
    })();
  }, [props.styleId]);

  /* ── Data updates ───────────────────────────────────────────────────── */
  useEffect(() => {
    const s: any = mapRef.current?.getSource(ROUTE_SRC);
    s?.setData?.(routeFC);
  }, [routeFC]);
  useEffect(() => {
    const s: any = mapRef.current?.getSource(STOPS_SRC);
    s?.setData?.(stopsFC);
  }, [stopsFC]);

  useEffect(() => {
    const s: any = mapRef.current?.getSource(FUEL_SRC);
    s?.setData?.(fuelFC);
  }, [fuelFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(STOP_FOCUS_RING)) map.setFilter(STOP_FOCUS_RING, ["==", ["get", "id"], props.focusedStopId ?? ""]);
  }, [props.focusedStopId]);

  useEffect(() => {
    const s: any = mapRef.current?.getSource(SUG_SRC);
    s?.setData?.(sugFC);
  }, [sugFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const s1: any = map.getSource(TRAFFIC_POINT_SRC);
    s1?.setData?.(trafficPtFC);
    const s2: any = map.getSource(TRAFFIC_LINE_SRC);
    s2?.setData?.(trafficLineFC);
    const s3: any = map.getSource(TRAFFIC_POLY_SRC);
    s3?.setData?.(trafficPolyFC);
  }, [trafficPtFC, trafficLineFC, trafficPolyFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const s1: any = map.getSource(HAZARD_POINT_SRC);
    s1?.setData?.(hazardPtFC);
    const s2: any = map.getSource(HAZARD_POLY_SRC);
    s2?.setData?.(hazardPolyFC);
  }, [hazardPtFC, hazardPolyFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const locSrc: any = map.getSource(USER_LOC_SRC);
    if (locSrc?.setData) locSrc.setData(userLocFC);
    const headSrc: any = map.getSource(USER_LOC_HEADING_SRC);
    if (headSrc?.setData) headSrc.setData(headingFC);
    const pos = props.userPosition;
    if (pos && map.getLayer(USER_LOC_ACCURACY)) {
      map.setPaintProperty(USER_LOC_ACCURACY, "circle-radius", accuracyToPixels(pos.accuracy, pos.lat, map.getZoom()));
    }
  }, [userLocFC, headingFC, props.userPosition]);

  /* ── Focus stop → ease ──────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = props.focusedStopId ?? null;
    if (!id) return;
    const s = (props.stops ?? []).find((x) => String(x.id) === String(id));
    if (s) easeToCoord(map, [s.lng, s.lat], { zoom: Math.max(map.getZoom(), 12), duration: 420 });
  }, [props.focusedStopId, props.stops]);

  /* ── Focus suggestion → zoom/focus ──────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = props.focusedSuggestionId ?? null;
    if (!id) return;
    const p = (props.suggestions ?? []).find((x) => String(x.id) === String(id));
    if (p) {
      easeToCoord(map, [p.lng, p.lat], { zoom: Math.max(map.getZoom(), 13), duration: 420 });
      return;
    }
    try {
      const feats = map.querySourceFeatures(SUG_SRC);
      for (const f of feats as any[]) {
        if (f?.properties?.id && String(f.properties.id) === id) {
          const coords = (f.geometry as any)?.coordinates;
          if (Array.isArray(coords) && coords.length === 2) {
            easeToCoord(map, [Number(coords[0]), Number(coords[1])], { zoom: Math.max(map.getZoom(), 13), duration: 420 });
            break;
          }
        }
      }
    } catch {}
  }, [props.focusedSuggestionId, props.suggestions]);

  /* ── Highlighted alert → in-place pulse ring (no camera move) ────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = props.highlightedAlertId ?? null;
    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

    if (!id) {
      const src = map.getSource(ALERT_HIGHLIGHT_SRC) as any;
      if (src?.setData) src.setData(emptyFC);
      return;
    }

    let coord: [number, number] | null = null;
    for (const srcId of [TRAFFIC_POINT_SRC, HAZARD_POINT_SRC]) {
      try {
        const feats = (map.getSource(srcId) as any)?._data?.features ?? [];
        for (const f of feats) {
          if (f?.properties?.id === id && f?.geometry?.type === "Point") {
            coord = f.geometry.coordinates as [number, number];
            break;
          }
        }
      } catch {}
      if (coord) break;
    }

    if (!coord) {
      const src = map.getSource(ALERT_HIGHLIGHT_SRC) as any;
      if (src?.setData) src.setData(emptyFC);
      return;
    }

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: coord }, properties: {} }],
    };

    if (!map.getSource(ALERT_HIGHLIGHT_SRC)) {
      map.addSource(ALERT_HIGHLIGHT_SRC, { type: "geojson", data: fc });
    } else {
      (map.getSource(ALERT_HIGHLIGHT_SRC) as any).setData(fc);
    }

    if (!map.getLayer(ALERT_HIGHLIGHT_PING)) {
      map.addLayer({
        id: ALERT_HIGHLIGHT_PING,
        type: "circle",
        source: ALERT_HIGHLIGHT_SRC,
        paint: { "circle-radius": 0, "circle-color": "transparent", "circle-stroke-color": "rgba(239,68,68,0.6)", "circle-stroke-width": 2, "circle-opacity": 1 },
      });
    }

    if (!map.getLayer(ALERT_HIGHLIGHT_RING)) {
      map.addLayer({
        id: ALERT_HIGHLIGHT_RING,
        type: "circle",
        source: ALERT_HIGHLIGHT_SRC,
        paint: { "circle-radius": 18, "circle-color": "rgba(239,68,68,0.12)", "circle-stroke-color": "rgba(239,68,68,0.7)", "circle-stroke-width": 2.5 },
      });
    }

    let frame = 0;
    let raf: number;
    const animate = () => {
      frame++;
      const t = (frame % 60) / 60;
      const radius = 18 + t * 24;
      const opacity = 1 - t;
      try {
        map.setPaintProperty(ALERT_HIGHLIGHT_PING, "circle-radius", radius);
        map.setPaintProperty(ALERT_HIGHLIGHT_PING, "circle-stroke-color", `rgba(239,68,68,${(0.6 * opacity).toFixed(2)})`);
      } catch {}
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [props.highlightedAlertId]);
  useEffect(() => {
       const map = mapRef.current;
       if (!map) return;
       if (props.mapInstanceRef) props.mapInstanceRef.current = null;
       if (props.navigationMode) return; // camera controlled by useMapNavigationMode
       try {
         map.fitBounds(bboxToBounds(props.bbox), { padding: 60, duration: 250 });
       } catch {}
     }, [props.bbox.minLat, props.bbox.minLng, props.bbox.maxLat, props.bbox.maxLng, props.navigationMode]);
  
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
