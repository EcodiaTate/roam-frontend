// src/lib/api/assets.ts
//
// Roam Asset API (Hybrid — local tile server preferred, Supabase fallback)
//
// Invariants:
// - Styles are shipped inside the app bundle (static export): /public/offline/styles/*
// - PMTiles served from LOCAL tile server if basemap is installed (offline-first)
// - PMTiles fall back to Supabase Storage (public bucket) when tile server is not running
// - Glyphs: local tile server when running, CDN fallback
//
// The local tile server (RoamTileServer native plugin) serves files from device
// storage with proper Range/206 support for PMTiles streaming.

import {
  getTileServerUrl,
  isFullyOfflineCapable,
  getPmtilesUrl,
  getGlyphsUrl,
  getSpriteUrl,
} from "@/lib/offline/basemapManager";

/* ── Internals ────────────────────────────────────────────────────────── */

function safeId(id: string): string {
  return encodeURIComponent(id);
}

function trimSlashes(x: string) {
  return (x ?? "").replace(/^\/+|\/+$/g, "");
}

function supaBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return url.replace(/\/+$/g, "");
}

function bucket(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_TILES_BUCKET || "tiles";
}

function tilesPrefix(): string {
  return trimSlashes(process.env.NEXT_PUBLIC_SUPABASE_TILES_PREFIX || "tiles");
}

function joinPath(...parts: string[]) {
  return parts
    .filter(Boolean)
    .map((p) => trimSlashes(p))
    .filter(Boolean)
    .join("/");
}

function supaPublicObjectUrl(pathInBucket: string): string {
  const base = supaBaseUrl();
  if (!base) return `/${trimSlashes(pathInBucket)}`;
  const b = bucket();
  const p = trimSlashes(pathInBucket);
  return `${base}/storage/v1/object/public/${b}/${p}`;
}

/* ── Public API ──────────────────────────────────────────────────────── */

export const assetsApi = {
  /**
   * PMTiles URL — prefers local tile server, falls back to Supabase.
   *
   * When tile server is running:
   *   → pmtiles://http://127.0.0.1:8765/tiles/australia.pmtiles
   *
   * When tile server is NOT running (online mode):
   *   → pmtiles://https://xxx.supabase.co/storage/v1/object/public/tiles/tiles/australia.pmtiles
   */
  tileUrl(tileId: string = "australia"): string {
    const serverUrl = getTileServerUrl();
    if (serverUrl) {
      return `pmtiles://${serverUrl}/tiles/${safeId(tileId)}.pmtiles`;
    }
    // Fallback: Supabase remote
    const file = `${safeId(tileId)}.pmtiles`;
    const p = joinPath(tilesPrefix(), file);
    return `pmtiles://${supaPublicObjectUrl(p)}`;
  },

  /**
   * Raw tile URL without pmtiles:// prefix.
   * Used when constructing source objects directly.
   */
  tileUrlRaw(tileId: string = "australia"): string {
    const serverUrl = getTileServerUrl();
    if (serverUrl) {
      return `${serverUrl}/tiles/${safeId(tileId)}.pmtiles`;
    }
    const file = `${safeId(tileId)}.pmtiles`;
    const p = joinPath(tilesPrefix(), file);
    return supaPublicObjectUrl(p);
  },

  /**
   * Style JSON URL (always bundled, same-origin).
   *
   * Example:
   *   styleUrl("roam-basemap-vector-bright")
   *   → /offline/styles/roam-basemap-vector-bright.style.json
   */
  styleUrl(styleId: string): string {
    return `/offline/styles/${safeId(styleId)}.style.json`;
  },

  /**
   * Glyphs URL template — local tile server when available, CDN fallback.
   *
   * When local:  http://127.0.0.1:8765/glyphs/{fontstack}/{range}.pbf
   * When remote: https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf
   */
  glyphsUrl(): string {
    return getGlyphsUrl();
  },

  /**
   * Sprite URL — local tile server when available, undefined if none.
   * Returns the URL without file extension (MapLibre adds .json / .png).
   */
  spriteUrl(): string | undefined {
    return getSpriteUrl();
  },

  /**
   * Whether the local tile server is running and basemap is installed.
   * Use this to decide whether to show "offline ready" UI.
   */
  isLocalTileServerActive(): boolean {
    return isFullyOfflineCapable();
  },

  /**
   * Get the local tile server base URL, or null.
   */
  localServerUrl(): string | null {
    return getTileServerUrl();
  },
};