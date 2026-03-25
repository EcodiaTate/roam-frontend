// src/components/native/BasemapBootstrap.tsx
//
// Runs once at app startup. Checks if the offline basemap is installed
// and starts the local tile server if so. Silent - no UI.
// Must be inside a client boundary.


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
          // basemap ready - tile server started
        }
      })
      .catch((e) => {
        console.warn("[BasemapBootstrap] init failed (non-fatal):", e);
      });
  }, []);

  return null;
}