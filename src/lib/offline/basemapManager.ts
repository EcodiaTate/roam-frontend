// src/lib/offline/basemapManager.ts
//
// Manages offline basemap packs (PMTiles + glyphs + sprites + style).
// Coordinates with the RoamTileServer native plugin for:
//   - Downloading large PMTiles files to device storage
//   - Starting/stopping the local HTTP tile server
//   - Tracking install status in IDB meta store
//
// This is the "source of truth" for basemap readiness.
// UI components use the useBasemapPack hook which wraps this.

"use client";

import { Capacitor } from "@capacitor/core";
import { RoamTileServer } from "@/plugins/roam-tile-server";
import { idbGet, idbPut, idbStores } from "./idb";

/* ── Constants ────────────────────────────────────────────────────────── */

const DEFAULT_REGION = "australia";
const DEFAULT_PORT = 8765;
const TILE_FILENAME = "australia.pmtiles";

/** IDB meta keys */
const META_BASEMAP_STATUS = "basemap_status"; // BasemapStatus object
const META_TILE_SERVER_URL = "tile_server_url"; // string | null

/* ── Types ────────────────────────────────────────────────────────────── */

export type BasemapInstallState =
  | "not_installed"
  | "downloading"
  | "installed"
  | "error"
  | "deleting";

export interface BasemapStatus {
  region: string;
  state: BasemapInstallState;
  /** Version tag from manifest (e.g. "2026-02-17") */
  version: string | null;
  /** Total size on disk in bytes */
  sizeBytes: number;
  /** ISO timestamp of last install/update */
  installedAt: string | null;
  /** Error message if state === "error" */
  error: string | null;
  /** Download progress 0–1 while downloading */
  downloadProgress: number;
  /** Bytes downloaded so far */
  downloadedBytes: number;
  /** Total bytes to download */
  totalBytes: number;
}

export interface TileServerInfo {
  running: boolean;
  url: string | null;
  port: number;
}

/* ── Singleton state ─────────────────────────────────────────────────── */

let _serverInfo: TileServerInfo = { running: false, url: null, port: 0 };
let _downloadListenerRemove: (() => Promise<void>) | null = null;
let _progressCallbacks: Set<(status: BasemapStatus) => void> = new Set();

/* ── Status persistence ──────────────────────────────────────────────── */

function defaultStatus(region: string = DEFAULT_REGION): BasemapStatus {
  return {
    region,
    state: "not_installed",
    version: null,
    sizeBytes: 0,
    installedAt: null,
    error: null,
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
  };
}

async function loadStatus(region: string = DEFAULT_REGION): Promise<BasemapStatus> {
  try {
    const raw = await idbGet<BasemapStatus>(idbStores.meta, META_BASEMAP_STATUS);
    if (raw && raw.region === region) return raw;
  } catch {}
  return defaultStatus(region);
}

async function saveStatus(status: BasemapStatus): Promise<void> {
  await idbPut(idbStores.meta, status, META_BASEMAP_STATUS);
  // Notify listeners
  for (const cb of _progressCallbacks) {
    try { cb(status); } catch {}
  }
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Subscribe to basemap status changes (download progress, state changes).
 * Returns an unsubscribe function.
 */
export function onBasemapStatusChange(cb: (status: BasemapStatus) => void): () => void {
  _progressCallbacks.add(cb);
  return () => { _progressCallbacks.delete(cb); };
}

/**
 * Get current basemap status from IDB.
 */
export async function getBasemapStatus(region: string = DEFAULT_REGION): Promise<BasemapStatus> {
  const status = await loadStatus(region);

  // If status says installed, verify files still exist on native
  if (status.state === "installed" && Capacitor.isNativePlatform()) {
    try {
      const info = await RoamTileServer.getBasemapInfo({ region });
      if (!info.installed) {
        // Files were deleted externally — reset status
        const reset = defaultStatus(region);
        await saveStatus(reset);
        return reset;
      }
      // Update size in case it changed
      status.sizeBytes = info.sizeBytes;
    } catch {
      // Plugin call failed — trust IDB status
    }
  }

  return status;
}

/**
 * Get the tile server info (running state + URL).
 */
export function getTileServerInfo(): TileServerInfo {
  return { ..._serverInfo };
}

/**
 * Get the base URL for tile server, or null if not running.
 * This is what MapLibre sources should use.
 */
export function getTileServerUrl(): string | null {
  return _serverInfo.url ?? null;
}

/**
 * Build the full PMTiles URL for MapLibre.
 * Returns local server URL if running, Supabase URL otherwise.
 */
export function getPmtilesUrl(tileId: string = "australia"): string {
  if (_serverInfo.running && _serverInfo.url) {
    return `pmtiles://${_serverInfo.url}/tiles/${tileId}.pmtiles`;
  }
  // Fallback to Supabase (online mode)
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/g, "") ?? "";
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_TILES_BUCKET || "tiles";
  const prefix = (process.env.NEXT_PUBLIC_SUPABASE_TILES_PREFIX || "tiles").replace(/^\/+|\/+$/g, "");
  return `pmtiles://${base}/storage/v1/object/public/${bucket}/${prefix}/${tileId}.pmtiles`;
}

/**
 * Build the glyphs URL template for MapLibre style.
 * Returns local server if running, CDN otherwise.
 */
export function getGlyphsUrl(): string {
  if (_serverInfo.running && _serverInfo.url) {
    return `${_serverInfo.url}/glyphs/{fontstack}/{range}.pbf`;
  }
  return "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";
}

/**
 * Build the sprite URL for MapLibre style (without extension).
 * Returns local server if running, empty string if no sprites.
 */
export function getSpriteUrl(): string | undefined {
  if (_serverInfo.running && _serverInfo.url) {
    return `${_serverInfo.url}/sprites/sprite`;
  }
  return undefined;
}

/**
 * Whether we're running fully local (tile server up + basemap installed).
 */
export function isFullyOfflineCapable(): boolean {
  return _serverInfo.running;
}

/* ── Download + Install ──────────────────────────────────────────────── */

/**
 * Get the download URL for a basemap region.
 * Points to the PMTiles file in Supabase public storage.
 */
function getDownloadUrl(region: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/g, "") ?? "";
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_TILES_BUCKET || "tiles";
  const prefix = (process.env.NEXT_PUBLIC_SUPABASE_TILES_PREFIX || "tiles").replace(/^\/+|\/+$/g, "");
  const parts = [prefix, `${region}.pmtiles`].filter(Boolean).join("/");
  return `${base}/storage/v1/object/public/${bucket}/${parts}`;
}

/**
 * Download and install the basemap for a region.
 * This downloads the PMTiles file from Supabase to device storage,
 * then starts the local tile server.
 *
 * File structure after install:
 *   {basemapsRoot}/{region}/tiles/{region}.pmtiles
 *
 * The tile server root is {basemapsRoot}/{region}/, so MapLibre accesses:
 *   http://127.0.0.1:8765/tiles/australia.pmtiles
 *
 * Call this from UI when user taps "Download Offline Map".
 */
export async function downloadBasemap(
  region: string = DEFAULT_REGION,
  options?: { sha256?: string },
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Basemap download requires a native Capacitor build");
  }

  // Update status → downloading
  const status = await loadStatus(region);
  status.state = "downloading";
  status.error = null;
  status.downloadProgress = 0;
  status.downloadedBytes = 0;
  status.totalBytes = 0;
  await saveStatus(status);

  // Set up progress listener
  if (_downloadListenerRemove) {
    await _downloadListenerRemove();
    _downloadListenerRemove = null;
  }

  const listener = await RoamTileServer.addListener("downloadProgress", async (event) => {
    if (event.region !== region) return;
    const s = await loadStatus(region);
    s.downloadProgress = event.progress >= 0 ? event.progress : -1;
    s.downloadedBytes = event.bytesReceived;
    s.totalBytes = event.bytesTotal;
    await saveStatus(s);
  });
  _downloadListenerRemove = listener.remove;

  try {
    const downloadUrl = getDownloadUrl(region);

    // Download to {region}/tiles/ subdirectory so URL paths resolve correctly.
    // The native plugin creates the subdirectory automatically.
    // We use a modified region path: "australia/tiles" as the region param
    // so the file lands at basemapsRoot/australia/tiles/australia.pmtiles
    const result = await RoamTileServer.downloadFile({
      url: downloadUrl,
      region: `${region}/tiles`,
      filename: TILE_FILENAME,
      sha256: options?.sha256,
    });

    // Download complete — update status
    const final = await loadStatus(region);
    final.state = "installed";
    final.sizeBytes = result.bytes;
    final.installedAt = new Date().toISOString();
    final.version = new Date().toISOString().slice(0, 10);
    final.downloadProgress = 1;
    final.downloadedBytes = result.bytes;
    final.totalBytes = result.bytes;
    final.error = null;
    await saveStatus(final);

    // Start tile server if not already running
    await ensureTileServerRunning(region);
  } catch (e: any) {
    const errStatus = await loadStatus(region);
    errStatus.state = "error";
    errStatus.error = e?.message ?? "Download failed";
    await saveStatus(errStatus);
    throw e;
  } finally {
    if (_downloadListenerRemove) {
      await _downloadListenerRemove();
      _downloadListenerRemove = null;
    }
  }
}

/**
 * Cancel an in-progress basemap download.
 */
export async function cancelBasemapDownload(region: string = DEFAULT_REGION): Promise<void> {
  try {
    await RoamTileServer.cancelDownload({ region });
  } catch {}
  const status = await loadStatus(region);
  if (status.state === "downloading") {
    status.state = "not_installed";
    status.error = null;
    status.downloadProgress = 0;
    status.downloadedBytes = 0;
    status.totalBytes = 0;
    await saveStatus(status);
  }
}

/**
 * Delete the basemap for a region and stop the tile server.
 */
export async function deleteBasemap(region: string = DEFAULT_REGION): Promise<void> {
  const status = await loadStatus(region);
  status.state = "deleting";
  await saveStatus(status);

  try {
    await stopTileServer();
    await RoamTileServer.deleteBasemap({ region });
    await saveStatus(defaultStatus(region));
  } catch (e: any) {
    status.state = "error";
    status.error = e?.message ?? "Delete failed";
    await saveStatus(status);
    throw e;
  }
}

/* ── Tile server lifecycle ────────────────────────────────────────────── */

/**
 * Start the local tile server for a region.
 * Call this on app boot if basemap is installed.
 */
export async function ensureTileServerRunning(
  region: string = DEFAULT_REGION,
): Promise<TileServerInfo> {
  if (!Capacitor.isNativePlatform()) {
    return { running: false, url: null, port: 0 };
  }

  // Check if already running
  try {
    const status = await RoamTileServer.getServerStatus();
    if (status.running && status.url) {
      _serverInfo = { running: true, url: status.url, port: status.port };
      await idbPut(idbStores.meta, _serverInfo.url, META_TILE_SERVER_URL);
      return _serverInfo;
    }
  } catch {}

  // Get the basemaps root directory
  try {
    const { path: rootPath } = await RoamTileServer.getBasemapsRoot();
    const regionPath = `${rootPath}/${region}`;

    const result = await RoamTileServer.startServer({
      rootPath: regionPath,
      port: DEFAULT_PORT,
    });

    _serverInfo = { running: true, url: result.url, port: result.port };
    await idbPut(idbStores.meta, _serverInfo.url, META_TILE_SERVER_URL);
    return _serverInfo;
  } catch (e: any) {
    console.error("[basemapManager] Failed to start tile server:", e);
    _serverInfo = { running: false, url: null, port: 0 };
    return _serverInfo;
  }
}

/**
 * Stop the local tile server.
 */
export async function stopTileServer(): Promise<void> {
  try {
    await RoamTileServer.stopServer();
  } catch {}
  _serverInfo = { running: false, url: null, port: 0 };
  await idbPut(idbStores.meta, null, META_TILE_SERVER_URL);
}

/* ── Boot sequence ────────────────────────────────────────────────────── */

/**
 * Called once at app startup.
 * Checks if basemap is installed and starts the tile server if so.
 * Returns the basemap status.
 */
export async function initBasemap(region: string = DEFAULT_REGION): Promise<BasemapStatus> {
  const status = await getBasemapStatus(region);

  if (status.state === "installed" && Capacitor.isNativePlatform()) {
    await ensureTileServerRunning(region);
  }

  return status;
}

/* ── Style rewriting ──────────────────────────────────────────────────── */

/**
 * Rewrite a MapLibre style JSON to use local tile server URLs
 * when the server is running. Falls back to original URLs if not.
 *
 * This is the key integration point — call this before passing
 * style JSON to map.setStyle().
 */
export function rewriteStyleForLocalServer(style: any): any {
  if (!style || typeof style !== "object") return style;

  const out = { ...style };

  // Rewrite glyphs
  out.glyphs = getGlyphsUrl();

  // Rewrite sprite
  const sprite = getSpriteUrl();
  if (sprite) {
    out.sprite = sprite;
  }

  // Rewrite sources
  if (out.sources && typeof out.sources === "object") {
    out.sources = { ...out.sources };
    for (const [key, src] of Object.entries<any>(out.sources)) {
      if (!src || typeof src !== "object") continue;

      // Rewrite pmtiles:// source URLs
      if (typeof src.url === "string" && src.url.startsWith("pmtiles://")) {
        if (_serverInfo.running && _serverInfo.url) {
          // Extract the tile filename from the original URL
          const filename = src.url.split("/").pop() ?? "australia.pmtiles";
          out.sources[key] = {
            ...src,
            url: `pmtiles://${_serverInfo.url}/tiles/${filename}`,
          };
        }
      }

      // Rewrite tile array URLs
      if (Array.isArray(src.tiles)) {
        out.sources[key] = {
          ...src,
          tiles: src.tiles.map((t: string) => {
            if (typeof t === "string" && t.startsWith("pmtiles://") && _serverInfo.running && _serverInfo.url) {
              const filename = t.split("/").pop() ?? "australia.pmtiles";
              return `pmtiles://${_serverInfo.url}/tiles/${filename}`;
            }
            return t;
          }),
        };
      }
    }
  }

  return out;
}