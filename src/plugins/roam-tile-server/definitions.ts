// src/plugins/roam-tile-server/definitions.ts
//
// Capacitor plugin: RoamTileServer
// Serves PMTiles, glyphs, sprites from device storage via localhost HTTP
// with proper Range/206 support for offline MapLibre rendering.

export interface StartServerOptions {
  /** Absolute path to the root directory containing basemap assets */
  rootPath: string;
  /** Port to bind (default 8765). Falls back to next available if taken. */
  port?: number;
}

export interface StartServerResult {
  /** Full base URL, e.g. "http://127.0.0.1:8765" */
  url: string;
  /** Actual port bound */
  port: number;
}

export interface ServerStatusResult {
  /** Whether the server is currently running */
  running: boolean;
  /** Base URL if running, null otherwise */
  url: string | null;
  /** Port if running */
  port: number;
}

export interface DownloadOptions {
  /** Remote URL to download from (Supabase public URL) */
  url: string;
  /** Region identifier (e.g. "australia") — used as subdirectory name */
  region: string;
  /** Expected SHA-256 hex digest for verification (optional) */
  sha256?: string;
  /** Filename to save as (default: derived from URL) */
  filename?: string;
}

export interface DownloadResult {
  /** Absolute path where the file was saved on device */
  path: string;
  /** Bytes written */
  bytes: number;
  /** Whether SHA-256 matched (null if not provided) */
  verified: boolean | null;
}

export interface DownloadProgressEvent {
  /** Region being downloaded */
  region: string;
  /** Bytes received so far */
  bytesReceived: number;
  /** Total bytes expected (-1 if unknown) */
  bytesTotal: number;
  /** Progress 0–1 (-1 if unknown) */
  progress: number;
}

export interface BasemapInfoOptions {
  /** Region identifier */
  region: string;
}

export interface BasemapInfoResult {
  /** Whether basemap files exist for this region */
  installed: boolean;
  /** Absolute path to region directory */
  path: string;
  /** Total size in bytes of all basemap files */
  sizeBytes: number;
  /** List of files present */
  files: string[];
}

export interface DeleteBasemapOptions {
  region: string;
}

export interface RoamTileServerPlugin {
  /**
   * Start the local HTTP file server.
   * Serves files from `rootPath` with Range/206 support.
   * CORS headers are added for WebView access.
   */
  startServer(options: StartServerOptions): Promise<StartServerResult>;

  /**
   * Stop the local file server.
   */
  stopServer(): Promise<void>;

  /**
   * Get current server status.
   */
  getServerStatus(): Promise<ServerStatusResult>;

  /**
   * Download a file (typically PMTiles) to device storage.
   * Fires 'downloadProgress' events during download.
   * Saves to: {app_data}/roam/basemaps/{region}/{filename}
   */
  downloadFile(options: DownloadOptions): Promise<DownloadResult>;

  /**
   * Cancel an in-progress download for a region.
   */
  cancelDownload(options: { region: string }): Promise<void>;

  /**
   * Check if basemap assets are installed for a region.
   */
  getBasemapInfo(options: BasemapInfoOptions): Promise<BasemapInfoResult>;

  /**
   * Delete all basemap files for a region.
   */
  deleteBasemap(options: DeleteBasemapOptions): Promise<void>;

  /**
   * Get the root basemaps directory path on device.
   * Returns the directory where all regions are stored.
   */
  getBasemapsRoot(): Promise<{ path: string }>;

  /**
   * Listen for download progress events.
   */
  addListener(
    eventName: "downloadProgress",
    listenerFunc: (event: DownloadProgressEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}