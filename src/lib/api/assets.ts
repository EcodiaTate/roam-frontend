// src/lib/api/assets.ts

/**
 * Roam Asset API (Hybrid)
 *
 * Invariant:
 * - Styles are shipped inside the app bundle (static export): /public/offline/styles/*
 * - PMTiles are served from Supabase Storage (public bucket): /storage/v1/object/public/...
 *
 * This matches:
 * - Static export + Capacitor (no Next server)
 * - Remote tiles w/ Range requests (PMTiles streaming)
 */

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
  // Optional folder prefix in the bucket, e.g. "tiles" or "pmtiles"
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
  if (!base) {
    // Fallback so dev doesn't hard-crash if env is missing.
    // (But PMTiles obviously won't load without a real URL.)
    return `/${trimSlashes(pathInBucket)}`;
  }
  const b = bucket();
  const p = trimSlashes(pathInBucket);
  // Keep bucket name unencoded; encode path segments via safeId() where needed.
  return `${base}/storage/v1/object/public/${b}/${p}`;
}

export const assetsApi = {
  /**
   * PMTiles URL (Supabase public)
   *
   * Example:
   *   tileUrl("australia")
   *   -> https://xxx.supabase.co/storage/v1/object/public/tiles/tiles/australia.pmtiles
   *   (depending on your TILES_PREFIX)
   */
  tileUrl(tileId: string) {
    const file = `${safeId(tileId)}.pmtiles`;
    const p = joinPath(tilesPrefix(), file);
    return supaPublicObjectUrl(p);
  },

  /**
   * Style JSON URL (bundled, same-origin)
   *
   * Example:
   *   styleUrl("roam-basemap-hybrid")
   *   -> /offline/styles/roam-basemap-hybrid.style.json
   */
  styleUrl(styleId: string) {
    return `/offline/styles/${safeId(styleId)}.style.json`;
  },
};
