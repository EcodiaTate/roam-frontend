// src/app/(app)/discover/TripPreviewMap.tsx
// Lightweight read-only map used in the Discover trip preview sheet.
// Renders a route polyline + stop pins on an online raster tile basemap.
// Uses MapLibre GL — same library as the rest of the app.
"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
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
        paint: { "line-color": "#fff", "line-width": 5, "line-opacity": 0.9 },
      });

      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#3b82f6", "line-width": 3.5 },
      });

      // Add stop markers (start = green, end = red, via = blue dot)
      stops.forEach((stop, i) => {
        const isStart = stop.type === "start" || i === 0;
        const isEnd = stop.type === "end" || i === stops.length - 1;

        const el = document.createElement("div");
        el.style.cssText = `
          width: ${isStart || isEnd ? 12 : 8}px;
          height: ${isStart || isEnd ? 12 : 8}px;
          border-radius: 50%;
          background: ${isStart ? "#16a34a" : isEnd ? "#dc2626" : "#3b82f6"};
          border: 2px solid #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.35);
        `;

        new maplibregl.Marker({ element: el })
          .setLngLat([stop.lng, stop.lat])
          .addTo(map);
      });

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
      style={{ width: "100%", height: "100%", background: "#e8eaed" }}
    />
  );
}
