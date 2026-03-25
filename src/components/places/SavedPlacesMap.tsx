// src/components/places/SavedPlacesMap.tsx
//
// Lightweight MapLibre map that renders saved-place pins.
// Clicking a pin flies to it and calls onSelectPlace.

import { useEffect, useRef, useCallback } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { Protocol } from "pmtiles";
import { assetsApi } from "@/lib/api/assets";
import { rewriteStyleForLocalServer, isFullyOfflineCapable } from "@/lib/offline/basemapManager";
import type { SavedPlace } from "@/lib/offline/savedPlacesStore";

const SAVED_SOURCE = "roam_saved_pins";
const SAVED_LAYER = "roam_saved_pins_layer";

let pmtilesRegistered = false;

function ensurePmtiles() {
  if (pmtilesRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  pmtilesRegistered = true;
}

type Props = {
  places: SavedPlace[];
  onSelectPlace?: (place: SavedPlace) => void;
};

export function SavedPlacesMap({ places, onSelectPlace }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const onSelectRef = useRef(onSelectPlace);
  onSelectRef.current = onSelectPlace;

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensurePmtiles();

    async function init() {
      const styleUrl = assetsApi.styleUrl("roam-basemap-vector-bright");
      let style = await fetch(styleUrl).then((r) => r.json()) as StyleSpecification;
      if (isFullyOfflineCapable()) {
        style = rewriteStyleForLocalServer(style) as StyleSpecification;
      }

      if (!containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        zoom: 4,
        center: [134, -26], // Australia centre
        attributionControl: false,
      });
      mapRef.current = map;

      map.on("load", () => {
        map.addSource(SAVED_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: SAVED_LAYER,
          type: "circle",
          source: SAVED_SOURCE,
          paint: {
            "circle-radius": 9,
            "circle-color": "#f59e0b",
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#fff",
          },
        });

        map.on("click", SAVED_LAYER, (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const placeId = feature.properties?.place_id as string;
          // Find in parent's places array (passed via ref-like mechanism through state)
          // We re-read via the closure over the ref
          try {
            onSelectRef.current?.(
              JSON.parse(feature.properties?.raw as string) as SavedPlace,
            );
          } catch {
            // raw property missing or malformed — ignore click
          }
        });

        map.on("mouseenter", SAVED_LAYER, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", SAVED_LAYER, () => {
          map.getCanvas().style.cursor = "";
        });

        // Populate with any places already available at mount time
        syncPins(map, placesRef.current);
      });
    }

    init().catch(console.error);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared helper to push places into the map source + fit bounds
  const syncPins = useCallback((map: MLMap, data: SavedPlace[]) => {
    const src = map.getSource(SAVED_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const features: GeoJSON.Feature[] = data.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { place_id: p.place_id, name: p.name, raw: JSON.stringify(p) },
    }));

    src.setData({ type: "FeatureCollection", features });

    if (data.length > 0) {
      if (data.length === 1) {
        map.flyTo({ center: [data[0].lng, data[0].lat], zoom: 12 });
      } else {
        const lngs = data.map((p) => p.lng);
        const lats = data.map((p) => p.lat);
        map.fitBounds(
          [
            [Math.min(...lngs) - 0.5, Math.min(...lats) - 0.5],
            [Math.max(...lngs) + 0.5, Math.max(...lats) + 0.5],
          ],
          { padding: 48, maxZoom: 14 },
        );
      }
    }
  }, []);

  // Keep a ref to the latest places so the load callback can read them
  const placesRef = useRef(places);
  placesRef.current = places;

  // Update pins when places change after initial load
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncPins(map, places);
  }, [places, syncPins]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 0 }}
    />
  );
}
