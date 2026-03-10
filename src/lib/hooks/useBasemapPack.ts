// src/lib/hooks/useBasemapPack.ts
//
// React hook wrapping basemapManager for UI components.
// Provides reactive state for download progress, install status,
// and tile server readiness.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  type BasemapStatus,
  type TileServerInfo,
  getBasemapStatus,
  getTileServerInfo,
  downloadBasemap,
  cancelBasemapDownload,
  deleteBasemap,
  initBasemap,
  onBasemapStatusChange,
} from "@/lib/offline/basemapManager";

const DEFAULT_REGION = "australia";

export interface UseBasemapPackReturn {
  /** Current install/download status */
  status: BasemapStatus;
  /** Whether the tile server is running and serving tiles locally */
  serverReady: boolean;
  /** Tile server base URL (e.g. "http://127.0.0.1:8765") or null */
  serverUrl: string | null;
  /** Whether we're on a native platform (iOS/Android) */
  isNative: boolean;
  /** Whether the basemap is fully installed and server running */
  isOfflineReady: boolean;
  /** Start downloading the basemap */
  download: () => Promise<void>;
  /** Cancel an in-progress download */
  cancel: () => Promise<void>;
  /** Delete installed basemap */
  remove: () => Promise<void>;
  /** Re-check status from disk */
  refresh: () => Promise<void>;
}

export function useBasemapPack(region: string = DEFAULT_REGION): UseBasemapPackReturn {
  const [status, setStatus] = useState<BasemapStatus>({
    region,
    state: "not_installed",
    version: null,
    sizeBytes: 0,
    installedAt: null,
    error: null,
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
  });

  const [serverInfo, setServerInfo] = useState<TileServerInfo>({
    running: false,
    url: null,
    port: 0,
  });

  const isNative = Capacitor.isNativePlatform();
  const initRef = useRef(false);

  // Subscribe to status changes from basemapManager
  useEffect(() => {
    const unsub = onBasemapStatusChange((s) => {
      if (s.region === region) setStatus(s);
    });
    return unsub;
  }, [region]);

  // Init on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        const s = await initBasemap(region);
        setStatus(s);
        setServerInfo(getTileServerInfo());
      } catch (e) {
        console.error("[useBasemapPack] init failed:", e);
      }
    })();
  }, [region]);

  const refresh = useCallback(async () => {
    const s = await getBasemapStatus(region);
    setStatus(s);
    setServerInfo(getTileServerInfo());
  }, [region]);

  const download = useCallback(async () => {
    try {
      await downloadBasemap(region);
      setServerInfo(getTileServerInfo());
    } catch (e: any) {
      // Status is already updated by basemapManager
      console.error("[useBasemapPack] download failed:", e);
    }
  }, [region]);

  const cancel = useCallback(async () => {
    await cancelBasemapDownload(region);
  }, [region]);

  const remove = useCallback(async () => {
    await deleteBasemap(region);
    setServerInfo(getTileServerInfo());
  }, [region]);

  const isOfflineReady = status.state === "installed" && serverInfo.running;

  return {
    status,
    serverReady: serverInfo.running,
    serverUrl: serverInfo.url,
    isNative,
    isOfflineReady,
    download,
    cancel,
    remove,
    refresh,
  };
}