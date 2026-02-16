// src/components/native/BasemapBootstrap.tsx
//
// Runs once at app startup. Checks if the offline basemap is installed
// and starts the local tile server if so. Silent — no UI.
// Must be inside a client boundary.

"use client";

import { useEffect, useRef } from "react";
import { initBasemap } from "@/lib/offline/basemapManager";

export function BasemapBootstrap() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    initBasemap("australia")
      .then((status) => {
        if (status.state === "installed") {
          console.log("[BasemapBootstrap] ✅ Tile server started, basemap ready");
        } else {
          console.log("[BasemapBootstrap] Basemap not installed:", status.state);
        }
      })
      .catch((e) => {
        console.warn("[BasemapBootstrap] init failed (non-fatal):", e);
      });
  }, []);

  return null;
}