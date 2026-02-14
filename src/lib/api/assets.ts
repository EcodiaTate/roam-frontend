// src/lib/api/assets.ts

/**
 * Roam Asset API (Frontend-Served Only)
 *
 * Invariant:
 * - All map tiles (PMTiles) and styles are served from /public/offline/*
 * - No backend routing.
 * - No environment switching.
 * - No Capacitor branching.
 *
 * /public/offline/tiles/*.pmtiles  →  /offline/tiles/*.pmtiles
 * /public/offline/styles/*.json    →  /offline/styles/*.json
 */

function safeId(id: string): string {
  return encodeURIComponent(id);
}

export const assetsApi = {
  /**
   * PMTiles URL
   *
   * Example:
   *   tileUrl("australia-base")
   *   → /offline/tiles/australia-base.pmtiles
   */
  tileUrl(tileId: string) {
    return `/offline/tiles/${safeId(tileId)}.pmtiles`;
  },

  /**
   * Style JSON URL
   *
   * Example:
   *   styleUrl("default")
   *   → /offline/styles/default.json
   */
  styleUrl(styleId: string) {
    return `/offline/styles/${safeId(styleId)}.style.json`;
  },
};
