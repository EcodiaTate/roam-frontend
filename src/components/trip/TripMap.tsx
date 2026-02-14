"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type Map as MLMap, type LngLatBoundsLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";

import type { BBox4 } from "@/lib/types/geo";
import type { TripStop } from "@/lib/types/trip";
import type { PlaceItem, PlaceCategory } from "@/lib/types/places";

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
};

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
const SUG_LAYER = "roam-suggestions-layer";

function bboxToBounds(b: BBox4): LngLatBoundsLike {
  return [
    [b.minLng, b.minLat],
    [b.maxLng, b.maxLat],
  ];
}

/**
 * Polyline decoder (Google polyline algorithm) with precision=6.
 * Returns coordinates as [lng, lat].
 */
function decodePolyline6(poly: string): Array<[number, number]> {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: Array<[number, number]> = [];
  const factor = 1e6;

  while (index < poly.length) {
    let result = 0;
    let shift = 0;
    let b: number;

    do {
      b = poly.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = poly.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}

function routeGeoJSON(polyline6: string) {
  const coords = decodePolyline6(polyline6);
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      },
    ],
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

function catColor(c: PlaceCategory): string {
  switch (c) {
    case "fuel": return "#f59e0b";
    case "camp": return "#22c55e";
    case "water": return "#38bdf8";
    case "toilet": return "#a78bfa";
    case "town": return "#eab308";
    case "grocery": return "#34d399";
    case "mechanic": return "#fb7185";
    case "hospital": return "#ef4444";
    case "pharmacy": return "#f472b6";
    case "cafe": return "#c084fc";
    case "restaurant": return "#f97316";
    case "fast_food": return "#facc15";
    case "park": return "#4ade80";
    case "beach": return "#60a5fa";
    default: return "#94a3b8";
  }
}

function suggestionsGeoJSON(items: PlaceItem[], allowed?: Set<string> | null) {
  return {
    type: "FeatureCollection",
    features: (items ?? [])
      .filter((p) => (allowed ? allowed.has(p.id) : true))
      .map((p) => ({
        type: "Feature",
        properties: {
          id: p.id,
          name: p.name ?? "",
          category: p.category ?? "unknown",
          color: catColor(p.category),
        },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
  } as any;
}

/**
 * Rewrite style sources that reference pmtiles://offline/... or pmtiles:///...
 * into pmtiles://<absolute_url>.
 */
function rewriteStyleForPMTiles(style: any, origin: string) {
  if (!style || typeof style !== "object") return style;
  if (!style.sources || typeof style.sources !== "object") return style;

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
  let inner = u.slice("pmtiles://".length);
  inner = inner.replace(/^\/+/, "");

  if (/^https?:\/\//i.test(inner)) return `pmtiles://${inner}`;

  const path = inner.startsWith("offline/") ? `/${inner}` : inner.startsWith("/") ? inner : `/${inner}`;
  const abs = `${origin}${path}`;
  return `pmtiles://${abs}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function addOrUpdateGeoJsonSource(map: MLMap, id: string, data: any) {
  const src: any = map.getSource(id);
  if (!src) {
    map.addSource(id, { type: "geojson", data });
    return;
  }
  if (src?.setData) src.setData(data);
}

export function TripMap(props: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const protocolRef = useRef<Protocol | null>(null);

  const routeFC = useMemo(() => routeGeoJSON(props.geometry), [props.geometry]);
  const stopsFC = useMemo(() => stopsGeoJSON(props.stops), [props.stops]);

  const sugFC = useMemo(() => {
    const items = props.suggestions ?? [];
    return suggestionsGeoJSON(items, props.filteredSuggestionIds ?? null);
  }, [props.suggestions, props.filteredSuggestionIds]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const origin = typeof window !== "undefined" ? window.location.origin : "";

    const protocol = new Protocol();
    protocolRef.current = protocol;
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: { version: 8, sources: {}, layers: [] } as any,
      center: [(props.bbox.minLng + props.bbox.maxLng) / 2, (props.bbox.minLat + props.bbox.maxLat) / 2],
      zoom: 6,
      attributionControl: false,
      transformRequest: (url) => {
        if (typeof url === "string" && url.startsWith("pmtiles://")) {
          return { url: normalizePmtilesUrl(url, origin) };
        }
        return { url };
      },
    });

    mapRef.current = map;

    (async () => {
      try {
        const styleUrl = assetsApi.styleUrl(props.styleId);
        const res = await fetch(styleUrl);
        const styleJson = await res.json();
        const rewritten = rewriteStyleForPMTiles(styleJson, origin);
        map.setStyle(rewritten, { diff: false });
      } catch (e) {
        console.error("[TripMap] failed to load style", e);
      }
    })();

    const registerStopClick = (layerId: string) => {
      map.on("click", layerId, (e: any) => {
        const f = e?.features?.[0];
        const id = f?.properties?.id;
        if (!id) return;
        props.onStopPress?.(String(id));
      });
      map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
    };

    map.on("style.load", () => {
      addOrUpdateGeoJsonSource(map, ROUTE_SRC, routeFC);
      addOrUpdateGeoJsonSource(map, STOPS_SRC, stopsFC);
      addOrUpdateGeoJsonSource(map, SUG_SRC, sugFC);

      // --- ROUTE: glow + casing + core ---
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

      // --- STOPS ---
      const stopFill = [
        "match", ["get", "type"],
        "start", "rgba(34,197,94,0.95)",
        "end", "rgba(239,68,68,0.95)",
        "via", "rgba(168,85,247,0.95)",
        "rgba(46,124,246,0.95)", 
      ] as any;
      const stopStroke = "rgba(0,0,0,0.45)";

      if (!map.getLayer(STOPS_SPARSE_Z0)) {
        map.addLayer({
          id: STOPS_SPARSE_Z0, type: "circle", source: STOPS_SRC, minzoom: 0, maxzoom: 6,
          filter: ["any", ["==", ["get", "type"], "start"], ["==", ["get", "type"], "end"], ["==", ["%", ["get", "idx"], 6], 0]],
          paint: { "circle-color": stopFill, "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 4, 6, 6], "circle-stroke-color": stopStroke, "circle-stroke-width": 1, "circle-opacity": 0.92 },
        });
      }

      if (!map.getLayer(STOPS_SPARSE_Z1)) {
        map.addLayer({
          id: STOPS_SPARSE_Z1, type: "circle", source: STOPS_SRC, minzoom: 6, maxzoom: 9,
          filter: ["any", ["==", ["get", "type"], "start"], ["==", ["get", "type"], "end"], ["==", ["%", ["get", "idx"], 3], 0]],
          paint: { "circle-color": stopFill, "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 9, 7], "circle-stroke-color": stopStroke, "circle-stroke-width": 1, "circle-opacity": 0.94 },
        });
      }

      if (!map.getLayer(STOPS_ALL)) {
        map.addLayer({
          id: STOPS_ALL, type: "circle", source: STOPS_SRC, minzoom: 9,
          paint: { "circle-color": stopFill, "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5.5, 13, 8, 16, 10], "circle-stroke-color": stopStroke, "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 16, 1.5], "circle-opacity": 0.96 },
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

      // --- Suggestions ---
      if (!map.getLayer(SUG_LAYER)) {
        map.addLayer({
          id: SUG_LAYER, type: "circle", source: SUG_SRC,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["case", ["==", ["get", "id"], props.focusedSuggestionId ?? ""], 7, 5], 12, ["case", ["==", ["get", "id"], props.focusedSuggestionId ?? ""], 10, 7]],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "rgba(0,0,0,0.45)",
            "circle-stroke-width": ["case", ["==", ["get", "id"], props.focusedSuggestionId ?? ""], 2, 1],
            "circle-opacity": 0.92,
          },
        });
      }

      map.on("click", SUG_LAYER, (e: any) => {
        const f = e?.features?.[0];
        const id = f?.properties?.id;
        if (!id) return;

        props.onSuggestionPress?.(String(id));

        const name = f?.properties?.name ?? "";
        const cat = f?.properties?.category ?? "";
        // 🚨 Updated to use our UI classes so the tooltip looks native
        const html = `<div class="trip-title">${escapeHtml(String(name))}</div><div class="trip-muted-small">${escapeHtml(String(cat))}</div>`;

        try {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
        } catch {}
      });

      map.on("mouseenter", SUG_LAYER, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", SUG_LAYER, () => (map.getCanvas().style.cursor = ""));

      try {
        map.fitBounds(bboxToBounds(props.bbox), { padding: 60, duration: 0 });
      } catch {}
    });

    return () => {
      try { popupRef.current?.remove(); } catch {}
      try { map.remove(); } catch {}
      try { if (protocolRef.current) maplibregl.removeProtocol("pmtiles"); } catch {}
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    (async () => {
      try {
        const styleUrl = assetsApi.styleUrl(props.styleId);
        const res = await fetch(styleUrl);
        const styleJson = await res.json();
        const rewritten = rewriteStyleForPMTiles(styleJson, origin);
        map.setStyle(rewritten, { diff: false });
      } catch (e) {
        console.error("[TripMap] failed to load style", e);
      }
    })();
  }, [props.styleId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src: any = map.getSource(ROUTE_SRC);
    if (src?.setData) src.setData(routeFC);
  }, [routeFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src: any = map.getSource(STOPS_SRC);
    if (src?.setData) src.setData(stopsFC);
  }, [stopsFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(STOP_FOCUS_LAYER)) {
      map.setFilter(STOP_FOCUS_LAYER, ["==", ["get", "id"], props.focusedStopId ?? ""]);
    }
  }, [props.focusedStopId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src: any = map.getSource(SUG_SRC);
    if (src?.setData) src.setData(sugFC);
  }, [sugFC]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = props.focusedSuggestionId ?? null;
    if (!id) return;

    const items = props.suggestions ?? [];
    const p = items.find((x) => x.id === id);
    if (!p) return;

    try {
      map.easeTo({ center: [p.lng, p.lat], duration: 350, zoom: Math.max(map.getZoom(), 11) });
    } catch {}
  }, [props.focusedSuggestionId, props.suggestions]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.fitBounds(bboxToBounds(props.bbox), { padding: 60, duration: 250 });
    } catch {}
  }, [props.bbox.minLat, props.bbox.minLng, props.bbox.maxLat, props.bbox.maxLng]);

  return (
    <div className="trip-map-wrap">
      <div ref={containerRef} className="trip-map-inner" />
    </div>
  );
}