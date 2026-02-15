// src/components/trip/TripMap.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type Map as MLMap, type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";

import type { BBox4 } from "@/lib/types/geo";
import type { TripStop } from "@/lib/types/trip";
import type { PlaceItem, PlaceCategory } from "@/lib/types/places";
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

  // User location (from native geolocation)
  userPosition?: RoamPosition | null;

  // Map tap for placing stops
  onMapLongPress?: (lat: number, lng: number) => void;
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
const STOP_FOCUS_LAYER = "roam-stop-focus-layer";

const SUG_SRC = "roam-suggestions-src";
const SUG_CLUSTER_CIRCLE = "roam-sug-cluster-circle";
const SUG_CLUSTER_COUNT = "roam-sug-cluster-count";
const SUG_UNCLUSTERED = "roam-sug-unclustered";
const SUG_UNCLUSTERED_LABEL = "roam-sug-unclustered-label";

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
    img.onload = () => {
      if (!map.hasImage(HEADING_ARROW_ID)) {
        map.addImage(HEADING_ARROW_ID, img, { sdf: false });
      }
      resolve();
    };
    img.onerror = () => resolve(); // fail silently
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(HEADING_ARROW_SVG)}`;
  });
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function bboxToBounds(b: BBox4): LngLatBoundsLike {
  return [[b.minLng, b.minLat], [b.maxLng, b.maxLat]];
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
    features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: decodePolyline6(polyline6) } }],
  } as any;
}

function stopsGeoJSON(stops: TripStop[]) {
  return {
    type: "FeatureCollection",
    features: (stops ?? []).map((s, idx) => ({
      type: "Feature",
      properties: { id: s.id ?? `${idx}`, type: s.type ?? "poi", name: s.name ?? "", idx },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    })),
  } as any;
}

function catColor(c: PlaceCategory): string {
  switch (c) {
    case "fuel": return "#f59e0b"; case "camp": return "#22c55e"; case "water": return "#38bdf8";
    case "toilet": return "#a78bfa"; case "town": return "#eab308"; case "grocery": return "#34d399";
    case "mechanic": return "#fb7185"; case "hospital": return "#ef4444"; case "pharmacy": return "#f472b6";
    case "cafe": return "#c084fc"; case "restaurant": return "#f97316"; case "fast_food": return "#facc15";
    case "park": return "#4ade80"; case "beach": return "#60a5fa"; default: return "#94a3b8";
  }
}

function suggestionsGeoJSON(items: PlaceItem[], allowed?: Set<string> | null) {
  return {
    type: "FeatureCollection",
    features: (items ?? [])
      .filter((p) => (allowed ? allowed.has(p.id) : true))
      .map((p) => ({
        type: "Feature",
        properties: { id: p.id, name: p.name ?? "", category: p.category ?? "unknown", color: catColor(p.category) },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
  } as any;
}

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

/** Generate a heading cone polygon (fan shape) pointing in `heading` degrees from north */
function headingConeGeoJSON(pos: RoamPosition | null | undefined) {
  if (!pos || pos.heading == null || pos.speed == null || pos.speed < 0.5) {
    return { type: "FeatureCollection", features: [] } as any;
  }
  // Just use a point — the symbol layer with icon-rotate handles the visual
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { heading: pos.heading },
      geometry: { type: "Point", coordinates: [pos.lng, pos.lat] },
    }],
  } as any;
}

/**
 * Convert accuracy in meters to pixel radius at a given latitude and zoom.
 * Uses the Web Mercator meters-per-pixel formula.
 */
function accuracyToPixels(accuracyM: number, lat: number, zoom: number): number {
  const metersPerPixel = (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * 6371008.8) / (256 * Math.pow(2, zoom));
  const px = accuracyM / metersPerPixel;
  // Clamp between 12px and 200px for visual sanity
  return Math.max(12, Math.min(200, px));
}

function rewriteStyleForPMTiles(style: any, origin: string) {
  if (!style?.sources || typeof style.sources !== "object") return style;
  const out = { ...style, sources: { ...style.sources } };
  for (const [k, src] of Object.entries<any>(out.sources)) {
    if (!src || typeof src !== "object") continue;
    if (typeof src.url === "string" && src.url.startsWith("pmtiles://")) {
      out.sources[k] = { ...src, url: normalizePmtilesUrl(src.url, origin) };
    } else if (Array.isArray(src.tiles)) {
      out.sources[k] = { ...src, tiles: src.tiles.map((t: string) => typeof t === "string" && t.startsWith("pmtiles://") ? normalizePmtilesUrl(t, origin) : t) };
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

/* ── Component ───────────────────────────────────────────────────────── */

export function TripMap(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const protocolRef = useRef<Protocol | null>(null);
  const accuracyAnimFrame = useRef<number | null>(null);

  const routeFC = useMemo(() => routeGeoJSON(props.geometry), [props.geometry]);
  const stopsFC = useMemo(() => stopsGeoJSON(props.stops), [props.stops]);
  const sugFC = useMemo(() => suggestionsGeoJSON(props.suggestions ?? [], props.filteredSuggestionIds ?? null), [props.suggestions, props.filteredSuggestionIds]);
  const userLocFC = useMemo(() => userLocGeoJSON(props.userPosition), [props.userPosition]);
  const headingFC = useMemo(() => headingConeGeoJSON(props.userPosition), [props.userPosition]);

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

    // Load initial style
    (async () => {
      try {
        const res = await fetch(assetsApi.styleUrl(props.styleId));
        const styleJson = await res.json();
        map.setStyle(rewriteStyleForPMTiles(styleJson, origin), { diff: false });
      } catch (e) { console.error("[TripMap] style load failed", e); }
    })();

    const registerStopClick = (layerId: string) => {
      map.on("click", layerId, (e: any) => {
        const id = e?.features?.[0]?.properties?.id;
        if (id) props.onStopPress?.(String(id));
      });
      map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
    };

    // Long press for placing stops on map
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
        const dx = e.clientX - longPressPos.x;
        const dy = e.clientY - longPressPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    });

    map.getCanvas().addEventListener("pointerup", () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      longPressPos = null;
    });

    map.on("style.load", async () => {
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

      /* ── Stops layers ──────────────────────────────────────────── */
      addOrUpdateGeoJsonSource(map, STOPS_SRC, stopsFC);

      const stopFill = [
        "match", ["get", "type"],
        "start", "rgba(34,197,94,0.95)", "end", "rgba(239,68,68,0.95)",
        "via", "rgba(168,85,247,0.95)", "rgba(46,124,246,0.95)",
      ] as any;

      if (!map.getLayer(STOPS_SPARSE_Z0)) {
        map.addLayer({
          id: STOPS_SPARSE_Z0, type: "circle", source: STOPS_SRC, minzoom: 0, maxzoom: 6,
          filter: ["any", ["==", ["get", "type"], "start"], ["==", ["get", "type"], "end"], ["==", ["%", ["get", "idx"], 6], 0]],
          paint: { "circle-color": stopFill, "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 4, 6, 6], "circle-stroke-color": "rgba(0,0,0,0.45)", "circle-stroke-width": 1, "circle-opacity": 0.92 },
        });
      }
      if (!map.getLayer(STOPS_SPARSE_Z1)) {
        map.addLayer({
          id: STOPS_SPARSE_Z1, type: "circle", source: STOPS_SRC, minzoom: 6, maxzoom: 9,
          filter: ["any", ["==", ["get", "type"], "start"], ["==", ["get", "type"], "end"], ["==", ["%", ["get", "idx"], 3], 0]],
          paint: { "circle-color": stopFill, "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 9, 7], "circle-stroke-color": "rgba(0,0,0,0.45)", "circle-stroke-width": 1, "circle-opacity": 0.94 },
        });
      }
      if (!map.getLayer(STOPS_ALL)) {
        map.addLayer({
          id: STOPS_ALL, type: "circle", source: STOPS_SRC, minzoom: 9,
          paint: { "circle-color": stopFill, "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5.5, 13, 8, 16, 10], "circle-stroke-color": "rgba(0,0,0,0.45)", "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 16, 1.5], "circle-opacity": 0.96 },
        });
      }
      if (!map.getLayer(STOP_FOCUS_LAYER)) {
        map.addLayer({
          id: STOP_FOCUS_LAYER, type: "circle", source: STOPS_SRC,
          filter: ["==", ["get", "id"], props.focusedStopId ?? ""],
          paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 9, 10, 12, 14, 16], "circle-color": "rgba(255,255,255,0.12)", "circle-stroke-color": "rgba(255,255,255,0.85)", "circle-stroke-width": 2, "circle-opacity": 1 },
        });
      }

      registerStopClick(STOPS_SPARSE_Z0);
      registerStopClick(STOPS_SPARSE_Z1);
      registerStopClick(STOPS_ALL);

      /* ── Suggestions (clustered) ───────────────────────────────── */
      addOrUpdateGeoJsonSource(map, SUG_SRC, sugFC, { cluster: true, clusterMaxZoom: 13, clusterRadius: 50 });

      if (!map.getLayer(SUG_CLUSTER_CIRCLE)) {
        map.addLayer({
          id: SUG_CLUSTER_CIRCLE, type: "circle", source: SUG_SRC,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": ["step", ["get", "point_count"], "rgba(99,102,241,0.85)", 20, "rgba(245,158,11,0.85)", 100, "rgba(239,68,68,0.85)"],
            "circle-radius": ["step", ["get", "point_count"], 14, 20, 18, 100, 24],
            "circle-stroke-color": "rgba(0,0,0,0.3)", "circle-stroke-width": 1.5, "circle-opacity": 0.9,
          },
        });
      }
      if (!map.getLayer(SUG_CLUSTER_COUNT)) {
        map.addLayer({
          id: SUG_CLUSTER_COUNT, type: "symbol", source: SUG_SRC,
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-allow-overlap": true },
          paint: { "text-color": "#ffffff" },
        });
      }
      if (!map.getLayer(SUG_UNCLUSTERED)) {
        map.addLayer({
          id: SUG_UNCLUSTERED, type: "circle", source: SUG_SRC,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 12, 6, 16, 8],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "rgba(0,0,0,0.45)",
            "circle-stroke-width": ["case", ["==", ["get", "id"], props.focusedSuggestionId ?? ""], 2.5, 1],
            "circle-opacity": 0.92,
          },
        });
      }
      if (!map.getLayer(SUG_UNCLUSTERED_LABEL)) {
        map.addLayer({
          id: SUG_UNCLUSTERED_LABEL, type: "symbol", source: SUG_SRC,
          filter: ["!", ["has", "point_count"]], minzoom: 12,
          layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 13], "text-offset": [0, 1.2], "text-anchor": "top", "text-max-width": 10, "text-optional": true, "text-allow-overlap": false },
          paint: { "text-color": "rgba(255,255,255,0.9)", "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1.2 },
        });
      }

      // Suggestion interactions
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

      map.on("click", SUG_UNCLUSTERED, (e: any) => {
        const f = e?.features?.[0];
        const id = f?.properties?.id;
        if (!id) return;
        props.onSuggestionPress?.(String(id));
        const name = f?.properties?.name ?? "";
        const cat = f?.properties?.category ?? "";
        const html = `<div style="font-size:1.05rem;font-weight:800;letter-spacing:-0.1px">${escapeHtml(String(name))}</div><div style="font-size:0.8rem;font-weight:600;color:var(--roam-text-muted)">${escapeHtml(String(cat))}</div>`;
        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: "trip-map-popup" }).setLngLat(e.lngLat).setHTML(html).addTo(map);
        } catch {}
      });

      map.on("mouseenter", SUG_CLUSTER_CIRCLE, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", SUG_CLUSTER_CIRCLE, () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", SUG_UNCLUSTERED, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", SUG_UNCLUSTERED, () => (map.getCanvas().style.cursor = ""));

      /* ── User location layers (blue dot + accuracy + heading) ── */
      addOrUpdateGeoJsonSource(map, USER_LOC_SRC, userLocFC);
      addOrUpdateGeoJsonSource(map, USER_LOC_HEADING_SRC, headingFC);

      // Accuracy ring (large, semi-transparent)
      if (!map.getLayer(USER_LOC_ACCURACY)) {
        map.addLayer({
          id: USER_LOC_ACCURACY, type: "circle", source: USER_LOC_SRC,
          paint: {
            "circle-radius": 30, // updated dynamically
            "circle-color": "rgba(37,99,235,0.08)",
            "circle-stroke-color": "rgba(37,99,235,0.25)",
            "circle-stroke-width": 1.5,
            "circle-opacity": 1,
          },
        });
      }

      // Heading arrow (loaded as custom icon)
      await loadHeadingArrow(map);
      if (!map.getLayer(USER_LOC_HEADING)) {
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
      }

      // Blue dot - outer ring (white)
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

      // Blue dot - inner core
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

      // Initial fit
      try { map.fitBounds(bboxToBounds(props.bbox), { padding: 60, duration: 0 }); } catch {}
    });

    // Update accuracy ring radius on zoom change
    map.on("zoom", () => {
      if (accuracyAnimFrame.current) cancelAnimationFrame(accuracyAnimFrame.current);
      accuracyAnimFrame.current = requestAnimationFrame(() => {
        if (!map.getLayer(USER_LOC_ACCURACY)) return;
        const pos = props.userPosition;
        if (!pos) return;
        const px = accuracyToPixels(pos.accuracy, pos.lat, map.getZoom());
        map.setPaintProperty(USER_LOC_ACCURACY, "circle-radius", px);
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

  /* ── User location updates ──────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const locSrc: any = map.getSource(USER_LOC_SRC);
    if (locSrc?.setData) locSrc.setData(userLocFC);

    const headSrc: any = map.getSource(USER_LOC_HEADING_SRC);
    if (headSrc?.setData) headSrc.setData(headingFC);

    // Update accuracy ring radius
    const pos = props.userPosition;
    if (pos && map.getLayer(USER_LOC_ACCURACY)) {
      const px = accuracyToPixels(pos.accuracy, pos.lat, map.getZoom());
      map.setPaintProperty(USER_LOC_ACCURACY, "circle-radius", px);
    }
  }, [userLocFC, headingFC, props.userPosition]);

  /* ── Focus suggestion → ease to it ──────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = props.focusedSuggestionId ?? null;
    if (!id) return;
    const p = (props.suggestions ?? []).find((x) => x.id === id);
    if (!p) return;
    try { map.easeTo({ center: [p.lng, p.lat], duration: 350, zoom: Math.max(map.getZoom(), 11) }); } catch {}
    if (map.getLayer(SUG_UNCLUSTERED)) {
      map.setPaintProperty(SUG_UNCLUSTERED, "circle-stroke-width", ["case", ["==", ["get", "id"], id], 2.5, 1]);
    }
  }, [props.focusedSuggestionId, props.suggestions]);

  /* ── Bbox change → refit ────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try { map.fitBounds(bboxToBounds(props.bbox), { padding: 60, duration: 250 }); } catch {}
  }, [props.bbox.minLat, props.bbox.minLng, props.bbox.maxLat, props.bbox.maxLng]);

  return (
    <div className="trip-map-fullscreen">
      <div ref={containerRef} className="trip-map-inner" />
      <style>{`
        .trip-map-popup .maplibregl-popup-content {
          border-radius: 16px; padding: 16px;
          box-shadow: var(--shadow-heavy);
          background: var(--roam-surface); color: var(--roam-text);
        }
      `}</style>
    </div>
  );
}