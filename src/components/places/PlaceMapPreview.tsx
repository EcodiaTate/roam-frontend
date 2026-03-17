// src/components/places/PlaceMapPreview.tsx
//
// Lightweight MapLibre mini-map showing a single place marker.
// Used inside PlaceDetailSheet. Dynamically imported to avoid bloating
// the initial bundle with maplibre-gl.
"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { assetsApi } from "@/lib/api/assets";
import { rewriteStyleForLocalServer, isFullyOfflineCapable } from "@/lib/offline/basemapManager";
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";

let pmtilesRegistered = false;
function ensurePmtiles() {
  if (pmtilesRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  pmtilesRegistered = true;
}

type Props = {
  lat: number;
  lng: number;
  color?: string;
  /** CSS height of the map container */
  height?: number;
  /** Map zoom level (default 14) */
  zoom?: number;
  /** Basemap style ID (default: vector bright) */
  styleId?: string;
  /** Container border-radius override */
  radius?: string | number;
};

export default function PlaceMapPreview({ lat, lng, color = "#3b82f6", height = 180, zoom = 14, styleId, radius = 16 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  // Create / update map
  useEffect(() => {
    if (!containerRef.current) return;
    ensurePmtiles();

    let cancelled = false;

    async function init() {
      const styleUrl = assetsApi.styleUrl(styleId ?? "roam-basemap-vector-bright");
      let style = await fetch(styleUrl).then((r) => r.json()) as StyleSpecification;
      if (isFullyOfflineCapable()) {
        style = rewriteStyleForLocalServer(style) as StyleSpecification;
      }

      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        zoom,
        center: [lng, lat],
        attributionControl: false,
        interactive: false,    // static preview — no pan/zoom
        fadeDuration: 0,
      });
      mapRef.current = map;

      // Add marker after style loads
      map.on("load", () => {
        if (cancelled) return;
        const el = document.createElement("div");
        el.style.cssText = `
          width: 28px; height: 28px; border-radius: 50%;
          background: ${color}; border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
        markerRef.current = marker;
      });
    }

    init();

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [lat, lng, color, zoom, styleId]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height,
        borderRadius: radius,
        overflow: "hidden",
        background: "var(--roam-surface-hover)",
      }}
    />
  );
}
