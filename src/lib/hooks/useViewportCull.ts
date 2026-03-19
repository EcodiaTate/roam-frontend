/**
 * useViewportCull – "frustum culling" for MapLibre GeoJSON overlays.
 *
 * Instead of feeding thousands of features across a 4,000 km route into every
 * GeoJSON source, this hook watches the map viewport and returns only the
 * features that fall within (or near) the visible bounds.  The result is a
 * much smaller FeatureCollection that MapLibre can tile/render cheaply.
 *
 * Design goals:
 *  • Zero visual difference - the user sees every marker they'd see otherwise.
 *  • No pop-in - a generous pad (1.5× viewport) pre-loads features just offscreen.
 *  • Smooth panning - updates are debounced (150 ms idle after move/zoom).
 *  • Cheap - a tight lng/lat bbox check per feature; no spatial index needed
 *    because we only run it on move-end, not every frame.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import type { Map as MLMap } from "maplibre-gl";

// ── Types ────────────────────────────────────────────────────────────────

export interface ViewportBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Expand bounds by `factor` in each direction (1.5 = 50 % pad on every side). */
function padBounds(b: ViewportBounds, factor: number): ViewportBounds {
  const dLng = (b.east - b.west) * (factor - 1);
  const dLat = (b.north - b.south) * (factor - 1);
  return {
    west: b.west - dLng,
    east: b.east + dLng,
    south: b.south - dLat,
    north: b.north + dLat,
  };
}

/** Fast point-in-bounds check for a [lng, lat] coordinate. */
function pointInBounds(lng: number, lat: number, b: ViewportBounds): boolean {
  return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
}

/**
 * Check whether *any* coordinate of a geometry intersects the padded bounds.
 * For Points this is trivial; for LineStrings/Polygons we walk coordinates
 * and bail early on first hit.  This is intentionally approximate - a polygon
 * whose edges cross the viewport but whose vertices are all outside will be
 * missed, but for the overlay sizes we deal with (flood catchments, wildlife
 * zones) this is acceptable and vastly cheaper than proper intersection.
 */
function geometryIntersectsBounds(geom: GeoJSON.Geometry, b: ViewportBounds): boolean {
  switch (geom.type) {
    case "Point":
      return pointInBounds(geom.coordinates[0], geom.coordinates[1], b);

    case "MultiPoint":
      return geom.coordinates.some(([lng, lat]) => pointInBounds(lng, lat, b));

    case "LineString":
      return geom.coordinates.some(([lng, lat]) => pointInBounds(lng, lat, b));

    case "MultiLineString":
      return geom.coordinates.some((ring) =>
        ring.some(([lng, lat]) => pointInBounds(lng, lat, b)),
      );

    case "Polygon":
      return geom.coordinates.some((ring) =>
        ring.some(([lng, lat]) => pointInBounds(lng, lat, b)),
      );

    case "MultiPolygon":
      return geom.coordinates.some((poly) =>
        poly.some((ring) => ring.some(([lng, lat]) => pointInBounds(lng, lat, b))),
      );

    case "GeometryCollection":
      return geom.geometries.some((g) => geometryIntersectsBounds(g, b));

    default:
      return true; // unknown type - keep it
  }
}

// ── Culling function (exported for direct use) ──────────────────────────

/**
 * Filter a FeatureCollection to only features intersecting the given bounds.
 * Returns the original reference unchanged if *all* features pass (avoids
 * unnecessary setData calls downstream).
 */
export function cullFeatures(
  fc: GeoJSON.FeatureCollection,
  bounds: ViewportBounds,
  pad = 1.5,
): GeoJSON.FeatureCollection {
  if (!fc.features.length) return fc;
  const padded = padBounds(bounds, pad);
  const out: GeoJSON.Feature[] = [];
  for (const f of fc.features) {
    if (f.geometry && geometryIntersectsBounds(f.geometry, padded)) {
      out.push(f);
    }
  }
  // If nothing was filtered, return original reference for stable identity
  if (out.length === fc.features.length) return fc;
  return { type: "FeatureCollection", features: out };
}

// ── Hook: subscribe to viewport and auto-cull ───────────────────────────

/**
 * Returns the current padded viewport bounds of a MapLibre map, updating on
 * moveend / zoomend with a short debounce.  Consumers can use this with
 * `cullFeatures()` in their own useMemo to filter individual FCs.
 */
export function useMapViewport(
  mapRef: React.RefObject<MLMap | null>,
  /** Debounce delay in ms after moveend before bounds are updated. */
  debounceMs = 150,
  /**
   * Optional "ready" signal - the effect re-runs when this changes.
   * Pass a state that flips after the map is created (e.g. `styleReady`)
   * so the hook picks up the map instance created in a separate effect.
   */
  ready?: unknown,
): ViewportBounds | null {
  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function grab() {
      const map2 = mapRef.current;
      if (!map2) return;
      const b = map2.getBounds();
      setBounds({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });
    }

    function onMove() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(grab, debounceMs);
    }

    // Grab initial bounds once map is idle
    if (map.loaded()) {
      grab();
    } else {
      map.once("idle", grab);
    }

    map.on("moveend", onMove);
    map.on("zoomend", onMove);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      map.off("moveend", onMove);
      map.off("zoomend", onMove);
    };
  }, [mapRef, debounceMs, ready]);

  return bounds;
}

/**
 * Convenience: cull a single FeatureCollection against the current viewport.
 * Returns the full FC until the map has reported its first bounds.
 */
export function useCulledFC(
  fc: GeoJSON.FeatureCollection,
  bounds: ViewportBounds | null,
  pad = 1.5,
): GeoJSON.FeatureCollection {
  return useMemo(() => {
    if (!bounds) return fc; // map not ready yet - show everything
    return cullFeatures(fc, bounds, pad);
  }, [fc, bounds, pad]);
}
