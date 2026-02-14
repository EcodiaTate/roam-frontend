"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type Map as MLMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";

import type { TripStop } from "@/lib/types/trip";
import type { NavPack, CorridorGraphPack, TrafficOverlay, HazardOverlay } from "@/lib/types/navigation";
import type { PlacesPack } from "@/lib/types/places";
import type { NavCoord } from "@/lib/types/geo";
import { assetsApi } from "@/lib/api/assets";
import { polyline6ToGeoJSONLine } from "@/lib/nav/polyline6";

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

/**
 * Ensure path begins with "/" and collapse accidental leading slashes.
 */
function normalizePath(p: string) {
  let x = (p ?? "").trim();
  x = x.replace(/^\/+/, "/");
  if (!x.startsWith("/")) x = `/${x}`;
  return x;
}

/**
 * Convert a relative path to an absolute URL (origin-prefixed).
 * Keeps full URLs intact.
 */
function toAbsoluteUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (typeof window === "undefined") return pathOrUrl;
  const p = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${window.location.origin}${p}`;
}

/**
 * Normalize pmtiles:// references so MapLibre fetches the PMTiles file
 * from the frontend-served /public/offline/* assets.
 */
function rewritePmtilesUrl(url: string) {
  if (!url.startsWith("pmtiles://")) return url;

  const inner = url.slice("pmtiles://".length);

  if (/^https?:\/\//i.test(inner)) return url;

  const normalizedPath = normalizePath(inner);
  const abs = toAbsoluteUrl(normalizedPath);

  return `pmtiles://${abs}`;
}

export function NewTripMap(props: {
  stops: TripStop[];
  navPack: NavPack | null;
  styleId: string; // e.g. "roam-basemap-vector-bright"
  onMapCenterChanged?: (c: NavCoord) => void;

  corridorPack?: CorridorGraphPack | null;
  placesPack?: PlacesPack | null;
  traffic?: TrafficOverlay | null;
  hazards?: HazardOverlay | null;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);

  const stylePath = useMemo(() => assetsApi.styleUrl(props.styleId), [props.styleId]);
  const styleUrl = useMemo(() => toAbsoluteUrl(stylePath), [stylePath]);

  // init map once
  useEffect(() => {
    if (!elRef.current) return;
    if (mapRef.current) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

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
      props.onMapCenterChanged?.({ lat: c.lat, lng: c.lng });
    });

    map.on("load", () => {
      ensureSources(map);
      syncStops(map, props.stops);
      syncRoute(map, props.navPack);
      syncPlaces(map, props.placesPack ?? null);
      syncTraffic(map, props.traffic ?? null);
      syncHazards(map, props.hazards ?? null);
    });

    return () => {
      try {
        map.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setStyle(styleUrl);

    const onStyleLoad = () => {
      ensureSources(map);
      syncStops(map, props.stops);
      syncRoute(map, props.navPack);
      syncPlaces(map, props.placesPack ?? null);
      syncTraffic(map, props.traffic ?? null);
      syncHazards(map, props.hazards ?? null);
    };

    map.once("style.load", onStyleLoad);

    return () => {
      try {
        map.off("style.load", onStyleLoad);
      } catch {
        // ignore
      }
    };
  }, [styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureSources(map);
    syncStops(map, props.stops);
  }, [props.stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureSources(map);
    syncRoute(map, props.navPack);
  }, [props.navPack]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureSources(map);
    syncPlaces(map, props.placesPack ?? null);
  }, [props.placesPack]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureSources(map);
    syncTraffic(map, props.traffic ?? null);
  }, [props.traffic]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureSources(map);
    syncHazards(map, props.hazards ?? null);
  }, [props.hazards]);

  return (
    <div className="trip-map-wrap">
      <div ref={elRef} className="trip-map-inner" />
    </div>
  );
}

function ensureSources(map: MLMap) {
  // Route
  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
      id: ROUTE_LAYER,
      type: "line",
      source: ROUTE_SOURCE,
      paint: {
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 3, 10, 5, 14, 8],
        "line-opacity": 0.9,
        "line-color": "#2e7cf6",
      },
    });
  }

  // Stops
  if (!map.getSource(STOPS_SOURCE)) {
    map.addSource(STOPS_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
      id: STOPS_LAYER,
      type: "circle",
      source: STOPS_SOURCE,
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

  // Places
  if (!map.getSource(PLACES_SOURCE)) {
    map.addSource(PLACES_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
      id: PLACES_LAYER,
      type: "circle",
      source: PLACES_SOURCE,
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

  // Traffic
  if (!map.getSource(TRAFFIC_SOURCE)) {
    map.addSource(TRAFFIC_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
      id: TRAFFIC_LAYER,
      type: "circle",
      source: TRAFFIC_SOURCE,
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

  // Hazards
  if (!map.getSource(HAZARDS_SOURCE)) {
    map.addSource(HAZARDS_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
      id: HAZARDS_LAYER,
      type: "circle",
      source: HAZARDS_SOURCE,
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

function syncStops(map: MLMap, stops: TripStop[]) {
  const src = map.getSource(STOPS_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;

  const features = stops.map((s, idx) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] as [number, number] },
    properties: {
      id: s.id ?? String(idx),
      type: s.type ?? "poi",
      name: s.name ?? "",
      idx,
    },
  }));

  src.setData({ type: "FeatureCollection", features });
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
    src.setData({ type: "FeatureCollection", features: [] });
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
      [
        [b.minLng, b.minLat],
        [b.maxLng, b.maxLat],
      ],
      { padding: 80, duration: 600 },
    );
  }
}

function syncPlaces(map: MLMap, pack: PlacesPack | null) {
  const src = map.getSource(PLACES_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;

  const items: any[] = (pack as any)?.items ?? (pack as any)?.places ?? [];

  if (!items.length) {
    src.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const features = items.map((it) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [it.lng, it.lat] as [number, number] },
    properties: {
      id: it.id,
      name: it.name,
      category: it.category,
    },
  }));

  src.setData({ type: "FeatureCollection", features });
}

function pointFromBbox(b: number[] | null | undefined): [number, number] | null {
  if (!b || b.length !== 4) return null;
  const [minLng, minLat, maxLng, maxLat] = b;
  if (![minLng, minLat, maxLng, maxLat].every((x) => typeof x === "number" && Number.isFinite(x))) return null;
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

function tryPointFromGeoJSON(g: any): [number, number] | null {
  try {
    if (!g || typeof g !== "object") return null;
    if (g.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      const lng = Number(g.coordinates[0]);
      const lat = Number(g.coordinates[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
    }
  } catch {
    // ignore
  }
  return null;
}

function syncTraffic(map: MLMap, overlay: TrafficOverlay | null) {
  const src = map.getSource(TRAFFIC_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;

  const items: any[] = (overlay as any)?.items ?? [];

  if (!items.length) {
    src.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const features = items
    .map((ev) => {
      const p = tryPointFromGeoJSON(ev.geometry) ?? pointFromBbox(ev.bbox);
      if (!p) return null;
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: p },
        properties: {
          id: ev.id,
          type: ev.type ?? "unknown",
          severity: ev.severity ?? "unknown",
          headline: ev.headline ?? "",
          source: ev.source ?? "",
        },
      };
    })
    .filter(Boolean) as any[];

  src.setData({ type: "FeatureCollection", features });
}

function syncHazards(map: MLMap, overlay: HazardOverlay | null) {
  const src = map.getSource(HAZARDS_SOURCE) as GeoJSONSource | undefined;
  if (!src) return;

  const items: any[] = (overlay as any)?.items ?? [];

  if (!items.length) {
    src.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const features = items
    .map((ev) => {
      const p = tryPointFromGeoJSON(ev.geometry) ?? pointFromBbox(ev.bbox);
      if (!p) return null;
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: p },
        properties: {
          id: ev.id,
          kind: ev.kind ?? "unknown",
          severity: ev.severity ?? "unknown",
          title: ev.title ?? "",
          source: ev.source ?? "",
        },
      };
    })
    .filter(Boolean) as any[];

  src.setData({ type: "FeatureCollection", features });
}