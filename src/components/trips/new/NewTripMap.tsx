// src/components/new/NewTripMap.tsx
"use client";

import { useEffect, useMemo, useRef, useCallback } from "react";
import maplibregl, { type Map as MLMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";

import type { TripStop } from "@/lib/types/trip";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack } from "@/lib/types/places";
import type { NavCoord } from "@/lib/types/geo";
import type { RoamPosition } from "@/lib/native/geolocation";
import { assetsApi } from "@/lib/api/assets";
import { polyline6ToGeoJSONLine } from "@/lib/nav/polyline6";

/* ── Source / layer IDs ──────────────────────────────────────────────── */

const ROUTE_SOURCE = "roam_route";
const ROUTE_LAYER = "roam_route_line";
const STOPS_SOURCE = "roam_stops";
const STOPS_LAYER = "roam_stops_pts";
const PLACES_SOURCE = "roam_places";
const PLACES_LAYER = "roam_places_pts";
const TRAFFIC_SOURCE = "roam_traffic";
const TRAFFIC_LAYER = "roam_traffic_pts";
const HAZARDS_SOURCE = "roam_hazards";
const HAZARDS_LAYER = "roam_hazards_pts";

const USER_LOC_SRC = "roam-user-loc-src";
const USER_LOC_ACCURACY = "roam-user-loc-accuracy";
const USER_LOC_DOT_OUTER = "roam-user-loc-dot-outer";
const USER_LOC_DOT_INNER = "roam-user-loc-dot-inner";
const USER_LOC_HEADING_SRC = "roam-user-heading-src";
const USER_LOC_HEADING = "roam-user-loc-heading";

const HEADING_ARROW_ID = "roam-heading-arrow";
const HEADING_ARROW_SVG = `<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="hg" x1="24" y1="4" x2="24" y2="28" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.85"/>
    <stop offset="100%" stop-color="#2563eb" stop-opacity="0.15"/>
  </linearGradient></defs>
  <path d="M24 4 L36 28 L24 22 L12 28 Z" fill="url(#hg)" stroke="#2563eb" stroke-width="1" stroke-opacity="0.4"/>
</svg>`;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/* ── Helpers ─────────────────────────────────────────────────────────── */

function normalizePath(p: string) {
  let x = (p ?? "").trim().replace(/^\/+/, "/");
  if (!x.startsWith("/")) x = `/${x}`;
  return x;
}

function toAbsoluteUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (typeof window === "undefined") return pathOrUrl;
  return `${window.location.origin}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

function rewritePmtilesUrl(url: string) {
  if (!url.startsWith("pmtiles://")) return url;
  const inner = url.slice("pmtiles://".length);
  if (/^https?:\/\//i.test(inner)) return url;
  return `pmtiles://${toAbsoluteUrl(normalizePath(inner))}`;
}

function accuracyToPixels(accuracyM: number, lat: number, zoom: number): number {
  const mpp = (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * 6371008.8) / (256 * Math.pow(2, zoom));
  return Math.max(12, Math.min(200, accuracyM / mpp));
}

function userLocGeoJSON(pos: RoamPosition | null | undefined): GeoJSON.FeatureCollection {
  if (!pos) return EMPTY_FC;
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { accuracy: pos.accuracy },
      geometry: { type: "Point", coordinates: [pos.lng, pos.lat] },
    }],
  };
}

function headingGeoJSON(pos: RoamPosition | null | undefined): GeoJSON.FeatureCollection {
  if (!pos || pos.heading == null || pos.speed == null || pos.speed < 0.5) return EMPTY_FC;
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { heading: pos.heading },
      geometry: { type: "Point", coordinates: [pos.lng, pos.lat] },
    }],
  };
}

function loadHeadingArrow(map: MLMap): Promise<void> {
  return new Promise((resolve) => {
    if (map.hasImage(HEADING_ARROW_ID)) { resolve(); return; }
    const img = new Image(48, 48);
    img.onload = () => {
      try { if (!map.hasImage(HEADING_ARROW_ID)) map.addImage(HEADING_ARROW_ID, img, { sdf: false }); } catch {}
      resolve();
    };
    img.onerror = () => resolve();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(HEADING_ARROW_SVG)}`;
  });
}

function pointFromBbox(b: number[] | null | undefined): [number, number] | null {
  if (!b || b.length !== 4) return null;
  const [minLng, minLat, maxLng, maxLat] = b;
  if (![minLng, minLat, maxLng, maxLat].every((x) => typeof x === "number" && Number.isFinite(x))) return null;
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

function tryPointFromGeoJSON(g: any): [number, number] | null {
  try {
    if (g?.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      const lng = Number(g.coordinates[0]), lat = Number(g.coordinates[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
    }
  } catch {}
  return null;
}

/**
 * Safely check if the map is alive and style is loaded.
 * Prevents all the "source not found" / "style not loaded" cascading errors.
 */
function mapReady(map: MLMap | null): map is MLMap {
  if (!map) return false;

  try {
    // getCanvas() throws if map is removed
    map.getCanvas();

    // Some MapLibre typings expose isStyleLoaded(): boolean | void
    // Force a strict boolean so this function can be used as a type guard.
    const loaded = (map as any).isStyleLoaded?.();
    return loaded === true;
  } catch {
    return false;
  }
}

/* ── Component ───────────────────────────────────────────────────────── */

export function NewTripMap(props: {
  stops: TripStop[];
  navPack: NavPack | null;
  styleId: string;
  onMapCenterChanged?: (c: NavCoord) => void;
  corridorPack?: CorridorGraphPack | null;
  placesPack?: PlacesPack | null;
  traffic?: TrafficOverlay | null;
  hazards?: HazardOverlay | null;
  userPosition?: RoamPosition | null;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const initRef = useRef(false);

  // Stable callback ref for onMapCenterChanged to avoid effect re-fires
  const onCenterRef = useRef(props.onMapCenterChanged);
  onCenterRef.current = props.onMapCenterChanged;

  const stylePath = useMemo(() => assetsApi.styleUrl(props.styleId), [props.styleId]);
  const styleUrl = useMemo(() => toAbsoluteUrl(stylePath), [stylePath]);

  const userLocFC = useMemo(() => userLocGeoJSON(props.userPosition), [props.userPosition]);
  const headingFC = useMemo(() => headingGeoJSON(props.userPosition), [props.userPosition]);

  /**
   * Full layer setup — called once on init and again on every style swap.
   * Order matters: sources MUST exist before any layer references them.
   */
  const setupAllLayers = useCallback(async (map: MLMap) => {
    if (!mapReady(map)) return;

    // 1) Data sources + layers
    ensureDataSources(map);

    // 2) User location sources (MUST come before heading layer)
    ensureUserLocationSources(map);

    // 3) User location paint layers
    ensureUserLocationLayers(map);

    // 4) Heading arrow image
    await loadHeadingArrow(map);

    // 5) Heading layer — only now that source + image both exist
    ensureHeadingLayer(map);
  }, []);

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => {
    if (!elRef.current || initRef.current) return;
    initRef.current = true;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile.bind(protocol));

    const map = new maplibregl.Map({
      container: elRef.current,
      style: styleUrl,
      center: [153.026, -27.4705],
      zoom: 10,
      attributionControl: false,
      transformRequest: (url) => {
        if (url.startsWith("pmtiles://")) return { url: rewritePmtilesUrl(url) };
        return { url };
      },
    });

    mapRef.current = map;

    map.on("moveend", () => {
      const c = map.getCenter();
      onCenterRef.current?.({ lat: c.lat, lng: c.lng });
    });

    map.on("load", async () => {
      await setupAllLayers(map);
      syncAll(map, props);
      syncUserLocation(map, userLocFC, headingFC, props.userPosition);
    });

    return () => {
      mapRef.current = null;
      initRef.current = false;
      try { map.remove(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Style changes ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Don't set style on first render (init handles it)
    let cancelled = false;

    const onStyleLoad = async () => {
      if (cancelled) return;
      await setupAllLayers(map);
      syncAll(map, props);
      syncUserLocation(map, userLocFC, headingFC, props.userPosition);
    };

    // setStyle wipes all sources/layers — onStyleLoad rebuilds them
    map.once("style.load", onStyleLoad);
    map.setStyle(styleUrl);

    return () => {
      cancelled = true;
      try { map.off("style.load", onStyleLoad); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  // ── Data syncs ────────────────────────────────────────────
  useEffect(() => {
    const m = mapRef.current;
    if (mapReady(m)) { ensureDataSources(m); syncStops(m, props.stops); }
  }, [props.stops]);

  useEffect(() => {
    const m = mapRef.current;
    if (mapReady(m)) { ensureDataSources(m); syncRoute(m, props.navPack); }
  }, [props.navPack]);

  useEffect(() => {
    const m = mapRef.current;
    if (mapReady(m)) { ensureDataSources(m); syncPlaces(m, props.placesPack ?? null); }
  }, [props.placesPack]);

  useEffect(() => {
    const m = mapRef.current;
    if (mapReady(m)) { ensureDataSources(m); syncTraffic(m, props.traffic ?? null); }
  }, [props.traffic]);

  useEffect(() => {
    const m = mapRef.current;
    if (mapReady(m)) { ensureDataSources(m); syncHazards(m, props.hazards ?? null); }
  }, [props.hazards]);

  // ── User location ─────────────────────────────────────────
  useEffect(() => {
    const m = mapRef.current;
    if (mapReady(m)) syncUserLocation(m, userLocFC, headingFC, props.userPosition);
  }, [userLocFC, headingFC, props.userPosition]);

  return (
    <div className="trip-map-fullscreen">
      <div ref={elRef} className="trip-map-inner" />
    </div>
  );
}

/* ── Map setup helpers ────────────────────────────────────────────────── */

/**
 * Ensure data sources (route, stops, places, traffic, hazards).
 * Each source + layer is created only if not already present.
 */
function ensureDataSources(map: MLMap) {
  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: ROUTE_LAYER, type: "line", source: ROUTE_SOURCE,
      paint: {
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 3, 10, 5, 14, 8],
        "line-opacity": 0.9,
        "line-color": "#2e7cf6",
      },
    });
  }
  if (!map.getSource(STOPS_SOURCE)) {
    map.addSource(STOPS_SOURCE, { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: STOPS_LAYER, type: "circle", source: STOPS_SOURCE,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 10, 7, 14, 9],
        "circle-opacity": 0.95,
        "circle-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-stroke-opacity": 0.9,
        "circle-stroke-color": "#111827",
      },
    });
  }
  if (!map.getSource(PLACES_SOURCE)) {
    map.addSource(PLACES_SOURCE, { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: PLACES_LAYER, type: "circle", source: PLACES_SOURCE,
      paint: {
        "circle-radius": 4.5,
        "circle-opacity": 0.85,
        "circle-color": "#34d399",
        "circle-stroke-width": 1,
        "circle-stroke-opacity": 0.8,
        "circle-stroke-color": "#0b1220",
      },
    });
  }
  if (!map.getSource(TRAFFIC_SOURCE)) {
    map.addSource(TRAFFIC_SOURCE, { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: TRAFFIC_LAYER, type: "circle", source: TRAFFIC_SOURCE,
      paint: {
        "circle-radius": 5.5,
        "circle-opacity": 0.85,
        "circle-color": "#f59e0b",
        "circle-stroke-width": 1,
        "circle-stroke-opacity": 0.9,
        "circle-stroke-color": "#0b1220",
      },
    });
  }
  if (!map.getSource(HAZARDS_SOURCE)) {
    map.addSource(HAZARDS_SOURCE, { type: "geojson", data: EMPTY_FC });
    map.addLayer({
      id: HAZARDS_LAYER, type: "circle", source: HAZARDS_SOURCE,
      paint: {
        "circle-radius": 6.5,
        "circle-opacity": 0.85,
        "circle-color": "#ef4444",
        "circle-stroke-width": 1,
        "circle-stroke-opacity": 0.9,
        "circle-stroke-color": "#0b1220",
      },
    });
  }
}

/**
 * Ensure user location + heading SOURCES exist.
 * Separated from layers so we can guarantee sources exist before
 * any layer references them.
 */
function ensureUserLocationSources(map: MLMap) {
  if (!map.getSource(USER_LOC_SRC)) {
    map.addSource(USER_LOC_SRC, { type: "geojson", data: EMPTY_FC });
  }
  if (!map.getSource(USER_LOC_HEADING_SRC)) {
    map.addSource(USER_LOC_HEADING_SRC, { type: "geojson", data: EMPTY_FC });
  }
}

/**
 * Ensure user location paint layers (accuracy ring, outer dot, inner dot).
 * These reference USER_LOC_SRC which MUST already exist.
 */
function ensureUserLocationLayers(map: MLMap) {
  // Guard: source must exist
  if (!map.getSource(USER_LOC_SRC)) return;

  if (!map.getLayer(USER_LOC_ACCURACY)) {
    map.addLayer({
      id: USER_LOC_ACCURACY, type: "circle", source: USER_LOC_SRC,
      paint: {
        "circle-radius": 30,
        "circle-color": "rgba(37,99,235,0.08)",
        "circle-stroke-color": "rgba(37,99,235,0.25)",
        "circle-stroke-width": 1.5,
        "circle-opacity": 1,
      },
    });
  }
  if (!map.getLayer(USER_LOC_DOT_OUTER)) {
    map.addLayer({
      id: USER_LOC_DOT_OUTER, type: "circle", source: USER_LOC_SRC,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 10, 9, 16, 12],
        "circle-color": "#ffffff",
        "circle-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer(USER_LOC_DOT_INNER)) {
    map.addLayer({
      id: USER_LOC_DOT_INNER, type: "circle", source: USER_LOC_SRC,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 10, 6.5, 16, 9],
        "circle-color": "#2563eb",
        "circle-opacity": 1,
      },
    });
  }
}

/**
 * Ensure heading arrow layer.
 * CRITICAL: Only add if BOTH the source AND the image exist.
 * This was the source of the error loop — layer was added before
 * its source was created.
 */
function ensureHeadingLayer(map: MLMap) {
  // Both prerequisites must exist
  if (!map.getSource(USER_LOC_HEADING_SRC)) return;
  if (!map.hasImage(HEADING_ARROW_ID)) return;
  if (map.getLayer(USER_LOC_HEADING)) return;

  try {
    map.addLayer({
      id: USER_LOC_HEADING, type: "symbol", source: USER_LOC_HEADING_SRC,
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
  } catch (e) {
    // Swallow — race condition on style swap is harmless
    console.warn("[NewTripMap] ensureHeadingLayer failed (harmless):", e);
  }
}

function syncUserLocation(
  map: MLMap,
  locFC: GeoJSON.FeatureCollection,
  headFC: GeoJSON.FeatureCollection,
  pos: RoamPosition | null | undefined,
) {
  const locSrc = map.getSource(USER_LOC_SRC) as GeoJSONSource | undefined;
  if (locSrc) locSrc.setData(locFC);

  const headSrc = map.getSource(USER_LOC_HEADING_SRC) as GeoJSONSource | undefined;
  if (headSrc) headSrc.setData(headFC);

  if (pos && map.getLayer(USER_LOC_ACCURACY)) {
    const px = accuracyToPixels(pos.accuracy, pos.lat, map.getZoom());
    map.setPaintProperty(USER_LOC_ACCURACY, "circle-radius", px);
  }
}

/* ── Data sync functions ──────────────────────────────────────────────── */

function syncAll(map: MLMap, props: any) {
  syncStops(map, props.stops);
  syncRoute(map, props.navPack);
  syncPlaces(map, props.placesPack ?? null);
  syncTraffic(map, props.traffic ?? null);
  syncHazards(map, props.hazards ?? null);
}

function syncStops(map: MLMap, stops: TripStop[]) {
  const src = map.getSource(STOPS_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: "FeatureCollection",
    features: stops.map((s, idx) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] as [number, number] },
      properties: { id: s.id ?? String(idx), type: s.type ?? "poi", name: s.name ?? "", idx },
    })),
  });
}

function syncRoute(map: MLMap, navPack: NavPack | null) {
  const src = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;

  const poly6 =
    (navPack as any)?.primary?.geometry ??
    (navPack as any)?.routes?.primary?.geometry ??
    (navPack as any)?.geometry ??
    null;

  if (!poly6) {
    src.setData(EMPTY_FC);
    return;
  }

  const line = polyline6ToGeoJSONLine(String(poly6));
  src.setData({
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: line, properties: {} }],
  });

  const b =
    (navPack as any)?.primary?.bbox ??
    (navPack as any)?.routes?.primary?.bbox ??
    (navPack as any)?.bbox ??
    null;

  if (b && typeof b === "object" && "minLng" in b) {
    map.fitBounds(
      [[b.minLng, b.minLat], [b.maxLng, b.maxLat]],
      { padding: 80, duration: 600 },
    );
  }
}

function syncPlaces(map: MLMap, pack: PlacesPack | null) {
  const src = map.getSource(PLACES_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;

  const items: any[] = (pack as any)?.items ?? (pack as any)?.places ?? [];
  if (!items.length) {
    src.setData(EMPTY_FC);
    return;
  }

  // Cap features to prevent map from choking on 8000+ points during dev
  const MAX_MAP_FEATURES = 2000;
  const capped = items.length > MAX_MAP_FEATURES ? items.slice(0, MAX_MAP_FEATURES) : items;

  src.setData({
    type: "FeatureCollection",
    features: capped.map((it) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [it.lng, it.lat] as [number, number] },
      properties: { id: it.id, name: it.name, category: it.category },
    })),
  });
}

function syncTraffic(map: MLMap, overlay: TrafficOverlay | null) {
  const src = map.getSource(TRAFFIC_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;

  const items: any[] = (overlay as any)?.items ?? [];
  if (!items.length) {
    src.setData(EMPTY_FC);
    return;
  }

  src.setData({
    type: "FeatureCollection",
    features: items
      .map((ev) => {
        const p = tryPointFromGeoJSON(ev.geometry) ?? pointFromBbox(ev.bbox);
        if (!p) return null;
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: p },
          properties: { id: ev.id, type: ev.type ?? "unknown", severity: ev.severity ?? "unknown" },
        };
      })
      .filter(Boolean) as any[],
  });
}

function syncHazards(map: MLMap, overlay: HazardOverlay | null) {
  const src = map.getSource(HAZARDS_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;

  const items: any[] = (overlay as any)?.items ?? [];
  if (!items.length) {
    src.setData(EMPTY_FC);
    return;
  }

  src.setData({
    type: "FeatureCollection",
    features: items
      .map((ev) => {
        const p = tryPointFromGeoJSON(ev.geometry) ?? pointFromBbox(ev.bbox);
        if (!p) return null;
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: p },
          properties: { id: ev.id, kind: ev.kind ?? "unknown", severity: ev.severity ?? "unknown" },
        };
      })
      .filter(Boolean) as any[],
  });
}