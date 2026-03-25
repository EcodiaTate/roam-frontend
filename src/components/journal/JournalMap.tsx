// src/components/journal/JournalMap.tsx
//
// Lightweight MapLibre map for the journal/memories page.
// Plots memory stop pins with satellite style (online) or vector fallback (offline).

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import type { StyleSpecification, SourceSpecification } from "@maplibre/maplibre-gl-style-spec";
import { Protocol } from "pmtiles";

import { assetsApi } from "@/lib/api/assets";
import {
    rewriteStyleForLocalServer,
    isFullyOfflineCapable,
} from "@/lib/offline/basemapManager";
import type { MapBaseMode, VectorTheme } from "@/components/trips/new/MapStyleSwitcher";

/* ── Constants ────────────────────────────────────────────────────────── */

const MEM_SOURCE = "roam_journal_pins";
const MEM_LAYER_CIRCLE = "roam_journal_circle";
const MEM_LAYER_LABEL = "roam_journal_label";

let pmtilesRegistered = false;
function ensurePmtiles() {
  if (pmtilesRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  pmtilesRegistered = true;
}

/* ── Types ────────────────────────────────────────────────────────────── */

export type JournalPin = {
  id: string;
  stopName: string | null;
  stopIndex: number;
  lat: number;
  lng: number;
  hasPhotos: boolean;
  hasNote: boolean;
};

type Props = {
  pins: JournalPin[];
  onPinPress?: (id: string) => void;
  /** Current style selection */
  mode: MapBaseMode;
  vectorTheme: VectorTheme;
};

/* ── Helpers ──────────────────────────────────────────────────────────── */

function styleIdFor(mode: MapBaseMode, vectorTheme: VectorTheme): string {
  if (mode === "hybrid") return "roam-basemap-hybrid";
  return vectorTheme === "dark"
    ? "roam-basemap-vector-dark"
    : "roam-basemap-vector-bright";
}

function normalizePmtilesUrl(u: string, origin: string) {
  const inner = u.slice("pmtiles://".length).replace(/^\/+/, "");
  if (/^https?:\/\//i.test(inner)) return `pmtiles://${inner}`;
  const path = inner.startsWith("/") ? inner : `/${inner}`;
  return `pmtiles://${origin}${path}`;
}

function rewriteStyleForPMTiles(
  style: StyleSpecification,
  origin: string,
): StyleSpecification {
  if (!style?.sources || typeof style.sources !== "object") return style;
  const out = { ...style, sources: { ...style.sources } };
  for (const [k, src] of Object.entries(out.sources)) {
    if (!src || typeof src !== "object") continue;
    const s = src as Record<string, unknown>;
    if (typeof s.url === "string" && s.url.startsWith("pmtiles://")) {
      out.sources[k] = {
        ...src,
        url: normalizePmtilesUrl(s.url as string, origin),
      } as SourceSpecification;
    } else if (Array.isArray(s.tiles)) {
      out.sources[k] = {
        ...src,
        tiles: (s.tiles as string[]).map((t: string) =>
          typeof t === "string" && t.startsWith("pmtiles://")
            ? normalizePmtilesUrl(t, origin)
            : t,
        ),
      } as SourceSpecification;
    }
  }
  return out;
}

async function loadStyle(
  mode: MapBaseMode,
  vectorTheme: VectorTheme,
): Promise<StyleSpecification> {
  const id = styleIdFor(mode, vectorTheme);
  const res = await fetch(assetsApi.styleUrl(id));
  let json = await res.json();
  if (isFullyOfflineCapable()) {
    json = rewriteStyleForLocalServer(json);
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return rewriteStyleForPMTiles(json as StyleSpecification, origin);
}

function pinsToGeoJSON(pins: JournalPin[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        name: p.stopName ?? `Stop ${p.stopIndex + 1}`,
        hasPhotos: p.hasPhotos,
        hasNote: p.hasNote,
      },
    })),
  };
}

/* ── Component ────────────────────────────────────────────────────────── */

export function JournalMap({ pins, onPinPress, mode, vectorTheme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const onPinPressRef = useRef(onPinPress);
  onPinPressRef.current = onPinPress;
  const [loaded, setLoaded] = useState(false);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensurePmtiles();
    let cancelled = false;

    (async () => {
      const style = await loadStyle(mode, vectorTheme);
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        zoom: 4,
        center: [134, -26],
        attributionControl: false,
      });
      mapRef.current = map;

      map.on("load", () => {
        if (cancelled) return;

        map.addSource(MEM_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        // Outer glow ring
        map.addLayer({
          id: MEM_LAYER_CIRCLE + "_glow",
          type: "circle",
          source: MEM_SOURCE,
          paint: {
            "circle-radius": 14,
            "circle-color": "rgba(46, 124, 246, 0.18)",
            "circle-blur": 0.6,
          },
        });

        // Main pin circle
        map.addLayer({
          id: MEM_LAYER_CIRCLE,
          type: "circle",
          source: MEM_SOURCE,
          paint: {
            "circle-radius": 8,
            "circle-color": "#2e7cf6",
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#fff",
          },
        });

        // Label
        map.addLayer({
          id: MEM_LAYER_LABEL,
          type: "symbol",
          source: MEM_SOURCE,
          layout: {
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-offset": [0, 1.8],
            "text-anchor": "top",
            "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
            "text-max-width": 10,
          },
          paint: {
            "text-color": mode === "hybrid" ? "#fff" : "var(--roam-text, #1a1613)",
            "text-halo-color": mode === "hybrid" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)",
            "text-halo-width": 1.2,
          },
        });

        // Click handler
        map.on("click", MEM_LAYER_CIRCLE, (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id) onPinPressRef.current?.(String(id));
        });
        map.on("mouseenter", MEM_LAYER_CIRCLE, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", MEM_LAYER_CIRCLE, () => {
          map.getCanvas().style.cursor = "";
        });

        setLoaded(true);
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Style change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    (async () => {
      const style = await loadStyle(mode, vectorTheme);
      if (cancelled) return;
      setLoaded(false);
      map.setStyle(style, { diff: false });
    })();

    return () => { cancelled = true; };
  }, [mode, vectorTheme]);

  // Re-add sources/layers after style change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onStyleData = () => {
      if (!map.isStyleLoaded()) return;

      // Sources/layers are wiped on setStyle - re-add them
      if (!map.getSource(MEM_SOURCE)) {
        map.addSource(MEM_SOURCE, {
          type: "geojson",
          data: pinsToGeoJSON(pins),
        });

        map.addLayer({
          id: MEM_LAYER_CIRCLE + "_glow",
          type: "circle",
          source: MEM_SOURCE,
          paint: {
            "circle-radius": 14,
            "circle-color": "rgba(46, 124, 246, 0.18)",
            "circle-blur": 0.6,
          },
        });

        map.addLayer({
          id: MEM_LAYER_CIRCLE,
          type: "circle",
          source: MEM_SOURCE,
          paint: {
            "circle-radius": 8,
            "circle-color": "#2e7cf6",
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#fff",
          },
        });

        const isHybrid = mode === "hybrid";
        map.addLayer({
          id: MEM_LAYER_LABEL,
          type: "symbol",
          source: MEM_SOURCE,
          layout: {
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-offset": [0, 1.8],
            "text-anchor": "top",
            "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
            "text-max-width": 10,
          },
          paint: {
            "text-color": isHybrid ? "#fff" : "#1a1613",
            "text-halo-color": isHybrid ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)",
            "text-halo-width": 1.2,
          },
        });

        // Re-register click handler
        map.on("click", MEM_LAYER_CIRCLE, (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id) onPinPressRef.current?.(String(id));
        });
        map.on("mouseenter", MEM_LAYER_CIRCLE, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", MEM_LAYER_CIRCLE, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      setLoaded(true);
    };

    map.on("styledata", onStyleData);
    return () => { map.off("styledata", onStyleData); };
  }, [mode, vectorTheme, pins]);

  // Update pins data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const src = map.getSource(MEM_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(pinsToGeoJSON(pins));

    // Fit bounds
    if (pins.length > 0) {
      if (pins.length === 1) {
        map.flyTo({ center: [pins[0].lng, pins[0].lat], zoom: 12 });
      } else {
        const lngs = pins.map((p) => p.lng);
        const lats = pins.map((p) => p.lat);
        map.fitBounds(
          [
            [Math.min(...lngs) - 0.3, Math.min(...lats) - 0.3],
            [Math.max(...lngs) + 0.3, Math.max(...lats) + 0.3],
          ],
          { padding: 48, maxZoom: 14 },
        );
      }
    }
  }, [pins, loaded]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 0 }}
    />
  );
}
