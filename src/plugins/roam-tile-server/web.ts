// src/plugins/roam-tile-server/web.ts
//
// Web fallback for RoamTileServer plugin.
// In browser/dev mode there is no native tile server.
// Tiles load directly from Supabase, glyphs from CDN.
// This stub lets the rest of the code call the plugin API without errors.

import { WebPlugin } from "@capacitor/core";
import type {
  RoamTileServerPlugin,
  StartServerOptions,
  StartServerResult,
  ServerStatusResult,
  DownloadOptions,
  DownloadResult,
  BasemapInfoOptions,
  BasemapInfoResult,
  DeleteBasemapOptions,
} from "./definitions";

export class RoamTileServerWeb extends WebPlugin implements RoamTileServerPlugin {
  async startServer(_options: StartServerOptions): Promise<StartServerResult> {
    // No local server on web — MapLibre loads tiles from remote URLs
    console.info("[RoamTileServer/web] startServer no-op (browser mode)");
    return { url: "", port: 0 };
  }

  async stopServer(): Promise<void> {
    // No-op
  }

  async getServerStatus(): Promise<ServerStatusResult> {
    return { running: false, url: null, port: 0 };
  }

  async downloadFile(_options: DownloadOptions): Promise<DownloadResult> {
    throw new Error(
      "RoamTileServer.downloadFile is not available in browser. " +
        "Basemap downloads require a native Capacitor build.",
    );
  }

  async cancelDownload(): Promise<void> {
    // No-op
  }

  async getBasemapInfo(_options: BasemapInfoOptions): Promise<BasemapInfoResult> {
    return { installed: false, path: "", sizeBytes: 0, files: [] };
  }

  async deleteBasemap(_options: DeleteBasemapOptions): Promise<void> {
    // No-op
  }

  async getBasemapsRoot(): Promise<{ path: string }> {
    return { path: "" };
  }
}