// src/components/trip/TripMap.tsx
"use client";

import React, { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { rewriteStyleForLocalServer, isFullyOfflineCapable } from "@/lib/offline/basemapManager";

import maplibregl, { type Map as MLMap, type LngLatBoundsLike, type MapLayerMouseEvent, GeoJSONSource } from "maplibre-gl";
import type { StyleSpecification, SourceSpecification, GeoJSONSourceSpecification } from "@maplibre/maplibre-gl-style-spec";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";

import { decodePolyline6AsLngLat } from "@/lib/nav/polyline6";
import { useMapViewport, useCulledFC, cullFeatures } from "@/lib/hooks/useViewportCull";
import type { ViewportBounds } from "@/lib/hooks/useViewportCull";
import type { BBox4 } from "@/lib/types/geo";
import type { TripStop } from "@/lib/types/trip";
import type { PlaceItem } from "@/lib/types/places";
import type { TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { RoamPosition } from "@/lib/native/geolocation";
import type { FuelStation, FuelTrackingState } from "@/lib/types/fuel";
import type {
  FloodOverlay,
  CoverageOverlay,
  WildlifeOverlay,
  RestAreaOverlay,
  FuelOverlay,
  WeatherOverlay,
  EmergencyServicesOverlay,
  HeritageOverlay,
  AirQualityOverlay,
  BushfireOverlay,
  SpeedCamerasOverlay,
  ToiletsOverlay,
  SchoolZonesOverlay,
  RoadkillOverlay,
} from "@/lib/types/overlays";

import { assetsApi } from "@/lib/api/assets";
import { haptic } from "@/lib/native/haptics";
import type { MapBaseMode, VectorTheme } from "@/components/trips/new/MapStyleSwitcher";

type Props = {
  styleId: string;
  onStyleChange?: (next: { mode: MapBaseMode; vectorTheme: VectorTheme }) => void;

  stops: TripStop[];
  geometry: string; // polyline6
  bbox: BBox4;

  focusedStopId?: string | null;
  onStopPress?: (stopId: string) => void;
  /** Called after a long-press (≥500ms) on a stop pin. Provides screen coords for menu anchoring. */
  onStopLongPress?: (stopId: string, screenX: number, screenY: number) => void;

  // Suggestions
  suggestions?: PlaceItem[] | null;
  filteredSuggestionIds?: Set<string> | null;
  focusedSuggestionId?: string | null;
  /** Fallback coords to fly to when focusedSuggestionId doesn't match any PlaceItem */
  focusFallbackCoord?: [number, number] | null;
  /** Fallback name for popup when focusedSuggestionId doesn't match any PlaceItem */
  focusFallbackName?: string | null;
  onSuggestionPress?: (placeId: string) => void;

  /** Called when user taps a place marker (suggestion, fuel, EV, rest area) — opens PlaceDetailSheet */
  onOpenPlaceDetail?: (placeId: string, coords: { lat: number; lng: number; name?: string; category?: string; extra?: Record<string, unknown> }) => void;

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
  onNavigateToGuide?: (placeId: string, placeName?: string) => void;

  // Add stop from map popup
  onAddStopFromMap?: (placeId: string, coords?: { lat: number; lng: number; name?: string }) => void;
  /** IDs of stops already in the trip — used to show "Already added" in popup */
  stopPlaceIds?: Set<string> | null;
  /** Whether the device is online — controls popup button labels */
  isOnline?: boolean;

  // Alert highlight - pulses the marker in-place without moving the camera
  highlightedAlertId?: string | null;

  fuelStations?: FuelStation[] | null;
  fuelTracking?: FuelTrackingState | null;

  // ── Overlay packs ──
  flood?: FloodOverlay | null;
  coverage?: CoverageOverlay | null;
  wildlife?: WildlifeOverlay | null;
  restAreas?: RestAreaOverlay | null;
  fuelOverlay?: FuelOverlay | null;
  weather?: WeatherOverlay | null;
  emergency?: EmergencyServicesOverlay | null;
  heritage?: HeritageOverlay | null;
  airQuality?: AirQualityOverlay | null;
  bushfire?: BushfireOverlay | null;
  speedCameras?: SpeedCamerasOverlay | null;
  toilets?: ToiletsOverlay | null;
  schoolZones?: SchoolZonesOverlay | null;
  roadkill?: RoadkillOverlay | null;

   // ── Active navigation mode ──
   /** When true, map is in heading-up tracking mode. Disables bbox refit. */
   navigationMode?: boolean;
   /** Ref that TripMap populates with the MapLibre instance for external control */
   mapInstanceRef?: React.MutableRefObject<import("maplibre-gl").Map | null>;

   /** Debug: corridor bbox outline on the map */
   corridorDebug?: { bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number } } | null;
 };

/* ── Layer / source IDs ─────────────────────────────────────────────── */

const CORRIDOR_DEBUG_SRC = "roam-corridor-debug-src";
const CORRIDOR_DEBUG_LINE = "roam-corridor-debug-line";
const CORRIDOR_BBOX_SRC = "roam-corridor-bbox-src";
const CORRIDOR_BBOX_FILL = "roam-corridor-bbox-fill";

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
const SUG_FOCUS_SRC = "roam-sug-focus-src";
const SUG_FOCUS_RING = "roam-sug-focus-ring";
const SUG_FOCUS_PING = "roam-sug-focus-ping";
const SUG_FOCUS_DOT = "roam-sug-focus-dot";

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
const FUEL_CLUSTER_CIRCLE = "roam-fuel-cluster-circle";
const FUEL_CLUSTER_COUNT = "roam-fuel-cluster-count";
const FUEL_CIRCLE_LAYER = "roam-fuel-circle";
const FUEL_ICON_LAYER = "roam-fuel-icon";
const FUEL_LABEL_LAYER = "roam-fuel-label";

const EV_SRC = "roam-ev-src";
const EV_CLUSTER_CIRCLE = "roam-ev-cluster-circle";
const EV_CLUSTER_COUNT = "roam-ev-cluster-count";
const EV_ICON_LAYER = "roam-ev-icon";
const EV_LABEL_LAYER = "roam-ev-label";

// ── New overlay sources / layers ─────────────────────────────────────────
const WILDLIFE_SRC = "roam-wildlife-src";
const WILDLIFE_FILL_LAYER = "roam-wildlife-fill";
const WILDLIFE_LABEL_LAYER = "roam-wildlife-label";

const COVERAGE_SRC = "roam-coverage-src";
const COVERAGE_LINE_LAYER = "roam-coverage-line";

const FLOOD_SRC = "roam-flood-src";
const FLOOD_CIRCLE_LAYER = "roam-flood-circle";
const FLOOD_LABEL_LAYER = "roam-flood-label";
const FLOOD_CATCH_SRC = "roam-flood-catch-src";
const FLOOD_CATCH_FILL = "roam-flood-catch-fill";
const FLOOD_CATCH_LINE = "roam-flood-catch-line";

const REST_AREAS_SRC = "roam-rest-areas-src";
const REST_AREAS_ICON_LAYER = "roam-rest-areas-icon";
const REST_AREAS_LABEL_LAYER = "roam-rest-areas-label";

const WEATHER_SRC = "roam-weather-src";
const WEATHER_DOT_LAYER = "roam-weather-dot";
const WEATHER_LABEL_LAYER = "roam-weather-label";

const EMERGENCY_SRC = "roam-emergency-src";
const EMERGENCY_ICON_LAYER = "roam-emergency-icon";
const EMERGENCY_LABEL_LAYER = "roam-emergency-label";

const HERITAGE_SRC = "roam-heritage-src";
const HERITAGE_ICON_LAYER = "roam-heritage-icon";

const AQI_SRC = "roam-aqi-src";
const AQI_DOT_LAYER = "roam-aqi-dot";
const AQI_LABEL_LAYER = "roam-aqi-label";

const BUSHFIRE_SRC = "roam-bushfire-src";
const BUSHFIRE_ICON_LAYER = "roam-bushfire-icon";
const BUSHFIRE_HOTSPOT_SRC = "roam-bushfire-hotspot-src";
const BUSHFIRE_HOTSPOT_LAYER = "roam-bushfire-hotspot";

const CAMERAS_SRC = "roam-cameras-src";
const CAMERAS_ICON_LAYER = "roam-cameras-icon";
const BLACKSPOT_SRC = "roam-blackspot-src";
const BLACKSPOT_LAYER = "roam-blackspot-dot";

const TOILETS_SRC = "roam-toilets-src";
const TOILETS_ICON_LAYER = "roam-toilets-icon";

const SCHOOL_ZONES_SRC = "roam-school-zones-src";
const SCHOOL_ZONES_ICON_LAYER = "roam-school-zones-icon";

const ROADKILL_SRC = "roam-roadkill-src";
const ROADKILL_DOT_LAYER = "roam-roadkill-dot";

/** Layer groups by category */
const LAYER_GROUPS = {
  stops: [STOPS_SHADOW, STOPS_OUTER, STOPS_INNER, STOP_PULSE, STOP_ICON_LAYER, STOP_LABELS, STOP_FOCUS_RING],
  places: [SUG_CLUSTER_CIRCLE, SUG_CLUSTER_COUNT, SUG_UNCLUSTERED, SUG_ICON_LAYER, SUG_LABEL_LAYER, SUG_FOCUS_RING, SUG_FOCUS_PING, SUG_FOCUS_DOT],
  fuel: [FUEL_CLUSTER_CIRCLE, FUEL_CLUSTER_COUNT, FUEL_CIRCLE_LAYER, FUEL_ICON_LAYER, FUEL_LABEL_LAYER, EV_CLUSTER_CIRCLE, EV_CLUSTER_COUNT, EV_ICON_LAYER, EV_LABEL_LAYER],
  traffic: [TRAFFIC_POLY_LAYER, TRAFFIC_LINE_CASING, TRAFFIC_LINE_LAYER, TRAFFIC_PULSE_LAYER, TRAFFIC_POINT_LAYER],
  hazards: [HAZARD_POLY_LAYER, HAZARD_POLY_OUTLINE, HAZARD_ICON_LAYER, ALERT_HIGHLIGHT_RING, ALERT_HIGHLIGHT_PING],
  wildlife: [WILDLIFE_FILL_LAYER, WILDLIFE_LABEL_LAYER],
  coverage: [COVERAGE_LINE_LAYER],
  flood: [FLOOD_CATCH_FILL, FLOOD_CATCH_LINE, FLOOD_CIRCLE_LAYER, FLOOD_LABEL_LAYER],
  rest_areas: [REST_AREAS_ICON_LAYER, REST_AREAS_LABEL_LAYER],
  weather: [WEATHER_DOT_LAYER, WEATHER_LABEL_LAYER],
  emergency: [EMERGENCY_ICON_LAYER, EMERGENCY_LABEL_LAYER],
  heritage: [HERITAGE_ICON_LAYER],
  air_quality: [AQI_DOT_LAYER, AQI_LABEL_LAYER],
  bushfire: [BUSHFIRE_ICON_LAYER, BUSHFIRE_HOTSPOT_LAYER],
  cameras: [CAMERAS_ICON_LAYER, BLACKSPOT_LAYER],
  toilets: [TOILETS_ICON_LAYER],
  school_zones: [SCHOOL_ZONES_ICON_LAYER],
  roadkill: [ROADKILL_DOT_LAYER],
} as const;

type OverlayKey = keyof typeof LAYER_GROUPS;
const ALL_OVERLAY_KEYS: OverlayKey[] = [
  "stops", "places", "fuel", "traffic", "hazards", "wildlife", "coverage", "flood", "rest_areas", "weather",
  "emergency", "heritage", "air_quality", "bushfire", "cameras", "toilets", "school_zones", "roadkill",
];
type OverlayVisibility = Record<OverlayKey, boolean>;

const DEFAULT_VIS: OverlayVisibility = {
  stops: true, places: true, fuel: true, traffic: true, hazards: true,
  wildlife: true, coverage: true, flood: true, rest_areas: true, weather: true,
  emergency: true, heritage: true, air_quality: true, bushfire: true, cameras: true,
  toilets: true, school_zones: true, roadkill: true,
};

function applyAllOverlayVisibility(map: MLMap, vis: OverlayVisibility) {
  for (const key of ALL_OVERLAY_KEYS) {
    const v = vis[key] ? "visible" : "none";
    for (const id of LAYER_GROUPS[key]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    }
  }
}

const STORAGE_KEY = "roam:overlayVis";

function readStoredVis(): OverlayVisibility {
  if (typeof window === "undefined") return DEFAULT_VIS;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VIS;
    return { ...DEFAULT_VIS, ...JSON.parse(raw) };
  } catch { return DEFAULT_VIS; }
}

function writeStoredVis(v: OverlayVisibility) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch {}
}

/* ══════════════════════════════════════════════════════════════════════
   SVG Icon System - clean vector icons, no emojis
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

/* ── Icon path data (24x24 viewBox) - clean Lucide-style strokes ──── */

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
  cave: { icon: "mountain", color: "#475569", size: "md" },
  fishing: { icon: "wave", color: "#0891b2", size: "md" },
  surf: { icon: "wave", color: "#0284c7", size: "md" },
  // ── Family & recreation ─────────────────────────────────────────────
  playground: { icon: "paw", color: "#f59e0b", size: "sm" },
  pool: { icon: "swim", color: "#0ea5e9", size: "md" },
  zoo: { icon: "paw", color: "#22c55e", size: "md" },
  theme_park: { icon: "star", color: "#ec4899", size: "md" },
  dog_park: { icon: "paw", color: "#db2777", size: "sm" },
  golf: { icon: "flag_end", color: "#059669", size: "sm" },
  cinema: { icon: "star", color: "#4f46e5", size: "sm" },
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
  library: { icon: "columns", color: "#4f46e5", size: "sm" },
  showground: { icon: "flag_end", color: "#ea580c", size: "sm" },
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

function loadEvChargerIcons(map: MLMap): Promise<void> {
  const id = "roam-ev-charger";
  if (map.hasImage(id)) return Promise.resolve();
  const svg = makeIconSVG(ICON_PATHS.lightning, "#2563eb", 38, "#fff");
  return loadSVGImage(map, id, svg, 38);
}

function loadNewOverlayIcons(map: MLMap): Promise<void> {
  const defs = [
    { id: "roam-flood-minor",    color: "#eab308" },
    { id: "roam-flood-moderate", color: "#f97316" },
    { id: "roam-flood-major",    color: "#ef4444" },
    { id: "roam-rest-area",      color: "#6366f1" },
  ];
  const promises: Promise<void>[] = [];
  for (const d of defs) {
    if (map.hasImage(d.id)) continue;
    const svg = makeIconSVG(d.id.startsWith("roam-flood") ? ICON_PATHS.flood_wave : ICON_PATHS.car, d.color, 32, "#fff");
    promises.push(loadSVGImage(map, d.id, svg, 32));
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

function stopsGeoJSON(stops: TripStop[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: (stops ?? []).map((s, idx) => ({
      type: "Feature" as const,
      properties: {
        id: s.id ?? `${idx}`,
        type: s.type ?? "poi",
        name: s.name ?? "",
        idx,
        iconId: `roam-stop-${s.type ?? "poi"}`,
      },
      geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
    })),
  };
}

/**
 * Categories rendered by the dedicated fuel layer — exclude from suggestions
 * to avoid double pins.  Only suppress categories that the fuel analysis is
 * actually showing; e.g. when the user drives a petrol car, ev_charging
 * stations should still appear as suggestion POIs (they aren't in the fuel
 * layer).
 */
function fuelLayerCats(fuelStations: FuelStation[] | null | undefined): Set<string> {
  if (!fuelStations || fuelStations.length === 0) return new Set();
  const cats = new Set<string>();
  for (const s of fuelStations) {
    cats.add(s.category);
  }
  return cats;
}

function suggestionsGeoJSON(items: PlaceItem[], allowed?: Set<string> | null, suppressCats?: Set<string>): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: (items ?? [])
      .filter((p) => !(suppressCats?.has(p.category)) && (allowed ? allowed.has(p.id) : true))
      .map((p) => {
        const cfg = getCatConfig(p.category);
        return {
          type: "Feature" as const,
          properties: {
            id: p.id,
            name: p.name ?? "",
            category: p.category ?? "unknown",
            color: cfg.color,
            sizeClass: cfg.size,
            iconId: CATEGORY_CONFIG[p.category] ? `roam-cat-${p.category}` : "roam-cat-default",
          },
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        };
      }),
  };
}

/* ── Overlay GeoJSON builders ────────────────────────────────────────── */

function trafficPointsGeoJSON(overlay: TrafficOverlay | null): GeoJSON.FeatureCollection {
  if (!overlay) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: overlay.items
      .filter((ev) => ev.geometry && ev.geometry.type === "Point" && Array.isArray(ev.geometry.coordinates))
      .map((ev) => ({
        type: "Feature" as const,
        properties: {
          id: ev.id,
          type: ev.type ?? "unknown",
          severity: ev.severity ?? "unknown",
          headline: ev.headline,
          iconId: `roam-traffic-${ev.type ?? "unknown"}`,
        },
        geometry: ev.geometry as unknown as GeoJSON.Geometry,
      })),
  };
}

function trafficLinesGeoJSON(overlay: TrafficOverlay | null): GeoJSON.FeatureCollection {
  if (!overlay) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: overlay.items
      .filter((ev) => ev.geometry && (ev.geometry.type === "LineString" || ev.geometry.type === "MultiLineString"))
      .map((ev) => ({
        type: "Feature" as const,
        properties: { id: ev.id, type: ev.type ?? "unknown", severity: ev.severity ?? "unknown", headline: ev.headline },
        geometry: ev.geometry as unknown as GeoJSON.Geometry,
      })),
  };
}

function trafficPolygonsGeoJSON(overlay: TrafficOverlay | null): GeoJSON.FeatureCollection {
  if (!overlay) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: overlay.items
      .filter((ev) => ev.geometry && (ev.geometry.type === "Polygon" || ev.geometry.type === "MultiPolygon"))
      .map((ev) => ({
        type: "Feature" as const,
        properties: { id: ev.id, type: ev.type ?? "unknown", severity: ev.severity ?? "unknown", headline: ev.headline },
        geometry: ev.geometry as unknown as GeoJSON.Geometry,
      })),
  };
}

function hazardPointsGeoJSON(overlay: HazardOverlay | null): GeoJSON.FeatureCollection {
  if (!overlay) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: overlay.items
      .map((ev): GeoJSON.Feature | null => {
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
            geometry: ev.geometry as unknown as GeoJSON.Geometry,
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
      .filter((f): f is GeoJSON.Feature => f !== null),
  };
}

function hazardPolygonsGeoJSON(overlay: HazardOverlay | null): GeoJSON.FeatureCollection {
  if (!overlay) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: overlay.items
      .filter((ev) => ev.geometry && (ev.geometry.type === "Polygon" || ev.geometry.type === "MultiPolygon"))
      .map((ev) => ({
        type: "Feature" as const,
        properties: { id: ev.id, kind: ev.kind ?? "unknown", severity: ev.severity ?? "unknown", title: ev.title },
        geometry: ev.geometry as unknown as GeoJSON.Geometry,
      })),
  };
}

/* ── New overlay GeoJSON builders ───────────────────────────────────────── */

function wildlifeZonesGeoJSON(overlay: WildlifeOverlay | null | undefined): GeoJSON.FeatureCollection {
  if (!overlay?.zones?.length) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: overlay.zones
      .filter((z) => z.risk_level !== "none")
      .map((z) => ({
        type: "Feature" as const,
        properties: {
          risk_level: z.risk_level,
          km_from: z.km_from,
          km_to: z.km_to,
          message: z.message ?? null,
          is_twilight_risk: z.is_twilight_risk,
          species_guess: z.species_guess ?? null,
          photo: z.photos?.[0] ?? null,
          attribution: z.attribution ?? null,
          occurrence_count: z.occurrence_count,
        },
        // Represent zone as a circle approximation centred on midpoint lat/lng
        geometry: { type: "Point" as const, coordinates: [z.lng, z.lat] },
      })),
  };
}

function coverageGapsLineGeoJSON(
  overlay: CoverageOverlay | null | undefined,
  routeCoords: Array<[number, number]>,
  cumKm: number[],
): GeoJSON.FeatureCollection {
  if (!overlay?.gaps?.length || routeCoords.length < 2) return { type: "FeatureCollection", features: [] };

  // Slice route coordinates between km_from and km_to for each gap
  function coordsForRange(kmFrom: number, kmTo: number): Array<[number, number]> {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < routeCoords.length; i++) {
      const km = cumKm[i] ?? 0;
      if (km >= kmFrom && km <= kmTo) pts.push(routeCoords[i]);
    }
    return pts;
  }

  const features: GeoJSON.Feature[] = [];
  for (const g of overlay.gaps) {
    const coords = coordsForRange(g.km_from, g.km_to);
    if (coords.length < 2) continue;
    const isNoCoverage = g.carrier === "all" || g.message.toLowerCase().includes("no coverage");
    const isWeak = !isNoCoverage && g.message.toLowerCase().includes("weak");
    features.push({
      type: "Feature",
      properties: {
        carrier: g.carrier,
        gap_km: g.gap_km,
        message: g.message,
        signal_class: isNoCoverage ? "no_coverage" : isWeak ? "weak" : "voice_only",
      },
      geometry: { type: "LineString", coordinates: coords },
    });
  }
  return { type: "FeatureCollection", features };
}

function floodGaugesGeoJSON(overlay: FloodOverlay | null | undefined): GeoJSON.FeatureCollection {
  if (!overlay?.gauges?.length) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: overlay.gauges
      .filter((g) => g.severity !== "normal")
      .map((g) => ({
        type: "Feature" as const,
        properties: {
          station_no: g.station_no,
          station_name: g.station_name,
          severity: g.severity,
          trend: g.trend,
          latest_height_m: g.latest_height_m ?? null,
          reading_time_iso: g.reading_time_iso ?? null,
        },
        geometry: { type: "Point" as const, coordinates: [g.lng, g.lat] },
      })),
  };
}

/** Cubic B-spline smoothing: produces very round curves from coarse input polygons. */
function bsplineSmooth(ring: number[][], granularity = 6): number[][] {
  // Remove closing duplicate if present
  const closed = ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const pts = closed ? ring.slice(0, -1) : ring;
  const n = pts.length;
  if (n < 3) return ring;

  const result: number[][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[((i - 1) + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let s = 0; s < granularity; s++) {
      const t = s / granularity;
      const t2 = t * t, t3 = t2 * t;
      // Uniform cubic B-spline basis
      const b0 = (-t3 + 3 * t2 - 3 * t + 1) / 6;
      const b1 = (3 * t3 - 6 * t2 + 4) / 6;
      const b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
      const b3 = t3 / 6;
      result.push([
        b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
        b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
      ]);
    }
  }
  // close the ring
  result.push(result[0]);
  return result;
}

function smoothGeometry(geom: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] }): GeoJSON.Geometry {
  if (geom.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: (geom.coordinates as unknown as number[][][][]).map(
        (polygon) => polygon.map((ring) => bsplineSmooth(ring)),
      ),
    };
  }
  return {
    type: "Polygon",
    coordinates: geom.coordinates.map((ring) => bsplineSmooth(ring)),
  };
}

function floodCatchmentsGeoJSON(overlay: FloodOverlay | null | undefined): GeoJSON.FeatureCollection {
  if (!overlay?.catchments?.length) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: overlay.catchments.map((c) => ({
      type: "Feature" as const,
      properties: {
        aac: c.aac,
        dist_name: c.dist_name,
        level: c.level,
      },
      geometry: smoothGeometry(c.geometry),
    })),
  };
}

function restAreaFacilitiesSummary(f: import("@/lib/types/overlays").RestFacilities): string {
  const parts: string[] = [];
  if (f.toilets) parts.push("Toilets");
  if (f.drinking_water) parts.push("Water");
  if (f.shower) parts.push("Shower");
  if (f.bbq) parts.push("BBQ");
  if (f.picnic_table) parts.push("Picnic");
  if (f.power_supply) parts.push("Power");
  if (f.internet) parts.push("WiFi");
  if (f.shelter) parts.push("Shelter");
  return parts.join(" · ") || "";
}

function restAreasGeoJSON(overlay: RestAreaOverlay | null | undefined): GeoJSON.FeatureCollection {
  if (!overlay?.rest_areas?.length) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: overlay.rest_areas.map((r) => ({
      type: "Feature" as const,
      properties: {
        id: r.id,
        name: r.name ?? "",
        type: r.type,
        quality_score: r.quality_score,
        km_along: r.km_along ?? null,
        has_toilets: r.facilities.toilets ?? false,
        has_water: r.facilities.drinking_water ?? false,
        facilities_summary: restAreaFacilitiesSummary(r.facilities),
      },
      geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
    })),
  };
}

/* ── User location GeoJSON ───────────────────────────────────────────── */

function userLocGeoJSON(pos: RoamPosition | null | undefined): GeoJSON.FeatureCollection {
  if (!pos) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { accuracy: pos.accuracy, heading: pos.heading, speed: pos.speed },
        geometry: { type: "Point", coordinates: [pos.lng, pos.lat] },
      },
    ],
  };
}

function headingConeGeoJSON(pos: RoamPosition | null | undefined): GeoJSON.FeatureCollection {
  if (!pos || pos.heading == null || pos.speed == null || pos.speed < 0.5) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { heading: pos.heading }, geometry: { type: "Point", coordinates: [pos.lng, pos.lat] } }],
  };
}

function accuracyToPixels(accuracyM: number, lat: number, zoom: number): number {
  const metersPerPixel = (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * 6371008.8) / (256 * Math.pow(2, zoom));
  return Math.max(12, Math.min(200, accuracyM / metersPerPixel));
}

/* ── Style / PMTiles helpers ─────────────────────────────────────────── */

function rewriteStyleForPMTiles(style: StyleSpecification, origin: string): StyleSpecification {
  if (!style?.sources || typeof style.sources !== "object") return style;
  const out = { ...style, sources: { ...style.sources } };
  for (const [k, src] of Object.entries(out.sources)) {
    if (!src || typeof src !== "object") continue;
    const s = src as Record<string, unknown>;
    if (typeof s.url === "string" && s.url.startsWith("pmtiles://")) {
      out.sources[k] = { ...src, url: normalizePmtilesUrl(s.url as string, origin) } as SourceSpecification;
    } else if (Array.isArray(s.tiles)) {
      out.sources[k] = {
        ...src,
        tiles: (s.tiles as string[]).map((t: string) => (typeof t === "string" && t.startsWith("pmtiles://") ? normalizePmtilesUrl(t, origin) : t)),
      } as SourceSpecification;
    }
  }
  return out;
}

function normalizePmtilesUrl(u: string, origin: string) {
  const inner = u.slice("pmtiles://".length).replace(/^\/+/, "");
  if (/^https?:\/\//i.test(inner)) return `pmtiles://${inner}`;
  const path = inner.startsWith("offline/") ? `/${inner}` : inner.startsWith("/") ? inner : `/${inner}`;
  return `pmtiles://${origin}${path}`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function addOrUpdateGeoJsonSource(map: MLMap, id: string, data: GeoJSON.FeatureCollection, extraOpts?: Partial<GeoJSONSourceSpecification>) {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  if (!src) {
    map.addSource(id, { type: "geojson", data, ...extraOpts } as GeoJSONSourceSpecification);
    return;
  }
  src.setData(data);
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

export const TripMap = React.memo(function TripMap(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const protocolRef = useRef<Protocol | null>(null);
  const accuracyAnimFrame = useRef<number | null>(null);
  const sugFocusRaf = useRef<number | null>(null);
  /** Tracks the last place ID we flew the camera to — prevents re-fly on same ID */
  const lastFocusFlewToRef = useRef<string | null>(null);

  const [overlayVis, setOverlayVis] = useState<OverlayVisibility>(readStoredVis);
  const overlayVisRef = useRef(overlayVis);
  overlayVisRef.current = overlayVis;
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [layerMenuVisible, setLayerMenuVisible] = useState(false);
  const [layerMenuMounted, setLayerMenuMounted] = useState(false);
  const layerMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (layerMenuTimerRef.current) clearTimeout(layerMenuTimerRef.current);
    if (layerMenuOpen) {
      setLayerMenuVisible(true);
    } else {
      setLayerMenuMounted(false);
      layerMenuTimerRef.current = setTimeout(() => setLayerMenuVisible(false), 320);
    }
  }, [layerMenuOpen]);
  useEffect(() => {
    if (layerMenuVisible) requestAnimationFrame(() => setLayerMenuMounted(true));
  }, [layerMenuVisible]);
  const [styleReady, setStyleReady] = useState(false);
  useEffect(() => { writeStoredVis(overlayVis); }, [overlayVis]);

  const onNavToGuideRef = useRef(props.onNavigateToGuide);
  onNavToGuideRef.current = props.onNavigateToGuide;
  const onAddStopFromMapRef = useRef(props.onAddStopFromMap);
  onAddStopFromMapRef.current = props.onAddStopFromMap;
  const onStopLongPressRef = useRef(props.onStopLongPress);
  onStopLongPressRef.current = props.onStopLongPress;
  const stopPlaceIdsRef = useRef(props.stopPlaceIds);
  stopPlaceIdsRef.current = props.stopPlaceIds;
  const isOnlineRef = useRef(props.isOnline ?? true);
  isOnlineRef.current = props.isOnline ?? true;
  const onSugPressRef = useRef(props.onSuggestionPress);
  onSugPressRef.current = props.onSuggestionPress;
  const onOpenPlaceDetailRef = useRef(props.onOpenPlaceDetail);
  onOpenPlaceDetailRef.current = props.onOpenPlaceDetail;
  const onTrafficPressRef = useRef(props.onTrafficEventPress);
  onTrafficPressRef.current = props.onTrafficEventPress;
  const onHazardPressRef = useRef(props.onHazardEventPress);
  onHazardPressRef.current = props.onHazardEventPress;

  /* ── Viewport-based frustum culling ────────────────────────────────────
     Tracks the visible map bounds and filters overlay FCs to only features
     within ~1.5× the viewport.  This avoids feeding thousands of features
     across a 4,000 km route to MapLibre when the user only sees 50 km. */
  const vpBounds = useMapViewport(mapRef, 150, styleReady);
  const vpBoundsRef = useRef<ViewportBounds | null>(null);
  vpBoundsRef.current = vpBounds;

  // Decode polyline once — shared by routeFC, coverageFC, and routeCumKm
  const routeCoords = useMemo<Array<[number, number]>>(() => {
    try { return decodePolyline6AsLngLat(props.geometry); } catch { return []; }
  }, [props.geometry]);
  const routeFC = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: routeCoords.length ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: routeCoords } }] : [],
  }), [routeCoords]);
  const stopsFC = useMemo(() => stopsGeoJSON(props.stops), [props.stops]);

  // ── Corridor debug overlay (bbox outline only) ──
  const corridorBboxFC = useMemo<GeoJSON.FeatureCollection>(() => {
    const cd = props.corridorDebug;
    if (!cd?.bbox) return { type: "FeatureCollection", features: [] };
    const { minLng, minLat, maxLng, maxLat } = cd.bbox;
    return {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]],
        },
      }],
    };
  }, [props.corridorDebug]);

  const activeFuelCats = useMemo(() => fuelLayerCats(props.fuelStations), [props.fuelStations]);
  const routeCumKm = useMemo<number[]>(() => {
    if (routeCoords.length === 0) return [];
    const km: number[] = [0];
    for (let i = 1; i < routeCoords.length; i++) {
      const [lng1, lat1] = routeCoords[i - 1];
      const [lng2, lat2] = routeCoords[i];
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      km.push(km[i - 1] + 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }
    return km;
  }, [routeCoords]);
  const sugFC = useMemo(
    () => suggestionsGeoJSON(props.suggestions ?? [], props.filteredSuggestionIds ?? null, activeFuelCats),
    [props.suggestions, props.filteredSuggestionIds, activeFuelCats],
  );

  const trafficPtFCFull = useMemo(() => trafficPointsGeoJSON(props.traffic ?? null), [props.traffic]);
  const trafficLineFCFull = useMemo(() => trafficLinesGeoJSON(props.traffic ?? null), [props.traffic]);
  const trafficPolyFCFull = useMemo(() => trafficPolygonsGeoJSON(props.traffic ?? null), [props.traffic]);
  const hazardPtFCFull = useMemo(() => hazardPointsGeoJSON(props.hazards ?? null), [props.hazards]);
  const hazardPolyFCFull = useMemo(() => hazardPolygonsGeoJSON(props.hazards ?? null), [props.hazards]);

  // Viewport-culled versions — only features near the visible area
  const trafficPtFC = useCulledFC(trafficPtFCFull, vpBounds);
  const trafficLineFC = useCulledFC(trafficLineFCFull, vpBounds);
  const trafficPolyFC = useCulledFC(trafficPolyFCFull, vpBounds);
  const hazardPtFC = useCulledFC(hazardPtFCFull, vpBounds);
  const hazardPolyFC = useCulledFC(hazardPolyFCFull, vpBounds);

  const userLocFC = useMemo(() => userLocGeoJSON(props.userPosition), [props.userPosition]);
  const headingFC = useMemo(() => headingConeGeoJSON(props.userPosition), [props.userPosition]);

  const fuelFC = useMemo<GeoJSON.FeatureCollection>(() => {
    // Build overlay lookup — per-station prices from government APIs
    // IDs come from different sources (Overpass vs NSW FuelCheck etc.) so match by proximity.
    // Uses a grid spatial index for O(1) nearest-neighbour instead of O(n) linear scan.
    type OvStation = import("@/lib/types/overlays").FuelStationOverlay;
    const overlayStations: OvStation[] = props.fuelOverlay?.stations ?? [];

    const MATCH_THRESHOLD = 0.005; // ~500m in degrees
    const CELL = MATCH_THRESHOLD; // grid cell size matches threshold

    // Build grid index: key → list of overlay stations in that cell
    const grid = new Map<string, OvStation[]>();
    for (const os of overlayStations) {
      const key = `${Math.floor(os.lat / CELL)},${Math.floor(os.lng / CELL)}`;
      const arr = grid.get(key);
      if (arr) arr.push(os); else grid.set(key, [os]);
    }

    function findNearestOverlay(lat: number, lng: number): OvStation | null {
      const cy = Math.floor(lat / CELL);
      const cx = Math.floor(lng / CELL);
      let best: OvStation | null = null;
      let bestDist = MATCH_THRESHOLD;
      // Check 3×3 neighbourhood to handle cell-boundary cases
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bucket = grid.get(`${cy + dy},${cx + dx}`);
          if (!bucket) continue;
          for (const os of bucket) {
            const d = Math.abs(os.lat - lat) + Math.abs(os.lng - lng);
            if (d < bestDist) { bestDist = d; best = os; }
          }
        }
      }
      return best;
    }

    const features: GeoJSON.Feature[] = [];
    const matchedOverlayIds = new Set<string>();

    // 1. Features from FuelAnalysis stations (PlacesPack/OSM), enriched with overlay prices
    const stations = props.fuelStations;
    if (stations) {
      for (const st of stations) {
        const ov = findNearestOverlay(st.lat, st.lng);
        if (ov?.id) matchedOverlayIds.add(ov.id);
        const fuelTypesJson = ov?.fuel_types?.length ? JSON.stringify(ov.fuel_types) : null;
        features.push({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [st.lng, st.lat] },
          properties: {
            id: st.place_id,
            name: st.name,
            km: st.km_along_route,
            snap_m: st.snap_distance_m,
            side: st.side,
            brand: ov?.brand ?? st.brand ?? null,
            address: ov?.address ?? null,
            city_price: ov?.city_price ?? null,
            fuel_types_json: fuelTypesJson,
            is_open: ov?.is_open ?? null,
            open_hours: ov?.open_hours ?? null,
            has_diesel: ov?.has_diesel ?? st.has_diesel ?? false,
            has_unleaded: ov?.has_unleaded ?? st.has_unleaded ?? false,
            has_lpg: ov?.has_lpg ?? st.has_lpg ?? false,
            fuel_level: "ok",
          },
        });
      }
    }

    // Build grid of placed features for O(1) proximity dedup
    const placedGrid = new Map<string, Array<[number, number]>>();
    for (const f of features) {
      const c = (f.geometry as GeoJSON.Point).coordinates;
      const key = `${Math.floor(c[1] / CELL)},${Math.floor(c[0] / CELL)}`;
      const arr = placedGrid.get(key);
      if (arr) arr.push([c[1], c[0]]); else placedGrid.set(key, [[c[1], c[0]]]);
    }

    function isTooClose(lat: number, lng: number): boolean {
      const cy = Math.floor(lat / CELL);
      const cx = Math.floor(lng / CELL);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bucket = placedGrid.get(`${cy + dy},${cx + dx}`);
          if (!bucket) continue;
          for (const [pLat, pLng] of bucket) {
            if (Math.abs(pLat - lat) + Math.abs(pLng - lng) < MATCH_THRESHOLD) return true;
          }
        }
      }
      return false;
    }

    // 2. Government-sourced overlay stations that had no OSM match — these carry
    //    verified live pricing and must not be invisible just because OSM is sparse.
    for (const ov of overlayStations) {
      if (ov.id && matchedOverlayIds.has(ov.id)) continue;
      if (isTooClose(ov.lat, ov.lng)) continue;

      const fuelTypesJson = ov.fuel_types?.length ? JSON.stringify(ov.fuel_types) : null;
      const hasDiesel = ov.has_diesel ?? ov.fuel_types?.some((ft) => ft.fuel_type.toLowerCase().includes("diesel")) ?? false;
      const hasUnleaded = ov.has_unleaded ?? ov.fuel_types?.some((ft) => {
        const t = ft.fuel_type.toLowerCase();
        return t.includes("unleaded") || t.includes("e10") || t.includes("91");
      }) ?? false;
      const hasLpg = ov.has_lpg ?? ov.fuel_types?.some((ft) => ft.fuel_type.toLowerCase().includes("lpg")) ?? false;

      features.push({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [ov.lng, ov.lat] },
        properties: {
          id: ov.id ?? ov.place_id ?? `ov_${ov.lat}_${ov.lng}`,
          name: ov.name,
          km: ov.km_along_route ?? null,
          snap_m: null,
          side: null,
          brand: ov.brand ?? null,
          address: ov.address ?? null,
          city_price: ov.city_price ?? null,
          fuel_types_json: fuelTypesJson,
          is_open: ov.is_open ?? null,
          open_hours: ov.open_hours ?? null,
          has_diesel: hasDiesel,
          has_unleaded: hasUnleaded,
          has_lpg: hasLpg,
          fuel_level: "ok",
          source: ov.source ?? "gov",
        },
      });
    }

    return { type: "FeatureCollection", features };
  }, [props.fuelStations, props.fuelOverlay]);

  const evChargerFC = useMemo<GeoJSON.FeatureCollection>(() => {
    const chargers = props.fuelOverlay?.ev_chargers;
    if (!chargers || chargers.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: chargers.map((c) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
        properties: {
          id: c.id,
          name: c.name,
          operator: c.operator ?? null,
          address: c.address ?? null,
          is_operational: c.is_operational ?? null,
          usage_cost: c.usage_cost ?? null,
          distance_km: c.distance_km ?? null,
          connectors_json: c.connectors?.length ? JSON.stringify(c.connectors) : null,
          connector_count: c.connectors?.reduce((sum, cn) => sum + cn.quantity, 0) ?? 0,
          max_power_kw: c.connectors?.reduce((mx, cn) => Math.max(mx, cn.power_kw ?? 0), 0) ?? 0,
        },
      })),
    };
  }, [props.fuelOverlay?.ev_chargers]);

  const wildlifeFCFull = useMemo(() => wildlifeZonesGeoJSON(props.wildlife), [props.wildlife]);
  const coverageFCFull = useMemo(
    () => coverageGapsLineGeoJSON(props.coverage, routeCoords, routeCumKm),
    [props.coverage, routeCoords, routeCumKm],
  );
  const floodFCFull = useMemo(() => floodGaugesGeoJSON(props.flood), [props.flood]);
  const floodCatchFCFull = useMemo(() => floodCatchmentsGeoJSON(props.flood), [props.flood]);
  const restAreasFCFull = useMemo(() => restAreasGeoJSON(props.restAreas), [props.restAreas]);

  // Viewport-culled versions
  const wildlifeFC = useCulledFC(wildlifeFCFull, vpBounds);
  const coverageFC = useCulledFC(coverageFCFull, vpBounds);
  const floodFC = useCulledFC(floodFCFull, vpBounds);
  const floodCatchFC = useCulledFC(floodCatchFCFull, vpBounds);
  const restAreasFC = useCulledFC(restAreasFCFull, vpBounds);

  /* ── Build popup HTML (for info-only overlays: traffic, hazards, etc.) ── */

  const buildOverlayPopupHtml = useCallback((title: string, severity: string, sevColor: string, description?: string | null) => {
    return `<div style="font-family:inherit;min-width:160px;max-width:260px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:800;color:var(--roam-text);line-height:1.3;letter-spacing:-0.2px">${escapeHtml(title)}</div>
          <span style="display:inline-flex;align-items:center;margin-top:4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:${sevColor};background:color-mix(in srgb, ${sevColor} 12%, transparent);padding:3px 8px;border-radius:8px;">${escapeHtml(
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
      style: { version: 8, sources: {}, layers: [] } as StyleSpecification,
      center: [(props.bbox.minLng + props.bbox.maxLng) / 2, (props.bbox.minLat + props.bbox.maxLat) / 2],
      zoom: 6,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
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
        map.setStyle(rewriteStyleForPMTiles(styleJson as StyleSpecification, origin), { diff: false });
      } catch (e: unknown) {
        console.error("[TripMap] style load failed", e);
      }
    })();

    // Stop click handler
    const registerStopClick = (layerId: string) => {
      map.on("click", layerId, (e: MapLayerMouseEvent) => {
        const id = e?.features?.[0]?.properties?.id;
        if (id) props.onStopPress?.(String(id));
      });
      map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
    };

    // Long press — distinguishes stop-pin long press from blank-map long press.
    // Stop-pin long press fires onStopLongPress (for quick action menu).
    // Blank-map long press fires onMapLongPress (for placing a new stop).
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressPos: { x: number; y: number } | null = null;

    const STOP_LAYERS = [STOPS_SHADOW, STOPS_OUTER, STOPS_INNER, STOP_ICON_LAYER];

    map.getCanvas().addEventListener("pointerdown", (e) => {
      longPressPos = { x: e.clientX, y: e.clientY };
      longPressTimer = setTimeout(() => {
        if (!longPressPos) return;
        const point: [number, number] = [e.offsetX, e.offsetY];
        // Check if pointer is over a stop feature
        const stopFeatures = map.queryRenderedFeatures(point, { layers: STOP_LAYERS });
        const stopId = stopFeatures?.[0]?.properties?.id;
        if (stopId) {
          onStopLongPressRef.current?.(String(stopId), e.clientX, e.clientY);
        } else {
          const lngLat = map.unproject(point);
          props.onMapLongPress?.(lngLat.lat, lngLat.lng);
        }
      }, 500);
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

    map.on("style.load", async () => {
      await Promise.all([loadHeadingArrow(map), loadCategoryIcons(map), loadOverlayIcons(map), loadStopIcons(map), loadFuelIcons(map), loadEvChargerIcons(map), loadNewOverlayIcons(map)]);

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

      /* ── 0. Corridor debug overlay (when enabled) ─────────────────────── */
      addOrUpdateGeoJsonSource(map, CORRIDOR_BBOX_SRC, corridorBboxFC);
      if (!map.getLayer(CORRIDOR_BBOX_FILL)) {
        map.addLayer({
          id: CORRIDOR_BBOX_FILL,
          type: "fill",
          source: CORRIDOR_BBOX_SRC,
          paint: {
            "fill-color": "rgba(255,140,0,0.06)",
            "fill-outline-color": "rgba(255,140,0,0.3)",
          },
        });
      }

      /* ── 1. Route layers — glassmorphic warm outback ─────────────────── */
      addOrUpdateGeoJsonSource(map, ROUTE_SRC, routeFC);

      // Outer glow — wide translucent line simulates blur cheaply on mobile GPUs.
      // Using line-blur is expensive (GPU fragment shader per pixel); a wider
      // low-opacity line gives a similar haze without the mobile perf hit.
      if (!map.getLayer(ROUTE_GLOW)) {
        map.addLayer({
          id: ROUTE_GLOW,
          type: "line",
          source: ROUTE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "rgba(30,100,210,0.12)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 12, 10, 20, 14, 30],
            "line-opacity": 0.55,
          },
        });
      }

      // Frosted casing — translucent warm white for glass edge
      if (!map.getLayer(ROUTE_CASING)) {
        map.addLayer({
          id: ROUTE_CASING,
          type: "line",
          source: ROUTE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "rgba(250,246,239,0.4)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 4, 10, 6, 14, 9],
            "line-opacity": 0.65,
          },
        });
      }

      // Main route line — vivid blue, high contrast for navigation
      if (!map.getLayer(ROUTE_LINE)) {
        map.addLayer({
          id: ROUTE_LINE,
          type: "line",
          source: ROUTE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#4285F4",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2.5, 10, 4.5, 14, 7],
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
          minzoom: 4,
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

      // Traffic line casing - same width as route casing so it perfectly replaces the segment
      if (!map.getLayer(TRAFFIC_LINE_CASING)) {
        map.addLayer({
          id: TRAFFIC_LINE_CASING,
          type: "line",
          source: TRAFFIC_LINE_SRC,
          minzoom: 4,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": [
              "match",
              ["get", "severity"],
              "major",
              "rgba(127,29,29,0.55)",
              "moderate",
              "rgba(120,53,15,0.45)",
              "minor",
              "rgba(30,58,138,0.35)",
              "rgba(30,41,59,0.3)",
            ],
            // Match route casing width so traffic fully replaces the segment
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 3, 10, 5, 14, 7],
            "line-opacity": 0.7,
          },
        });
      }

      if (!map.getLayer(TRAFFIC_LINE_LAYER)) {
        map.addLayer({
          id: TRAFFIC_LINE_LAYER,
          type: "line",
          source: TRAFFIC_LINE_SRC,
          minzoom: 4,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["match", ["get", "severity"], "major", "#ef4444", "moderate", "#f97316", "minor", "#facc15", "#94a3b8"],
            // Match route line width exactly — traffic replaces rather than overlaps
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2, 10, 4, 14, 6],
            "line-opacity": 1,
          },
        });
      }

      // Pulsing halo behind traffic point icons
      if (!map.getLayer(TRAFFIC_PULSE_LAYER)) {
        map.addLayer({
          id: TRAFFIC_PULSE_LAYER,
          type: "circle",
          source: TRAFFIC_POINT_SRC,
          minzoom: 5,
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
          minzoom: 5,
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
      map.on("click", TRAFFIC_POINT_LAYER, (e: MapLayerMouseEvent) => {
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
          minzoom: 3,
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
          minzoom: 3,
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
          minzoom: 4,
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
      map.on("click", HAZARD_ICON_LAYER, (e: MapLayerMouseEvent) => {
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
      map.on("click", TRAFFIC_LINE_LAYER, (e: MapLayerMouseEvent) => {
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
      map.on("click", TRAFFIC_POLY_LAYER, (e: MapLayerMouseEvent) => {
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
      map.on("click", HAZARD_POLY_LAYER, (e: MapLayerMouseEvent) => {
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
      addOrUpdateGeoJsonSource(map, SUG_SRC, sugFC, { cluster: true, clusterMaxZoom: 10, clusterRadius: 30 });

      if (!map.getLayer(SUG_CLUSTER_CIRCLE)) {
        map.addLayer({
          id: SUG_CLUSTER_CIRCLE,
          type: "circle",
          source: SUG_SRC,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": ["step", ["get", "point_count"], "rgba(45,110,64,0.75)", 10, "rgba(45,110,64,0.80)", 30, "rgba(31,82,54,0.85)", 80, "rgba(31,82,54,0.90)"],
            "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 30, 26, 80, 32],
            "circle-stroke-color": "rgba(250,246,239,0.3)",
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
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Bold"],
            "text-size": ["step", ["get", "point_count"], 12, 10, 13, 30, 14.5, 80, 16],
            "text-allow-overlap": true,
          },
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
            "circle-stroke-color": ["case", ["==", ["get", "id"], props.focusedSuggestionId ?? ""], "rgba(250,246,239,0.85)", "rgba(250,246,239,0.22)"],
            "circle-stroke-width": ["case", ["==", ["get", "id"], props.focusedSuggestionId ?? ""], 2.5, 1.5],
            "circle-opacity": 0.82,
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
          paint: { "text-color": "rgba(250,246,239,0.92)", "text-halo-color": "rgba(15,12,8,0.6)", "text-halo-width": 1.4, "text-halo-blur": 0.5 },
        });
      }

      // Cluster click → expand
      map.on("click", SUG_CLUSTER_CIRCLE, (e: MapLayerMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [SUG_CLUSTER_CIRCLE] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id as number | undefined;
        if (clusterId == null) return;
        const source = map.getSource(SUG_SRC) as GeoJSONSource | undefined;
        if (!source?.getClusterExpansionZoom) return;
        source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
          const geom = features[0].geometry;
          if (geom.type === "Point") {
            const coords = geom.coordinates as [number, number];
            map.easeTo({ center: coords, zoom: Math.min(zoom, 16), duration: 350 });
          }
        }).catch(() => {});
      });

      // Suggestion click → open PlaceDetailSheet
      const handleSugClick = (e: MapLayerMouseEvent) => {
        const f = e?.features?.[0];
        if (!f) return;
        const id = f.properties?.id ? String(f.properties.id) : null;
        if (!id) return;
        onSugPressRef.current?.(id);
        onOpenPlaceDetailRef.current?.(id, {
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          name: f.properties?.name ?? undefined,
          category: f.properties?.category ?? undefined,
        });
      };
      map.on("click", SUG_UNCLUSTERED, handleSugClick);
      map.on("click", SUG_ICON_LAYER, handleSugClick);

      map.on("mouseenter", SUG_CLUSTER_CIRCLE, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", SUG_CLUSTER_CIRCLE, () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", SUG_UNCLUSTERED, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", SUG_UNCLUSTERED, () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", SUG_ICON_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", SUG_ICON_LAYER, () => (map.getCanvas().style.cursor = ""));

      /* ── 4b. Suggestion focus highlight (pulsing ring for focused place) ─ */
      addOrUpdateGeoJsonSource(map, SUG_FOCUS_SRC, { type: "FeatureCollection", features: [] });

      if (!map.getLayer(SUG_FOCUS_PING)) {
        map.addLayer({
          id: SUG_FOCUS_PING,
          type: "circle",
          source: SUG_FOCUS_SRC,
          paint: {
            "circle-radius": 0,
            "circle-color": "transparent",
            "circle-stroke-color": ["coalesce", ["get", "color"], "rgba(45,110,64,0.45)"],
            "circle-stroke-width": 2,
            "circle-opacity": 0.8,
          },
        });
      }

      if (!map.getLayer(SUG_FOCUS_RING)) {
        map.addLayer({
          id: SUG_FOCUS_RING,
          type: "circle",
          source: SUG_FOCUS_SRC,
          paint: {
            "circle-radius": 22,
            "circle-color": "rgba(250,246,239,0.06)",
            "circle-stroke-color": "rgba(250,246,239,0.45)",
            "circle-stroke-width": 2,
          },
        });
      }

      if (!map.getLayer(SUG_FOCUS_DOT)) {
        map.addLayer({
          id: SUG_FOCUS_DOT,
          type: "circle",
          source: SUG_FOCUS_SRC,
          paint: {
            "circle-radius": 8,
            "circle-color": ["coalesce", ["get", "color"], "#2d6e40"],
            "circle-stroke-color": "rgba(250,246,239,0.8)",
            "circle-stroke-width": 2.5,
          },
        });
      }

      /* ── 5. Stop layers — glassmorphic frosted markers ────────────────── */
      addOrUpdateGeoJsonSource(map, STOPS_SRC, stopsFC);

      // Drop shadow — warm diffused glow
      if (!map.getLayer(STOPS_SHADOW)) {
        map.addLayer({
          id: STOPS_SHADOW,
          type: "circle",
          source: STOPS_SRC,
          minzoom: 5,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 10, 10, 16, 14, 22, 17, 28],
            "circle-color": ["match", ["get", "type"], "start", "rgba(45,110,64,0.25)", "end", "rgba(181,69,46,0.25)", "via", "rgba(122,61,153,0.25)", "rgba(26,111,166,0.25)"],
            "circle-blur": 0.7,
            "circle-translate": [0, 2],
          },
        });
      }

      // Outer ring — frosted glass border (translucent white with accent stroke)
      if (!map.getLayer(STOPS_OUTER)) {
        map.addLayer({
          id: STOPS_OUTER,
          type: "circle",
          source: STOPS_SRC,
          minzoom: 3,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 6, 6, 8, 10, 12, 14, 16, 17, 22],
            "circle-color": "rgba(250,246,239,0.18)",
            "circle-stroke-color": ["match", ["get", "type"], "start", "rgba(45,110,64,0.7)", "end", "rgba(181,69,46,0.7)", "via", "rgba(122,61,153,0.7)", "rgba(26,111,166,0.7)"],
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 3, 1.5, 10, 2.5, 14, 3.5],
            "circle-opacity": 1,
          },
        });
      }

      // Inner filled circle — frosted accent with glass translucency
      if (!map.getLayer(STOPS_INNER)) {
        map.addLayer({
          id: STOPS_INNER,
          type: "circle",
          source: STOPS_SRC,
          minzoom: 3,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 6, 5.5, 10, 8.5, 14, 12, 17, 16],
            "circle-color": ["match", ["get", "type"], "start", "rgba(45,110,64,0.85)", "end", "rgba(181,69,46,0.85)", "via", "rgba(122,61,153,0.85)", "rgba(26,111,166,0.85)"],
            "circle-stroke-color": "rgba(255,255,255,0.3)",
            "circle-stroke-width": 1,
            "circle-opacity": 1,
          },
        });
      }

      // Pulse — frosted expanding ring on start/end at higher zooms
      if (!map.getLayer(STOP_PULSE)) {
        map.addLayer({
          id: STOP_PULSE,
          type: "circle",
          source: STOPS_SRC,
          minzoom: 8,
          filter: ["any", ["==", ["get", "type"], "start"], ["==", ["get", "type"], "end"]],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 20, 14, 30],
            "circle-color": "transparent",
            "circle-stroke-color": ["match", ["get", "type"], "start", "rgba(45,110,64,0.18)", "end", "rgba(181,69,46,0.18)", "transparent"],
            "circle-stroke-width": 2.5,
            "circle-opacity": 0.7,
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
            "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.55, 14, 0.75, 17, 1.0],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0.5, 13, 0.95] },
        });
      }

      // Labels — warm white on frosted dark halo
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
          paint: { "text-color": "rgba(250,246,239,0.95)", "text-halo-color": "rgba(15,12,8,0.65)", "text-halo-width": 1.8, "text-halo-blur": 0.5 },
        });
      }

      // Focus ring — glassmorphic highlight with translucent warm white
      if (!map.getLayer(STOP_FOCUS_RING)) {
        map.addLayer({
          id: STOP_FOCUS_RING,
          type: "circle",
          source: STOPS_SRC,
          filter: ["==", ["get", "id"], props.focusedStopId ?? ""],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 12, 10, 18, 14, 24, 17, 32],
            "circle-color": "rgba(250,246,239,0.06)",
            "circle-stroke-color": "rgba(250,246,239,0.55)",
            "circle-stroke-width": 2,
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

      // ── Fuel station layers (clustered) ──
      addOrUpdateGeoJsonSource(map, FUEL_SRC, fuelFC, { cluster: true, clusterMaxZoom: 10, clusterRadius: 30 });

      if (!map.getLayer(FUEL_CLUSTER_CIRCLE)) {
        map.addLayer({
          id: FUEL_CLUSTER_CIRCLE,
          type: "circle",
          source: FUEL_SRC,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": ["step", ["get", "point_count"], "rgba(184,135,42,0.75)", 10, "rgba(184,135,42,0.80)", 30, "rgba(160,112,28,0.85)", 80, "rgba(140,95,18,0.90)"],
            "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 30, 26, 80, 32],
            "circle-stroke-color": "rgba(250,246,239,0.3)",
            "circle-stroke-width": 2,
            "circle-opacity": 0.92,
          },
        });
      }
      if (!map.getLayer(FUEL_CLUSTER_COUNT)) {
        map.addLayer({
          id: FUEL_CLUSTER_COUNT,
          type: "symbol",
          source: FUEL_SRC,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Bold"],
            "text-size": ["step", ["get", "point_count"], 12, 10, 13, 30, 14.5, 80, 16],
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#ffffff" },
        });
      }

      if (!map.getLayer(FUEL_CIRCLE_LAYER)) {
        map.addLayer({
          id: FUEL_CIRCLE_LAYER,
          type: "circle",
          source: FUEL_SRC,
          filter: ["!", ["has", "point_count"]],
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
          filter: ["!", ["has", "point_count"]],
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
          filter: ["!", ["has", "point_count"]],
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Open Sans Bold"],
            "text-size": 10,
            "text-offset": [0, 1.8],
            "text-anchor": "top",
            "text-max-width": 8,
          },
          paint: {
            "text-color": "rgba(250,246,239,0.92)",
            "text-halo-color": "rgba(15,12,8,0.6)",
            "text-halo-width": 1.4,
            "text-halo-blur": 0.5,
          },
          minzoom: 9,
        });
      }

      // Fuel cluster click → expand
      map.on("click", FUEL_CLUSTER_CIRCLE, (e: MapLayerMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [FUEL_CLUSTER_CIRCLE] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id as number | undefined;
        if (clusterId == null) return;
        const source = map.getSource(FUEL_SRC) as GeoJSONSource | undefined;
        if (!source?.getClusterExpansionZoom) return;
        source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
          const geom = features[0].geometry;
          if (geom.type === "Point") {
            const coords = geom.coordinates as [number, number];
            map.easeTo({ center: coords, zoom: Math.min(zoom, 16), duration: 350 });
          }
        }).catch(() => {});
      });

      map.on("mouseenter", FUEL_CLUSTER_CIRCLE, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", FUEL_CLUSTER_CIRCLE, () => (map.getCanvas().style.cursor = ""));

      // Individual fuel station click → open PlaceDetailSheet
      map.on("click", FUEL_ICON_LAYER, (e: MapLayerMouseEvent) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const name = p?.name ? String(p.name) : "Fuel Station";
        const fuelId = p?.id ? String(p.id) : `fuel_${e.lngLat.lat}_${e.lngLat.lng}`;

        // Build extra props from feature properties so PlaceDetailSheet can display fuel info
        const extra: Record<string, unknown> = {};
        if (p?.brand) extra.brand = String(p.brand);
        if (p?.open_hours) extra.opening_hours = String(p.open_hours);
        if (p?.has_unleaded) extra.has_unleaded = true;
        if (p?.has_diesel) extra.has_diesel = true;
        if (p?.has_lpg) extra.has_lpg = true;
        // Parse fuel_types_json into fuel_types array for PlaceDetailSheet
        try {
          const raw = p?.fuel_types_json;
          if (typeof raw === "string" && raw.length > 2) {
            const parsed = JSON.parse(raw) as { fuel_type: string; price_cents: number }[];
            extra.fuel_types = parsed.map((fp) => fp.fuel_type);
            extra.fuel_prices_json = raw;
          }
        } catch {}

        onOpenPlaceDetailRef.current?.(fuelId, {
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          name,
          category: "fuel",
          extra,
        });
      });
      map.on("mouseenter", FUEL_ICON_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", FUEL_ICON_LAYER, () => (map.getCanvas().style.cursor = ""));

      // ── EV charger layers (clustered, blue lightning icons) ──
      addOrUpdateGeoJsonSource(map, EV_SRC, evChargerFC, { cluster: true, clusterMaxZoom: 10, clusterRadius: 30 });

      if (!map.getLayer(EV_CLUSTER_CIRCLE)) {
        map.addLayer({
          id: EV_CLUSTER_CIRCLE,
          type: "circle",
          source: EV_SRC,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#2563eb",
            "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 22],
            "circle-opacity": 0.85,
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1.5,
          },
        });
        map.addLayer({
          id: EV_CLUSTER_COUNT,
          type: "symbol",
          source: EV_SRC,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 11,
          },
          paint: { "text-color": "#fff" },
        });
        map.addLayer({
          id: EV_ICON_LAYER,
          type: "symbol",
          source: EV_SRC,
          filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-image": "roam-ev-charger",
            "icon-size": 1,
            "icon-allow-overlap": true,
            "icon-ignore-placement": false,
          },
          minzoom: 6,
        });
        map.addLayer({
          id: EV_LABEL_LAYER,
          type: "symbol",
          source: EV_SRC,
          filter: ["!", ["has", "point_count"]],
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 10,
            "text-offset": [0, 1.8],
            "text-anchor": "top",
            "text-max-width": 8,
          },
          paint: { "text-color": "#1a1a1a", "text-halo-color": "#fff", "text-halo-width": 1.2 },
          minzoom: 9,
        });
      }

      // EV cluster click → expand
      map.on("click", EV_CLUSTER_CIRCLE, (e: MapLayerMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [EV_CLUSTER_CIRCLE] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id as number | undefined;
        if (clusterId == null) return;
        const source = map.getSource(EV_SRC) as GeoJSONSource | undefined;
        if (!source?.getClusterExpansionZoom) return;
        source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
          const geom = features[0].geometry;
          if (geom.type === "Point") {
            const coords = geom.coordinates as [number, number];
            map.easeTo({ center: coords, zoom: Math.min(zoom, 16), duration: 350 });
          }
        }).catch(() => {});
      });

      map.on("mouseenter", EV_CLUSTER_CIRCLE, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", EV_CLUSTER_CIRCLE, () => (map.getCanvas().style.cursor = ""));

      // EV charger click → open PlaceDetailSheet
      map.on("click", EV_ICON_LAYER, (e: MapLayerMouseEvent) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const name = p?.name ? String(p.name) : "EV Charger";
        const evId = p?.id ? String(p.id) : `ev_${e.lngLat.lat}_${e.lngLat.lng}`;

        // Build extra props from feature properties so PlaceDetailSheet can display EV info
        const extra: Record<string, unknown> = {};
        if (p?.operator) extra.operator = String(p.operator);
        if (p?.address) extra.address = String(p.address);
        if (p?.max_power_kw) extra.max_power_kw = p.max_power_kw;
        if (p?.connector_count) extra.connector_count = p.connector_count;
        if (p?.usage_cost) extra.usage_cost = String(p.usage_cost);
        if (p?.is_operational != null) extra.is_operational = p.is_operational;
        // Parse connectors from JSON for the sheet
        try {
          const raw = p?.connectors_json;
          if (typeof raw === "string" && raw.length > 2) {
            const parsed = JSON.parse(raw) as { type: string; power_kw?: number | null; quantity: number }[];
            extra.socket_types = parsed.map((cn) => cn.type);
            extra.connectors_json = raw;
          }
        } catch {}

        onOpenPlaceDetailRef.current?.(evId, {
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          name,
          category: "ev_charger",
          extra,
        });
      });
      map.on("mouseenter", EV_ICON_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", EV_ICON_LAYER, () => (map.getCanvas().style.cursor = ""));

      /* ── Wildlife zones (amber fill + risk label) ───────────────────── */
      addOrUpdateGeoJsonSource(map, WILDLIFE_SRC, wildlifeFC);

      if (!map.getLayer(WILDLIFE_FILL_LAYER)) {
        map.addLayer({
          id: WILDLIFE_FILL_LAYER,
          type: "circle",
          source: WILDLIFE_SRC,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 16, 12, 28, 16, 44],
            "circle-color": [
              "match", ["get", "risk_level"],
              "high",   "rgba(245,158,11,0.28)",
              "medium", "rgba(234,179,8,0.18)",
              "low",    "rgba(253,224,71,0.12)",
              "rgba(253,224,71,0.08)",
            ],
            "circle-stroke-color": [
              "match", ["get", "risk_level"],
              "high",   "rgba(245,158,11,0.65)",
              "medium", "rgba(234,179,8,0.45)",
              "low",    "rgba(253,224,71,0.35)",
              "rgba(253,224,71,0.25)",
            ],
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.85,
          },
        });
      }

      if (!map.getLayer(WILDLIFE_LABEL_LAYER)) {
        map.addLayer({
          id: WILDLIFE_LABEL_LAYER,
          type: "symbol",
          source: WILDLIFE_SRC,
          layout: {
            "text-field": ["upcase", ["get", "risk_level"]],
            "text-font": ["Noto Sans Bold"],
            "text-size": 9,
            "text-offset": [0, 2.2],
            "text-anchor": "top",
          },
          paint: {
            "text-color": "#92400e",
            "text-halo-color": "rgba(255,255,255,0.85)",
            "text-halo-width": 1.5,
          },
          minzoom: 9,
        });
      }

      map.on("click", WILDLIFE_FILL_LAYER, (e: MapLayerMouseEvent) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const title = p?.species_guess ?? p?.message ?? `Wildlife risk: ${p?.risk_level ?? "unknown"}`;
        const photoHtml = p?.photo
          ? `<img src="${escapeHtml(String(p.photo))}" alt="${escapeHtml(title)}" style="width:100%;max-height:120px;object-fit:cover;border-radius:6px;margin-top:6px;display:block" loading="lazy" />`
          : "";
        const countLine = p?.occurrence_count > 0
          ? `<div style="margin-top:4px;font-size:11px;color:var(--roam-text-muted)">${escapeHtml(String(p.occurrence_count))} observation${p.occurrence_count !== 1 ? "s" : ""} nearby</div>`
          : "";
        const attrLine = p?.attribution
          ? `<div style="margin-top:4px;font-size:9px;color:var(--roam-text-muted);line-height:1.3">${escapeHtml(String(p.attribution))}</div>`
          : "";
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup" })
            .setLngLat(e.lngLat)
            .setHTML(buildOverlayPopupHtml(title, p?.risk_level ?? "unknown", "#f59e0b") + photoHtml + countLine + attrLine)
            .addTo(map);
        } catch {}
      });
      map.on("mouseenter", WILDLIFE_FILL_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", WILDLIFE_FILL_LAYER, () => (map.getCanvas().style.cursor = ""));

      /* ── Coverage gaps (line overlay on route) ──────────────────────── */
      addOrUpdateGeoJsonSource(map, COVERAGE_SRC, coverageFC);

      if (!map.getLayer(COVERAGE_LINE_LAYER)) {
        map.addLayer({
          id: COVERAGE_LINE_LAYER,
          type: "line",
          source: COVERAGE_SRC,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": [
              "match", ["get", "signal_class"],
              "no_coverage", "#ef4444",
              "weak",        "#f97316",
              "voice_only",  "#eab308",
              "#64748b",
            ],
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 5, 12, 8, 16, 12],
            "line-opacity": 0.75,
            "line-dasharray": [3, 2],
            "line-offset": 6,
          },
        });
      }

      map.on("click", COVERAGE_LINE_LAYER, (e: MapLayerMouseEvent) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const sevColor = p?.signal_class === "no_coverage" ? "#ef4444" : p?.signal_class === "weak" ? "#f97316" : "#eab308";
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup" })
            .setLngLat(e.lngLat)
            .setHTML(buildOverlayPopupHtml(p?.message ?? "Coverage gap", p?.signal_class ?? "unknown", sevColor))
            .addTo(map);
        } catch {}
      });
      map.on("mouseenter", COVERAGE_LINE_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", COVERAGE_LINE_LAYER, () => (map.getCanvas().style.cursor = ""));

      /* ── Flood catchment polygons (fill + outline) ────────────────── */
      addOrUpdateGeoJsonSource(map, FLOOD_CATCH_SRC, floodCatchFC);

      if (!map.getLayer(FLOOD_CATCH_FILL)) {
        map.addLayer({
          id: FLOOD_CATCH_FILL,
          type: "fill",
          source: FLOOD_CATCH_SRC,
          paint: {
            "fill-color": [
              "match", ["get", "level"],
              "warning", "rgba(239,68,68,0.15)",
              "rgba(245,158,11,0.12)", // watch
            ],
            "fill-opacity": 0.6,
          },
        });
      }

      if (!map.getLayer(FLOOD_CATCH_LINE)) {
        map.addLayer({
          id: FLOOD_CATCH_LINE,
          type: "line",
          source: FLOOD_CATCH_SRC,
          paint: {
            "line-color": [
              "match", ["get", "level"],
              "warning", "#ef4444",
              "#f59e0b", // watch
            ],
            "line-width": 1.5,
            "line-opacity": 0.7,
          },
        });
      }

      map.on("click", FLOOD_CATCH_FILL, (e: MapLayerMouseEvent) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const lev = p?.level ?? "watch";
        const color = lev === "warning" ? "#ef4444" : "#f59e0b";
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup" })
            .setLngLat(e.lngLat)
            .setHTML(buildOverlayPopupHtml(
              `Flood ${lev.charAt(0).toUpperCase() + lev.slice(1)}`,
              p?.dist_name ?? "",
              color,
            ))
            .addTo(map);
        } catch {}
      });

      /* ── Flood gauges (circle markers) ──────────────────────────────── */
      addOrUpdateGeoJsonSource(map, FLOOD_SRC, floodFC);

      if (!map.getLayer(FLOOD_CIRCLE_LAYER)) {
        map.addLayer({
          id: FLOOD_CIRCLE_LAYER,
          type: "circle",
          source: FLOOD_SRC,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 7, 12, 11, 16, 14],
            "circle-color": [
              "match", ["get", "severity"],
              "major",    "#ef4444",
              "moderate", "#f97316",
              "minor",    "#eab308",
              "#3b82f6",
            ],
            "circle-stroke-color": "rgba(255,255,255,0.7)",
            "circle-stroke-width": 2,
            "circle-opacity": 0.9,
          },
        });
      }

      if (!map.getLayer(FLOOD_LABEL_LAYER)) {
        map.addLayer({
          id: FLOOD_LABEL_LAYER,
          type: "symbol",
          source: FLOOD_SRC,
          layout: {
            "text-field": ["get", "station_name"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 10,
            "text-offset": [0, 1.6],
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

      map.on("click", FLOOD_CIRCLE_LAYER, (e: MapLayerMouseEvent) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const sevColor = p?.severity === "major" ? "#ef4444" : p?.severity === "moderate" ? "#f97316" : p?.severity === "minor" ? "#eab308" : "#3b82f6";
        const heightStr = p?.latest_height_m != null ? ` — ${Number(p.latest_height_m).toFixed(2)}m` : "";
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup" })
            .setLngLat(e.lngLat)
            .setHTML(buildOverlayPopupHtml(`${p?.station_name ?? "Flood gauge"}${heightStr}`, `${p?.severity ?? "unknown"} (${p?.trend ?? "?"})`, sevColor))
            .addTo(map);
        } catch {}
      });
      map.on("mouseenter", FLOOD_CIRCLE_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", FLOOD_CIRCLE_LAYER, () => (map.getCanvas().style.cursor = ""));

      /* ── Rest area markers ───────────────────────────────────────────── */
      addOrUpdateGeoJsonSource(map, REST_AREAS_SRC, restAreasFC);

      if (!map.getLayer(REST_AREAS_ICON_LAYER)) {
        map.addLayer({
          id: REST_AREAS_ICON_LAYER,
          type: "circle",
          source: REST_AREAS_SRC,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 12, 9, 16, 12],
            "circle-color": "#6366f1",
            "circle-stroke-color": "rgba(255,255,255,0.7)",
            "circle-stroke-width": 2,
            "circle-opacity": 0.88,
          },
        });
      }

      if (!map.getLayer(REST_AREAS_LABEL_LAYER)) {
        map.addLayer({
          id: REST_AREAS_LABEL_LAYER,
          type: "symbol",
          source: REST_AREAS_SRC,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Open Sans Bold"],
            "text-size": 10,
            "text-offset": [0, 1.6],
            "text-anchor": "top",
            "text-max-width": 8,
          },
          paint: {
            "text-color": "#1a1a1a",
            "text-halo-color": "rgba(255,255,255,0.9)",
            "text-halo-width": 1.5,
          },
          minzoom: 10,
        });
      }

      map.on("click", REST_AREAS_ICON_LAYER, (e: MapLayerMouseEvent) => {
        const f = e?.features?.[0];
        if (!f) return;
        const p = f.properties;
        const label = p?.name ? String(p.name) : "Rest Area";
        const restId = p?.id ? String(p.id) : `rest_${e.lngLat.lat}_${e.lngLat.lng}`;

        const extra: Record<string, unknown> = {};
        if (p?.type) extra.rest_area_type = String(p.type);
        if (p?.facilities_summary) extra.description = String(p.facilities_summary);

        onOpenPlaceDetailRef.current?.(restId, {
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          name: label,
          category: "rest_area",
          extra,
        });
      });
      map.on("mouseenter", REST_AREAS_ICON_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", REST_AREAS_ICON_LAYER, () => (map.getCanvas().style.cursor = ""));

      // Restore overlay visibility after layers are (re)created
      applyAllOverlayVisibility(map, overlayVisRef.current);

      // Initial fit
      try {
        map.fitBounds(bboxToBounds(props.bbox), { padding: 60, duration: 0 });
      } catch {}

      setStyleReady(true);
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
      if (sugFocusRaf.current) cancelAnimationFrame(sugFocusRaf.current);
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

  /* ── Resize observer — keeps MapLibre canvas sized to its container ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
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
        setStyleReady(false);
        map.setStyle(rewriteStyleForPMTiles(styleJson as StyleSpecification, origin), { diff: false });
      } catch (e: unknown) {
        console.error("[TripMap] style load failed", e);
      }
    })();
  }, [props.styleId]);

  /* ── Data updates ───────────────────────────────────────────────────── */
  useEffect(() => {
    const s = mapRef.current?.getSource(CORRIDOR_BBOX_SRC) as GeoJSONSource | undefined;
    s?.setData(corridorBboxFC);
  }, [corridorBboxFC]);
  useEffect(() => {
    const s = mapRef.current?.getSource(ROUTE_SRC) as GeoJSONSource | undefined;
    s?.setData(routeFC);
  }, [routeFC]);
  useEffect(() => {
    const s = mapRef.current?.getSource(STOPS_SRC) as GeoJSONSource | undefined;
    s?.setData(stopsFC);
  }, [stopsFC]);

  useEffect(() => {
    const s = mapRef.current?.getSource(FUEL_SRC) as GeoJSONSource | undefined;
    s?.setData(fuelFC);
  }, [fuelFC]);

  useEffect(() => {
    const s = mapRef.current?.getSource(EV_SRC) as GeoJSONSource | undefined;
    s?.setData(evChargerFC);
  }, [evChargerFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(STOP_FOCUS_RING)) map.setFilter(STOP_FOCUS_RING, ["==", ["get", "id"], props.focusedStopId ?? ""]);
  }, [props.focusedStopId]);

  /* ── Toggle overlay layer visibility per category ─────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyAllOverlayVisibility(map, overlayVis);
  }, [overlayVis]);

  useEffect(() => {
    const s = mapRef.current?.getSource(SUG_SRC) as GeoJSONSource | undefined;
    s?.setData(sugFC);
  }, [sugFC]);

  /* ── Update suggestion layer focus styling reactively ─────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const fid = props.focusedSuggestionId ?? "";
    try {
      if (map.getLayer(SUG_UNCLUSTERED)) {
        map.setPaintProperty(SUG_UNCLUSTERED, "circle-stroke-color", [
          "case", ["==", ["get", "id"], fid], "rgba(255,255,255,0.95)", "rgba(0,0,0,0.3)",
        ]);
        map.setPaintProperty(SUG_UNCLUSTERED, "circle-stroke-width", [
          "case", ["==", ["get", "id"], fid], 3, 1.2,
        ]);
        // Make focused marker bigger
        map.setPaintProperty(SUG_UNCLUSTERED, "circle-radius", [
          "interpolate", ["linear"], ["zoom"],
          8, ["case", ["==", ["get", "id"], fid], 10,
            ["match", ["get", "sizeClass"], "lg", 6, "md", 4, 3]],
          12, ["case", ["==", ["get", "id"], fid], 14,
            ["match", ["get", "sizeClass"], "lg", 9, "md", 7, 5]],
          16, ["case", ["==", ["get", "id"], fid], 18,
            ["match", ["get", "sizeClass"], "lg", 12, "md", 10, 8]],
        ]);
      }
    } catch {}
  }, [props.focusedSuggestionId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const s1 = map.getSource(TRAFFIC_POINT_SRC) as GeoJSONSource | undefined;
    s1?.setData(trafficPtFC);
    const s2 = map.getSource(TRAFFIC_LINE_SRC) as GeoJSONSource | undefined;
    s2?.setData(trafficLineFC);
    const s3 = map.getSource(TRAFFIC_POLY_SRC) as GeoJSONSource | undefined;
    s3?.setData(trafficPolyFC);
  }, [trafficPtFC, trafficLineFC, trafficPolyFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const s1 = map.getSource(HAZARD_POINT_SRC) as GeoJSONSource | undefined;
    s1?.setData(hazardPtFC);
    const s2 = map.getSource(HAZARD_POLY_SRC) as GeoJSONSource | undefined;
    s2?.setData(hazardPolyFC);
  }, [hazardPtFC, hazardPolyFC]);

  useEffect(() => {
    (mapRef.current?.getSource(WILDLIFE_SRC) as GeoJSONSource | undefined)?.setData(wildlifeFC);
  }, [wildlifeFC]);
  useEffect(() => {
    (mapRef.current?.getSource(COVERAGE_SRC) as GeoJSONSource | undefined)?.setData(coverageFC);
  }, [coverageFC]);
  useEffect(() => {
    (mapRef.current?.getSource(FLOOD_SRC) as GeoJSONSource | undefined)?.setData(floodFC);
  }, [floodFC]);
  useEffect(() => {
    (mapRef.current?.getSource(FLOOD_CATCH_SRC) as GeoJSONSource | undefined)?.setData(floodCatchFC);
  }, [floodCatchFC]);
  useEffect(() => {
    (mapRef.current?.getSource(REST_AREAS_SRC) as GeoJSONSource | undefined)?.setData(restAreasFC);
  }, [restAreasFC]);

  /* ── Weather overlay ────────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

    if (!props.weather?.points?.length) {
      const src = map.getSource(WEATHER_SRC) as GeoJSONSource | undefined;
      if (src) src.setData(emptyFC);
      return;
    }

    const weatherFC: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: props.weather.points.map((pt) => {
        const temp = pt.temperature_c;
        const precip = pt.precipitation_probability_pct;
        const wind = pt.wind_speed_kmh;

        let color =
          precip < 20  ? "#22c55e" :
          precip < 50  ? "#eab308" :
          precip < 80  ? "#f97316" :
                         "#3b82f6";
        if (wind > 60) color = "#ef4444";

        return {
          type: "Feature" as const,
          properties: {
            temp,
            precip_prob: precip,
            wind,
            code: pt.weather_code,
            is_twilight: pt.is_twilight_danger,
            has_rain: precip > 40,
            has_wind: wind > 50,
            color,
          },
          geometry: { type: "Point" as const, coordinates: [pt.lng, pt.lat] },
        };
      }),
    };

    // Determine a layer that exists in the stops group to use as beforeId
    const beforeId = (() => {
      for (const id of [STOPS_SHADOW, STOPS_OUTER, STOPS_INNER]) {
        if (map.getLayer(id)) return id;
      }
      return undefined;
    })();

    const culledWeatherFC = vpBoundsRef.current ? cullFeatures(weatherFC, vpBoundsRef.current) : weatherFC;
    const existingSrc = map.getSource(WEATHER_SRC) as GeoJSONSource | undefined;
    if (existingSrc) {
      existingSrc.setData(culledWeatherFC);
    } else {
      map.addSource(WEATHER_SRC, { type: "geojson", data: culledWeatherFC, cluster: false });

      map.addLayer({
        id: WEATHER_DOT_LAYER,
        type: "circle",
        source: WEATHER_SRC,
        minzoom: 7,
        paint: {
          "circle-radius": 7,
          "circle-color": ["get", "color"],
          "circle-stroke-color": "rgba(255,255,255,0.7)",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.85,
        },
      }, beforeId);

      map.addLayer({
        id: WEATHER_LABEL_LAYER,
        type: "symbol",
        source: WEATHER_SRC,
        minzoom: 8,
        layout: {
          "text-field": ["concat", ["to-string", ["round", ["get", "temp"]]], "°"],
          "text-size": 10,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.6)",
          "text-halo-width": 1,
        },
      }, beforeId);

      // Apply current visibility
      const v = overlayVisRef.current.weather ? "visible" : "none";
      if (map.getLayer(WEATHER_DOT_LAYER)) map.setLayoutProperty(WEATHER_DOT_LAYER, "visibility", v);
      if (map.getLayer(WEATHER_LABEL_LAYER)) map.setLayoutProperty(WEATHER_LABEL_LAYER, "visibility", v);
    }
  }, [props.weather, styleReady, vpBounds]);

  /* ── Emergency services overlay ──────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    if (!props.emergency?.facilities?.length) {
      const src = map.getSource(EMERGENCY_SRC) as GeoJSONSource | undefined;
      if (src) src.setData(emptyFC);
      return;
    }
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: props.emergency.facilities.map((f) => ({
        type: "Feature" as const,
        properties: { id: f.id, name: f.name, facility_type: f.facility_type, suburb: f.suburb ?? "" },
        geometry: { type: "Point" as const, coordinates: [f.lng, f.lat] },
      })),
    };
    const culledFC = vpBoundsRef.current ? cullFeatures(fc, vpBoundsRef.current) : fc;
    const beforeId = (() => { for (const id of [STOPS_SHADOW, STOPS_OUTER]) { if (map.getLayer(id)) return id; } return undefined; })();
    const existingSrc = map.getSource(EMERGENCY_SRC) as GeoJSONSource | undefined;
    if (existingSrc) { existingSrc.setData(culledFC); } else {
      map.addSource(EMERGENCY_SRC, { type: "geojson", data: culledFC, cluster: false });
      map.addLayer({ id: EMERGENCY_ICON_LAYER, type: "circle", source: EMERGENCY_SRC, minzoom: 8,
        paint: { "circle-radius": 6, "circle-color": ["match", ["get", "facility_type"], "hospital", "#ef4444", "police", "#3b82f6", "fire", "#f97316", "ambulance", "#22c55e", "ses", "#eab308", "#9ca3af"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-opacity": 0.9 },
      }, beforeId);
      map.addLayer({ id: EMERGENCY_LABEL_LAYER, type: "symbol", source: EMERGENCY_SRC, minzoom: 10,
        layout: { "text-field": ["get", "name"], "text-size": 10, "text-offset": [0, 1.4], "text-anchor": "top", "text-max-width": 10 },
        paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.6)", "text-halo-width": 1 },
      }, beforeId);
      const v = overlayVisRef.current.emergency ? "visible" : "none";
      if (map.getLayer(EMERGENCY_ICON_LAYER)) map.setLayoutProperty(EMERGENCY_ICON_LAYER, "visibility", v);
      if (map.getLayer(EMERGENCY_LABEL_LAYER)) map.setLayoutProperty(EMERGENCY_LABEL_LAYER, "visibility", v);
    }
  }, [props.emergency, styleReady, vpBounds]);

  /* ── Heritage overlay ────────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    if (!props.heritage?.sites?.length) {
      const src = map.getSource(HERITAGE_SRC) as GeoJSONSource | undefined;
      if (src) src.setData(emptyFC);
      return;
    }
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: props.heritage.sites.filter((s) => s.lat != null && s.lng != null).map((s) => ({
        type: "Feature" as const,
        properties: { id: s.id, name: s.name, site_type: s.site_type },
        geometry: { type: "Point" as const, coordinates: [s.lng!, s.lat!] },
      })),
    };
    const culledFC = vpBoundsRef.current ? cullFeatures(fc, vpBoundsRef.current) : fc;
    const beforeId = (() => { for (const id of [STOPS_SHADOW, STOPS_OUTER]) { if (map.getLayer(id)) return id; } return undefined; })();
    const existingSrc = map.getSource(HERITAGE_SRC) as GeoJSONSource | undefined;
    if (existingSrc) { existingSrc.setData(culledFC); } else {
      map.addSource(HERITAGE_SRC, { type: "geojson", data: culledFC, cluster: false });
      map.addLayer({ id: HERITAGE_ICON_LAYER, type: "circle", source: HERITAGE_SRC, minzoom: 8,
        paint: { "circle-radius": 6, "circle-color": "#a855f7", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-opacity": 0.85 },
      }, beforeId);
      const v = overlayVisRef.current.heritage ? "visible" : "none";
      if (map.getLayer(HERITAGE_ICON_LAYER)) map.setLayoutProperty(HERITAGE_ICON_LAYER, "visibility", v);
    }
  }, [props.heritage, styleReady, vpBounds]);

  /* ── Air Quality overlay ─────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    if (!props.airQuality?.points?.length) {
      const src = map.getSource(AQI_SRC) as GeoJSONSource | undefined;
      if (src) src.setData(emptyFC);
      return;
    }
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: props.airQuality.points.map((pt) => {
        const color = pt.aqi <= 1 ? "#22c55e" : pt.aqi <= 2 ? "#eab308" : pt.aqi <= 3 ? "#f97316" : pt.aqi <= 4 ? "#ef4444" : "#7c3aed";
        return {
          type: "Feature" as const,
          properties: { aqi: pt.aqi, aqi_label: pt.aqi_label, color },
          geometry: { type: "Point" as const, coordinates: [pt.lng, pt.lat] },
        };
      }),
    };
    const culledFC = vpBoundsRef.current ? cullFeatures(fc, vpBoundsRef.current) : fc;
    const beforeId = (() => { for (const id of [STOPS_SHADOW, STOPS_OUTER]) { if (map.getLayer(id)) return id; } return undefined; })();
    const existingSrc = map.getSource(AQI_SRC) as GeoJSONSource | undefined;
    if (existingSrc) { existingSrc.setData(culledFC); } else {
      map.addSource(AQI_SRC, { type: "geojson", data: culledFC, cluster: false });
      map.addLayer({ id: AQI_DOT_LAYER, type: "circle", source: AQI_SRC, minzoom: 7,
        paint: { "circle-radius": 7, "circle-color": ["get", "color"], "circle-stroke-color": "rgba(255,255,255,0.7)", "circle-stroke-width": 1.5, "circle-opacity": 0.85 },
      }, beforeId);
      map.addLayer({ id: AQI_LABEL_LAYER, type: "symbol", source: AQI_SRC, minzoom: 8,
        layout: { "text-field": ["get", "aqi_label"], "text-size": 9, "text-offset": [0, 1.4], "text-anchor": "top" },
        paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.6)", "text-halo-width": 1 },
      }, beforeId);
      const v = overlayVisRef.current.air_quality ? "visible" : "none";
      if (map.getLayer(AQI_DOT_LAYER)) map.setLayoutProperty(AQI_DOT_LAYER, "visibility", v);
      if (map.getLayer(AQI_LABEL_LAYER)) map.setLayoutProperty(AQI_LABEL_LAYER, "visibility", v);
    }
  }, [props.airQuality, styleReady, vpBounds]);

  /* ── Bushfire overlay ────────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    if (!props.bushfire?.incidents?.length && !props.bushfire?.hotspots?.length) {
      const src1 = map.getSource(BUSHFIRE_SRC) as GeoJSONSource | undefined;
      if (src1) src1.setData(emptyFC);
      const src2 = map.getSource(BUSHFIRE_HOTSPOT_SRC) as GeoJSONSource | undefined;
      if (src2) src2.setData(emptyFC);
      return;
    }
    const incidentFC: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: (props.bushfire?.incidents ?? []).map((inc) => ({
        type: "Feature" as const,
        properties: { id: inc.id, title: inc.title, alert_level: inc.alert_level ?? "unknown", status: inc.status ?? "" },
        geometry: { type: "Point" as const, coordinates: [inc.lng, inc.lat] },
      })),
    };
    const hotspotFC: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: (props.bushfire?.hotspots ?? []).map((h) => ({
        type: "Feature" as const,
        properties: { brightness: h.brightness ?? 0, confidence: h.confidence ?? "nominal" },
        geometry: { type: "Point" as const, coordinates: [h.lng, h.lat] },
      })),
    };
    const culledIncidentFC = vpBoundsRef.current ? cullFeatures(incidentFC, vpBoundsRef.current) : incidentFC;
    const culledHotspotFC = vpBoundsRef.current ? cullFeatures(hotspotFC, vpBoundsRef.current) : hotspotFC;
    const beforeId = (() => { for (const id of [STOPS_SHADOW, STOPS_OUTER]) { if (map.getLayer(id)) return id; } return undefined; })();
    const s1 = map.getSource(BUSHFIRE_SRC) as GeoJSONSource | undefined;
    if (s1) { s1.setData(culledIncidentFC); } else {
      map.addSource(BUSHFIRE_SRC, { type: "geojson", data: culledIncidentFC, cluster: false });
      map.addLayer({ id: BUSHFIRE_ICON_LAYER, type: "circle", source: BUSHFIRE_SRC, minzoom: 6,
        paint: { "circle-radius": 8, "circle-color": ["match", ["get", "alert_level"], "Emergency Warning", "#dc2626", "Watch and Act", "#f97316", "Advice", "#eab308", "#f97316"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-opacity": 0.9 },
      }, beforeId);
    }
    const s2 = map.getSource(BUSHFIRE_HOTSPOT_SRC) as GeoJSONSource | undefined;
    if (s2) { s2.setData(culledHotspotFC); } else {
      map.addSource(BUSHFIRE_HOTSPOT_SRC, { type: "geojson", data: culledHotspotFC, cluster: false });
      map.addLayer({ id: BUSHFIRE_HOTSPOT_LAYER, type: "circle", source: BUSHFIRE_HOTSPOT_SRC, minzoom: 7,
        paint: { "circle-radius": 4, "circle-color": "#ef4444", "circle-stroke-color": "rgba(255,255,255,0.5)", "circle-stroke-width": 1, "circle-opacity": 0.7 },
      }, beforeId);
    }
    const v = overlayVisRef.current.bushfire ? "visible" : "none";
    if (map.getLayer(BUSHFIRE_ICON_LAYER)) map.setLayoutProperty(BUSHFIRE_ICON_LAYER, "visibility", v);
    if (map.getLayer(BUSHFIRE_HOTSPOT_LAYER)) map.setLayoutProperty(BUSHFIRE_HOTSPOT_LAYER, "visibility", v);
  }, [props.bushfire, styleReady, vpBounds]);

  /* ── Speed Cameras + Black Spots overlay ──────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    if (!props.speedCameras?.cameras?.length && !props.speedCameras?.black_spots?.length) {
      const src1 = map.getSource(CAMERAS_SRC) as GeoJSONSource | undefined;
      if (src1) src1.setData(emptyFC);
      const src2 = map.getSource(BLACKSPOT_SRC) as GeoJSONSource | undefined;
      if (src2) src2.setData(emptyFC);
      return;
    }
    const camerasFC: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: (props.speedCameras?.cameras ?? []).map((c) => ({
        type: "Feature" as const,
        properties: { id: c.id, camera_type: c.camera_type, road: c.road ?? "", is_school_zone: c.is_school_zone },
        geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
      })),
    };
    const blackspotFC: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: (props.speedCameras?.black_spots ?? []).map((b) => ({
        type: "Feature" as const,
        properties: { id: b.id, road: b.road ?? "", crash_count: b.crash_count ?? 0 },
        geometry: { type: "Point" as const, coordinates: [b.lng, b.lat] },
      })),
    };
    const culledCamerasFC = vpBoundsRef.current ? cullFeatures(camerasFC, vpBoundsRef.current) : camerasFC;
    const culledBlackspotFC = vpBoundsRef.current ? cullFeatures(blackspotFC, vpBoundsRef.current) : blackspotFC;
    const beforeId = (() => { for (const id of [STOPS_SHADOW, STOPS_OUTER]) { if (map.getLayer(id)) return id; } return undefined; })();
    const s1 = map.getSource(CAMERAS_SRC) as GeoJSONSource | undefined;
    if (s1) { s1.setData(culledCamerasFC); } else {
      map.addSource(CAMERAS_SRC, { type: "geojson", data: culledCamerasFC, cluster: false });
      map.addLayer({ id: CAMERAS_ICON_LAYER, type: "circle", source: CAMERAS_SRC, minzoom: 9,
        paint: { "circle-radius": 5, "circle-color": "#6366f1", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-opacity": 0.9 },
      }, beforeId);
    }
    const s2 = map.getSource(BLACKSPOT_SRC) as GeoJSONSource | undefined;
    if (s2) { s2.setData(culledBlackspotFC); } else {
      map.addSource(BLACKSPOT_SRC, { type: "geojson", data: culledBlackspotFC, cluster: false });
      map.addLayer({ id: BLACKSPOT_LAYER, type: "circle", source: BLACKSPOT_SRC, minzoom: 9,
        paint: { "circle-radius": 5, "circle-color": "#dc2626", "circle-stroke-color": "#fff", "circle-stroke-width": 1, "circle-opacity": 0.8 },
      }, beforeId);
    }
    const v = overlayVisRef.current.cameras ? "visible" : "none";
    if (map.getLayer(CAMERAS_ICON_LAYER)) map.setLayoutProperty(CAMERAS_ICON_LAYER, "visibility", v);
    if (map.getLayer(BLACKSPOT_LAYER)) map.setLayoutProperty(BLACKSPOT_LAYER, "visibility", v);
  }, [props.speedCameras, styleReady, vpBounds]);

  /* ── Toilets overlay ─────────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    if (!props.toilets?.toilets?.length) {
      const src = map.getSource(TOILETS_SRC) as GeoJSONSource | undefined;
      if (src) src.setData(emptyFC);
      return;
    }
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: props.toilets.toilets.map((t) => ({
        type: "Feature" as const,
        properties: { id: t.id, name: t.name ?? "", is_accessible: t.is_accessible, is_dump_point: t.is_dump_point },
        geometry: { type: "Point" as const, coordinates: [t.lng, t.lat] },
      })),
    };
    const culledFC = vpBoundsRef.current ? cullFeatures(fc, vpBoundsRef.current) : fc;
    const beforeId = (() => { for (const id of [STOPS_SHADOW, STOPS_OUTER]) { if (map.getLayer(id)) return id; } return undefined; })();
    const existingSrc = map.getSource(TOILETS_SRC) as GeoJSONSource | undefined;
    if (existingSrc) { existingSrc.setData(culledFC); } else {
      map.addSource(TOILETS_SRC, { type: "geojson", data: culledFC, cluster: false });
      map.addLayer({ id: TOILETS_ICON_LAYER, type: "circle", source: TOILETS_SRC, minzoom: 9,
        paint: { "circle-radius": 5, "circle-color": "#06b6d4", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-opacity": 0.85 },
      }, beforeId);
      const v = overlayVisRef.current.toilets ? "visible" : "none";
      if (map.getLayer(TOILETS_ICON_LAYER)) map.setLayoutProperty(TOILETS_ICON_LAYER, "visibility", v);
    }
  }, [props.toilets, styleReady, vpBounds]);

  /* ── School Zones overlay ────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    if (!props.schoolZones?.zones?.length) {
      const src = map.getSource(SCHOOL_ZONES_SRC) as GeoJSONSource | undefined;
      if (src) src.setData(emptyFC);
      return;
    }
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: props.schoolZones.zones.map((z) => ({
        type: "Feature" as const,
        properties: { id: z.id, school_name: z.school_name ?? "", is_active: z.is_currently_active, speed_limit: z.speed_limit_active_kmh },
        geometry: { type: "Point" as const, coordinates: [z.lng, z.lat] },
      })),
    };
    const culledFC = vpBoundsRef.current ? cullFeatures(fc, vpBoundsRef.current) : fc;
    const beforeId = (() => { for (const id of [STOPS_SHADOW, STOPS_OUTER]) { if (map.getLayer(id)) return id; } return undefined; })();
    const existingSrc = map.getSource(SCHOOL_ZONES_SRC) as GeoJSONSource | undefined;
    if (existingSrc) { existingSrc.setData(culledFC); } else {
      map.addSource(SCHOOL_ZONES_SRC, { type: "geojson", data: culledFC, cluster: false });
      map.addLayer({ id: SCHOOL_ZONES_ICON_LAYER, type: "circle", source: SCHOOL_ZONES_SRC, minzoom: 9,
        paint: { "circle-radius": 6, "circle-color": ["case", ["get", "is_active"], "#ef4444", "#f59e0b"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5, "circle-opacity": 0.9 },
      }, beforeId);
      const v = overlayVisRef.current.school_zones ? "visible" : "none";
      if (map.getLayer(SCHOOL_ZONES_ICON_LAYER)) map.setLayoutProperty(SCHOOL_ZONES_ICON_LAYER, "visibility", v);
    }
  }, [props.schoolZones, styleReady, vpBounds]);

  /* ── Roadkill hotspots overlay ───────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    if (!props.roadkill?.hotspots?.length) {
      const src = map.getSource(ROADKILL_SRC) as GeoJSONSource | undefined;
      if (src) src.setData(emptyFC);
      return;
    }
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: props.roadkill.hotspots.map((h) => ({
        type: "Feature" as const,
        properties: { id: h.id, risk_level: h.risk_level, count: h.observation_count, species: h.species.join(", ") },
        geometry: { type: "Point" as const, coordinates: [h.lng, h.lat] },
      })),
    };
    const culledFC = vpBoundsRef.current ? cullFeatures(fc, vpBoundsRef.current) : fc;
    const beforeId = (() => { for (const id of [STOPS_SHADOW, STOPS_OUTER]) { if (map.getLayer(id)) return id; } return undefined; })();
    const existingSrc = map.getSource(ROADKILL_SRC) as GeoJSONSource | undefined;
    if (existingSrc) { existingSrc.setData(culledFC); } else {
      map.addSource(ROADKILL_SRC, { type: "geojson", data: culledFC, cluster: false });
      map.addLayer({ id: ROADKILL_DOT_LAYER, type: "circle", source: ROADKILL_SRC, minzoom: 8,
        paint: { "circle-radius": 5, "circle-color": ["match", ["get", "risk_level"], "high", "#dc2626", "medium", "#f97316", "#eab308"], "circle-stroke-color": "#fff", "circle-stroke-width": 1, "circle-opacity": 0.8 },
      }, beforeId);
      const v = overlayVisRef.current.roadkill ? "visible" : "none";
      if (map.getLayer(ROADKILL_DOT_LAYER)) map.setLayoutProperty(ROADKILL_DOT_LAYER, "visibility", v);
    }
  }, [props.roadkill, styleReady, vpBounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const locSrc = map.getSource(USER_LOC_SRC) as GeoJSONSource | undefined;
    locSrc?.setData(userLocFC);
    const headSrc = map.getSource(USER_LOC_HEADING_SRC) as GeoJSONSource | undefined;
    headSrc?.setData(headingFC);
    const pos = props.userPosition;
    if (pos && map.getLayer(USER_LOC_ACCURACY)) {
      map.setPaintProperty(USER_LOC_ACCURACY, "circle-radius", accuracyToPixels(pos.accuracy, pos.lat, map.getZoom()));
    }
  }, [userLocFC, headingFC, props.userPosition]);

  /* ── Focus stop → ease ──────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.navigationMode) return; // camera controlled by useMapNavigationMode
    const id = props.focusedStopId ?? null;
    if (!id) return;
    const s = (props.stops ?? []).find((x) => String(x.id) === String(id));
    if (s) easeToCoord(map, [s.lng, s.lat], { zoom: Math.max(map.getZoom(), 12), duration: 420 });
  }, [props.focusedStopId, props.stops, props.navigationMode]);

  /* ── Focus suggestion → zoom/focus/popup/highlight ────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.navigationMode) return; // camera controlled by useMapNavigationMode

    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    const id = props.focusedSuggestionId ?? null;

    // Clean up previous animation
    if (sugFocusRaf.current != null) {
      cancelAnimationFrame(sugFocusRaf.current);
      sugFocusRaf.current = null;
    }

    if (!id) {
      // Clear focus highlight
      lastFocusFlewToRef.current = null;
      const src = map.getSource(SUG_FOCUS_SRC) as GeoJSONSource | undefined;
      src?.setData(emptyFC);
      popupRef.current?.remove();
      return;
    }

    // Find the place in suggestions or query the source
    let coord: [number, number] | null = null;
    let name = "";
    let category = "";
    let color = "#3b82f6";

    const p = (props.suggestions ?? []).find((x) => String(x.id) === String(id));
    if (p) {
      coord = [p.lng, p.lat];
      name = p.name ?? "";
      category = p.category ?? "";
      color = getCatConfig(p.category).color;
    } else {
      try {
        const feats = map.querySourceFeatures(SUG_SRC);
        for (const f of feats) {
          if (f?.properties?.id && String(f.properties.id) === id) {
            if (f.geometry.type === "Point") {
              const coords = f.geometry.coordinates;
              if (Array.isArray(coords) && coords.length === 2) {
                coord = [Number(coords[0]), Number(coords[1])];
                name = (f.properties.name as string) ?? "";
                category = (f.properties.category as string) ?? "";
                color = (f.properties.color as string) ?? "#3b82f6";
                break;
              }
            }
          }
        }
      } catch {}
      // Fallback: use explicit coords passed by the caller (e.g. from guide map action)
      if (!coord && props.focusFallbackCoord) {
        coord = props.focusFallbackCoord;
      }
      // Fallback name
      if (!name && props.focusFallbackName) {
        name = props.focusFallbackName;
      }
    }

    if (!coord) {
      const src = map.getSource(SUG_FOCUS_SRC) as GeoJSONSource | undefined;
      src?.setData(emptyFC);
      return;
    }

    // 1. Zoom close — only fly the camera if this is a newly focused place.
    //    If the user has panned away and the effect re-runs (e.g. places reloaded),
    //    we must NOT re-yank the camera back to the same place.
    if (lastFocusFlewToRef.current !== id) {
      lastFocusFlewToRef.current = id;
      easeToCoord(map, coord, { zoom: Math.max(map.getZoom(), 14.5), duration: 500 });
    }

    // 2. Set the focus highlight source
    const focusFC: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Point", coordinates: coord },
        properties: { color },
      }],
    };

    const focusSrc = map.getSource(SUG_FOCUS_SRC) as GeoJSONSource | undefined;
    if (focusSrc) {
      focusSrc.setData(focusFC);
    } else {
      try { map.addSource(SUG_FOCUS_SRC, { type: "geojson", data: focusFC }); } catch {}
    }

    // 3. Animate the pulsing ping ring (~30fps, pauses when tab hidden)
    let frame = 0;
    let lastT = 0;
    const animate = (now: number) => {
      if (document.hidden) { sugFocusRaf.current = requestAnimationFrame(animate); return; }
      if (now - lastT < 33) { sugFocusRaf.current = requestAnimationFrame(animate); return; } // ~30fps
      lastT = now;
      frame++;
      const t = (frame % 60) / 60;
      const radius = 22 + t * 28;
      const opacity = 1 - t;
      try {
        map.setPaintProperty(SUG_FOCUS_PING, "circle-radius", radius);
        map.setPaintProperty(SUG_FOCUS_PING, "circle-stroke-color", `rgba(59,130,246,${(0.5 * opacity).toFixed(2)})`);
      } catch {}
      sugFocusRaf.current = requestAnimationFrame(animate);
    };
    sugFocusRaf.current = requestAnimationFrame(animate);

    // 4. Notify parent (popup removed — PlaceDetailSheet handles display)
    onSugPressRef.current?.(id);

    return () => {
      if (sugFocusRaf.current != null) {
        cancelAnimationFrame(sugFocusRaf.current);
        sugFocusRaf.current = null;
      }
    };
  }, [props.focusedSuggestionId, props.suggestions, props.focusFallbackCoord, props.focusFallbackName, props.navigationMode]);

  /* ── Highlighted alert → in-place pulse ring (no camera move) ────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = props.highlightedAlertId ?? null;
    const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

    if (!id) {
      const src = map.getSource(ALERT_HIGHLIGHT_SRC) as GeoJSONSource | undefined;
      src?.setData(emptyFC);
      return;
    }

    let coord: [number, number] | null = null;
    for (const srcId of [TRAFFIC_POINT_SRC, HAZARD_POINT_SRC]) {
      try {
        const feats = map.querySourceFeatures(srcId);
        for (const f of feats) {
          if (f?.properties?.id === id && f?.geometry?.type === "Point") {
            coord = (f.geometry as GeoJSON.Point).coordinates as [number, number];
            break;
          }
        }
      } catch {}
      if (coord) break;
    }

    if (!coord) {
      const src = map.getSource(ALERT_HIGHLIGHT_SRC) as GeoJSONSource | undefined;
      src?.setData(emptyFC);
      return;
    }

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: coord }, properties: {} }],
    };

    if (!map.getSource(ALERT_HIGHLIGHT_SRC)) {
      map.addSource(ALERT_HIGHLIGHT_SRC, { type: "geojson", data: fc });
    } else {
      (map.getSource(ALERT_HIGHLIGHT_SRC) as GeoJSONSource).setData(fc);
    }

    if (!map.getLayer(ALERT_HIGHLIGHT_PING)) {
      map.addLayer({
        id: ALERT_HIGHLIGHT_PING,
        type: "circle",
        source: ALERT_HIGHLIGHT_SRC,
        paint: { "circle-radius": 0, "circle-color": "transparent", "circle-stroke-color": "rgba(181,69,46,0.55)", "circle-stroke-width": 2, "circle-opacity": 1 },
      });
    }

    if (!map.getLayer(ALERT_HIGHLIGHT_RING)) {
      map.addLayer({
        id: ALERT_HIGHLIGHT_RING,
        type: "circle",
        source: ALERT_HIGHLIGHT_SRC,
        paint: { "circle-radius": 18, "circle-color": "rgba(181,69,46,0.10)", "circle-stroke-color": "rgba(181,69,46,0.6)", "circle-stroke-width": 2 },
      });
    }

    let frame = 0;
    let raf: number;
    let lastT = 0;
    const animate = (now: number) => {
      if (document.hidden) { raf = requestAnimationFrame(animate); return; }
      if (now - lastT < 33) { raf = requestAnimationFrame(animate); return; } // ~30fps
      lastT = now;
      frame++;
      const t = (frame % 60) / 60;
      const radius = 18 + t * 24;
      const opacity = 1 - t;
      try {
        map.setPaintProperty(ALERT_HIGHLIGHT_PING, "circle-radius", radius);
        map.setPaintProperty(ALERT_HIGHLIGHT_PING, "circle-stroke-color", `rgba(181,69,46,${(0.55 * opacity).toFixed(2)})`);
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
       // Keep mapInstanceRef populated so useMapNavigationMode can control the camera
       if (props.mapInstanceRef) props.mapInstanceRef.current = map;
       if (props.navigationMode) return; // camera controlled by useMapNavigationMode
       if (props.focusedSuggestionId) return; // camera controlled by focus effect
       try {
         map.fitBounds(bboxToBounds(props.bbox), { padding: 60, duration: 250 });
       } catch {}
     }, [props.bbox.minLat, props.bbox.minLng, props.bbox.maxLat, props.bbox.maxLng, props.bbox, props.navigationMode, props.focusedSuggestionId, props.mapInstanceRef]);
  
  return (
    <div className="trip-map-fullscreen">
      <div ref={containerRef} className="trip-map-inner" />

      {/* ── Top-right map controls (nearby indicator + layer toggle) ── */}
      {(() => {
        const allOn = ALL_OVERLAY_KEYS.every((k) => overlayVis[k]);
        const anyOff = ALL_OVERLAY_KEYS.some((k) => !overlayVis[k]);
        return (
          <div style={{
            position: "absolute",
            top: "calc(env(safe-area-inset-top, 0px) + 56px)",
            right: 12,
            zIndex: 25,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
          }}>
            {/* Nearby roamers indicator merged into Exchange FAB + panel */}
            {/* Layer button + dropdown wrapper (position: relative for dropdown anchoring) */}
            <div style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="Map layers"
              className={`layer-toggle-btn${anyOff ? " layer-toggle-btn--filtered" : ""}`}
              onClick={() => setLayerMenuOpen((v) => !v)}
              onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.90)"; }}
              onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
              onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
            >
              {/* Layers icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                <path d="m2 12 8.58 3.91a2 2 0 0 0 1.66 0L20.74 12" opacity=".6" />
                <path d="m2 17 8.58 3.91a2 2 0 0 0 1.66 0L20.74 17" opacity=".35" />
              </svg>
            </button>

            {/* Expanded menu — left of button on desktop, below on mobile */}
            {layerMenuVisible && (
              <div className={`layer-menu-dropdown${layerMenuMounted ? " layer-menu-dropdown--open" : ""}`}>
              <div style={{
                overflowY: "auto",
                flex: 1,
                padding: "6px 4px",
                display: "flex", flexDirection: "column", gap: 2,
              }}>
                {/* Toggle All */}
                <button
                  type="button"
                  className="layer-menu-item layer-menu-item--all"
                  onClick={() => {
                    const next = allOn
                      ? Object.fromEntries(ALL_OVERLAY_KEYS.map((k) => [k, false])) as OverlayVisibility
                      : { ...DEFAULT_VIS };
                    setOverlayVis(next);
                  }}
                >
                  <span className={`layer-menu-check${allOn ? " layer-menu-check--on" : ""}`}>
                    {allOn && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--roam-bg, #0f0f0f)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                  </span>
                  All layers
                </button>

                {([
                  ["stops",        "Stops",        "#e04e4e"],
                  ["places",       "Places",       "#22a55a"],
                  ["fuel",         "Fuel",         "#e2a12f"],
                  ["traffic",      "Traffic",      "#f57c24"],
                  ["hazards",      "Hazards",      "#d42e5b"],
                  ["wildlife",     "Wildlife",     "#a87b32"],
                  ["coverage",     "Coverage",     "#8b5cf6"],
                  ["flood",        "Flood",        "#3b82f6"],
                  ["rest_areas",   "Rest Areas",   "#14b8a6"],
                  ["weather",      "Weather",      "#0ea5e9"],
                  ["emergency",    "Emergency",    "#ef4444"],
                  ["heritage",     "Heritage",     "#a855f7"],
                  ["air_quality",  "Air Quality",  "#10b981"],
                  ["bushfire",     "Bushfire",     "#f97316"],
                  ["cameras",      "Cameras",      "#6366f1"],
                  ["toilets",      "Toilets",      "#06b6d4"],
                  ["school_zones", "School Zones", "#f59e0b"],
                  ["roadkill",     "Roadkill",     "#b45309"],
                ] as const).map(([key, label, color]) => (
                  <button
                    key={key}
                    type="button"
                    className="layer-menu-item"
                    onClick={() => setOverlayVis((prev) => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <span
                      className="layer-menu-check"
                      style={overlayVis[key] ? { background: color, border: "none" } : undefined}
                    >
                      {overlayVis[key] && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {label}
                      {key === "weather" && props.weather && props.weather.warnings.length > 0 && (
                        <span className="ml-1 h-2 w-2 rounded-full bg-red-500 inline-block" />
                      )}
                    </span>
                  </button>
                ))}
              </div>

              {/* Map style switcher */}
              {props.onStyleChange && (() => {
                const styleId = props.styleId;
                const mode: MapBaseMode = styleId === "roam-basemap-hybrid" ? "hybrid" : "vector";
                const vectorTheme: VectorTheme = styleId === "roam-basemap-vector-dark" ? "dark" : "bright";
                return (
                  <div className="layer-menu-style-section">
                    <span className="layer-menu-style-label">MAP STYLE</span>
                    {/* Map / Sat row */}
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" className={`layer-menu-style-btn${mode === "vector" ? " layer-menu-style-btn--active" : ""}`} onClick={() => { haptic.selection(); props.onStyleChange!({ mode: "vector", vectorTheme }); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"/><path d="M9 3v15M15 6v15"/></svg>
                        Map
                      </button>
                      <button type="button" className={`layer-menu-style-btn${mode === "hybrid" ? " layer-menu-style-btn--active" : ""}`} onClick={() => { haptic.selection(); props.onStyleChange!({ mode: "hybrid", vectorTheme }); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m2 12 4-4 4 4 4-4 4 4"/><path d="m6 16 2-2 4 2 4-2 2 2"/></svg>
                        Sat
                      </button>
                    </div>
                    {/* Bright / Dark row — animates in when vector mode is active */}
                    <div className={mode === "vector" ? "style-theme-row style-theme-row--open" : "style-theme-row"}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button type="button" className={`layer-menu-style-btn${vectorTheme === "bright" ? " layer-menu-style-btn--active" : ""}`} onClick={() => { haptic.selection(); props.onStyleChange!({ mode: "vector", vectorTheme: "bright" }); }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
                          Bright
                        </button>
                        <button type="button" className={`layer-menu-style-btn${vectorTheme === "dark" ? " layer-menu-style-btn--active" : ""}`} onClick={() => { haptic.selection(); props.onStyleChange!({ mode: "vector", vectorTheme: "dark" }); }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                          Dark
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
              </div>
            )}
            </div>
          </div>
        );
      })()}

      <style>{`
        /* ── Layer toggle button ── */
        .layer-toggle-btn {
          width: 46px; height: 46px; border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.10);
          cursor: pointer; display: grid; place-items: center;
          background: linear-gradient(160deg, rgba(255,255,255,0.92) 0%, rgba(244,239,230,0.96) 100%);
          color: var(--text-main, #1a1613);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.06);
          transition: transform 0.1s ease, background 0.2s ease, box-shadow 0.2s ease;
        }
        .layer-toggle-btn--filtered {
          background: linear-gradient(160deg, rgba(45,110,64,0.95) 0%, rgba(31,82,54,0.98) 100%);
          color: var(--on-color);
          border: 1px solid rgba(45,110,64,0.35);
          box-shadow: 0 4px 16px rgba(45,110,64,0.30), 0 1px 4px rgba(0,0,0,0.12);
        }
        @media (prefers-color-scheme: dark) {
          .layer-toggle-btn {
            background: linear-gradient(160deg, rgba(26,21,16,0.96) 0%, rgba(16,13,10,0.98) 100%);
            color: var(--on-color);
            border: 1px solid rgba(255,255,255,0.09);
            box-shadow: 0 4px 16px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.15);
          }
        }

        /* ── Layer menu dropdown ── */
        .layer-menu-dropdown {
          position: absolute;
          top: 0;
          right: calc(100% + 8px);
          transform-origin: top right;
          max-height: min(420px, calc(100dvh - env(safe-area-inset-top, 0px) - 56px - 180px - var(--bottom-nav-height, 80px)));
          background: linear-gradient(160deg, rgba(255,255,255,0.97) 0%, rgba(244,239,230,0.99) 100%);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-radius: 18px;
          border: 1px solid rgba(0,0,0,0.08);
          box-shadow: 0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6);
          min-width: 150px;
          display: flex; flex-direction: column;
          overflow: hidden;
          opacity: 0;
          transform: translateY(-8px) scale(0.96);
          transition: opacity 280ms cubic-bezier(0.34,1.56,0.64,1), transform 280ms cubic-bezier(0.34,1.56,0.64,1);
        }
        .layer-menu-dropdown--open {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .layer-menu-dropdown > div:first-child {
          mask-image: linear-gradient(to bottom, black calc(100% - 32px), transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, black calc(100% - 32px), transparent 100%);
        }
        @media (prefers-color-scheme: dark) {
          .layer-menu-dropdown {
            background: linear-gradient(160deg, rgba(26,21,16,0.97) 0%, rgba(16,13,10,0.99) 100%);
            border: 1px solid rgba(255,255,255,0.07);
            box-shadow: 0 12px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
          }
        }

        /* ── Layer menu items ── */
        .layer-menu-item {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 12px; border-radius: 10px; border: none;
          background: transparent; color: var(--text-main, #1a1613); cursor: pointer;
          font-size: 13px; font-weight: 500; width: 100%; text-align: left;
        }
        .layer-menu-item--all {
          font-weight: 700;
          border-bottom: 1px solid rgba(0,0,0,0.06);
        }
        @media (prefers-color-scheme: dark) {
          .layer-menu-item { color: white; }
          .layer-menu-item--all { border-bottom-color: rgba(255,255,255,0.08); }
        }

        /* ── Layer menu checkboxes ── */
        .layer-menu-check {
          width: 18px; height: 18px; border-radius: 5px;
          border: 2px solid rgba(0,0,0,0.25);
          background: transparent;
          display: grid; place-items: center; flex-shrink: 0;
          transition: background 0.15s ease;
        }
        .layer-menu-check--on {
          background: var(--text-main, #1a1613);
          border: none;
        }
        @media (prefers-color-scheme: dark) {
          .layer-menu-check { border-color: rgba(255,255,255,0.4); }
          .layer-menu-check--on { background: white; }
        }

        /* ── Map style section ── */
        .layer-menu-style-section {
          padding: 8px 8px 6px;
          border-top: 1px solid rgba(0,0,0,0.06);
          display: flex; flex-direction: column; gap: 6px;
        }
        .layer-menu-style-label {
          font-size: 10px; font-weight: 700; color: var(--text-muted, #7a7067);
          letter-spacing: 0.08em; padding: 0 4px;
        }
        .layer-menu-style-btn {
          flex: 1; height: 34px; border-radius: 9px; border: none;
          cursor: pointer; font-size: 12px; font-weight: 700;
          display: flex; align-items: center; justify-content: center; gap: 5px;
          background: transparent; color: var(--text-main, #1a1613);
          transition: background 0.15s ease;
        }
        .layer-menu-style-btn--active {
          background: rgba(0,0,0,0.08);
        }
        @media (prefers-color-scheme: dark) {
          .layer-menu-style-section { border-top-color: rgba(255,255,255,0.08); }
          .layer-menu-style-label { color: rgba(255,255,255,0.4); }
          .layer-menu-style-btn { color: white; }
          .layer-menu-style-btn--active { background: rgba(255,255,255,0.18); }
        }

        .style-theme-row {
          max-height: 0;
          opacity: 0;
          overflow: hidden;
          transition: max-height 220ms cubic-bezier(0.4,0,0.2,1), opacity 180ms ease;
        }
        .style-theme-row--open {
          max-height: 48px;
          opacity: 1;
        }
        .trip-map-popup .maplibregl-popup-content {
          border-radius: var(--r-card, 24px);
          padding: 16px 18px;
          background: color-mix(in srgb, var(--roam-surface, #f4efe6) 82%, transparent);
          color: var(--roam-text);
          backdrop-filter: blur(20px) saturate(170%);
          -webkit-backdrop-filter: blur(20px) saturate(170%);
          box-shadow:
            0 12px 40px rgba(40,32,20,0.18),
            0 2px 8px rgba(40,32,20,0.10),
            inset 0 1px 0 rgba(255,255,255,0.35);
          border: 1px solid rgba(255,255,255,0.18);
        }
        @media (prefers-color-scheme: dark) {
          .trip-map-popup .maplibregl-popup-content {
            background: color-mix(in srgb, var(--roam-surface, #1a1a1a) 75%, transparent);
            box-shadow:
              0 12px 40px rgba(0,0,0,0.40),
              0 2px 8px rgba(0,0,0,0.25),
              inset 0 1px 0 rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.08);
          }
        }
        .trip-map-popup .maplibregl-popup-close-button {
          font-size: 16px;
          font-weight: 800;
          color: var(--roam-text-muted);
          padding: 4px 8px;
          border-radius: 10px;
          transition: transform 80ms ease, background 120ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .trip-map-popup .maplibregl-popup-close-button:hover {
          background: var(--roam-surface-hover);
          color: var(--roam-text);
        }
        .trip-map-popup .maplibregl-popup-close-button:active {
          transform: scale(0.88);
        }
        .trip-map-popup .maplibregl-popup-tip {
          border-top-color: color-mix(in srgb, var(--roam-surface, #f4efe6) 82%, transparent);
        }
      `}</style>
    </div>
  );
});