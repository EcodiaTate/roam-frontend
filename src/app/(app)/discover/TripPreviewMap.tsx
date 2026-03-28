// src/app/(app)/discover/TripPreviewMap.tsx
// Lightweight read-only map used in the Discover trip preview sheet.
// Renders a route polyline + stop pins on an online raster tile basemap.
// Uses MapLibre GL - same library as the rest of the app.

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { TripStop } from "@/lib/types/trip";
import { decodePolyline6AsLngLat } from "@/lib/nav/polyline6";

type Props = {
  geometry: string; // polyline6-encoded route
  stops: TripStop[];
  bbox: [number, number, number, number]; // [west, south, east, north]
};

export default function TripPreviewMap({ geometry, stops, bbox }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = new maplibregl.Map({
      container: el,
      style: {
        version: 8,
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
            maxzoom: 19,
          },
        },
        layers: [
          {
            id: "osm-tiles",
            type: "raster",
            source: "osm",
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      },
      interactive: false,
      attributionControl: false,
      logoPosition: "bottom-left",
    });

    mapRef.current = map;

    map.on("load", () => {
      // Decode route geometry
      const coords = decodePolyline6AsLngLat(geometry);

      // Add route source + layer
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {},
        },
      });

      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "rgba(255,255,255,0.85)", "line-width": 3.5 },
      });

      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#3b82f6", "line-width": 2.5 },
      });

      // Minimal start/end dots only - no intermediate markers on card previews
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (first && last) {
        [
          { stop: first, color: "var(--roam-success)" },
          { stop: last,  color: "var(--roam-danger)" },
        ].forEach(({ stop, color }) => {
          const el = document.createElement("div");
          el.style.cssText = `
            width: 6px; height: 6px; border-radius: 50%;
            background: ${color}; border: 1.5px solid #fff;
            box-shadow: 0 0 2px rgba(0,0,0,0.2);
          `;
          new maplibregl.Marker({ element: el })
            .setLngLat([stop.lng, stop.lat])
            .addTo(map);
        });
      }

      // Fit to bbox with padding
      const [west, south, east, north] = bbox;
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 28, animate: false },
      );
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // geometry + stops + bbox won't change after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", background: "var(--roam-surface-hover)" }}
    />
  );
}
