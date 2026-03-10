// src/plugins/roam-tile-server/index.ts
//
// Registers the RoamTileServer Capacitor plugin.
// On native (iOS/Android): bridges to Swift/Kotlin implementation.
// On web (dev): falls back to web.ts which returns remote URLs.

import { registerPlugin } from "@capacitor/core";
import type { RoamTileServerPlugin } from "./definitions";

const RoamTileServer = registerPlugin<RoamTileServerPlugin>("RoamTileServer", {
  web: () => import("./web").then((m) => new m.RoamTileServerWeb()),
});

export { RoamTileServer };
export type {
  RoamTileServerPlugin,
  StartServerOptions,
  StartServerResult,
  ServerStatusResult,
  DownloadOptions,
  DownloadResult,
  DownloadProgressEvent,
  BasemapInfoOptions,
  BasemapInfoResult,
  DeleteBasemapOptions,
} from "./definitions";