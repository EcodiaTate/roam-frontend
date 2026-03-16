// src/lib/share/captureMapSnapshot.ts
//
// Renders a hidden MapLibre map fitted to a route bbox, waits for it to go
// idle, then grabs the canvas as a JPEG data URL.
//
// Why not use the live map canvas?
// - preserveDrawingBuffer=true still fails when tiles are cross-origin (tainted canvas).
// - This approach spins up a tiny dedicated map with full control over its lifecycle.

import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { assetsApi } from "@/lib/api/assets";

export type SnapshotBounds = {
  minLat: number; maxLat: number;
  minLng: number; maxLng: number;
};

const SNAP_W = 390 * 2;
const SNAP_H = 693 * 2;

export async function captureMapSnapshot(
  bounds: SnapshotBounds,
  styleId = "roam-basemap-hybrid",
  timeoutMs = 8000,
): Promise<string | null> {
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${SNAP_W}px;height:${SNAP_H}px;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(container);

  const origin = window.location.origin;
  const protocol = new Protocol();
  const protocolKey = `pmtiles-snap-${Date.now()}`;
  maplibregl.addProtocol(protocolKey, protocol.tile.bind(protocol));

  let map: maplibregl.Map | null = null;

  try {
    const styleRes = await fetch(assetsApi.styleUrl(styleId));
    if (!styleRes.ok) throw new Error(`Style fetch failed: ${styleRes.status}`);
    const styleJson = await styleRes.json();

    // Rewrite pmtiles:// URLs to use the correct origin
    function rewriteStyle(s: Record<string, unknown>): Record<string, unknown> {
      return JSON.parse(
        JSON.stringify(s).replace(/pmtiles:\/\/\//g, `pmtiles://${origin}/`)
      );
    }

    const style = rewriteStyle(styleJson) as import("maplibre-gl").StyleSpecification;

    map = new maplibregl.Map({
      container,
      style,
      center: [
        (bounds.minLng + bounds.maxLng) / 2,
        (bounds.minLat + bounds.maxLat) / 2,
      ],
      zoom: 5,
      interactive: false,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      transformRequest: (url) => {
        if (typeof url === "string" && url.startsWith("pmtiles://")) {
          const inner = url.slice("pmtiles://".length).replace(/^\/+/, "");
          const normalized = /^https?:\/\//i.test(inner)
            ? `pmtiles://${inner}`
            : `pmtiles://${origin}/${inner}`;
          return { url: normalized };
        }
        return { url };
      },
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("map snapshot timeout")), timeoutMs);

      map!.once("load", () => {
        map!.fitBounds(
          [
            [bounds.minLng, bounds.minLat],
            [bounds.maxLng, bounds.maxLat],
          ],
          { padding: 60, animate: false },
        );
      });

      map!.once("idle", () => {
        clearTimeout(timer);
        resolve();
      });

      map!.once("error", (e) => {
        clearTimeout(timer);
        // Don't reject on tile errors — map may still render partially
        console.warn("[snapshot] map error (continuing):", e);
        resolve();
      });
    });

    const canvas = map.getCanvas();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    // A blank/failed canvas returns a very short string
    if (!dataUrl || dataUrl.length < 200) return null;
    return dataUrl;
  } catch (err) {
    console.warn("[snapshot] captureMapSnapshot failed:", err);
    return null;
  } finally {
    map?.remove();
    maplibregl.removeProtocol(protocolKey);
    container.remove();
  }
}
