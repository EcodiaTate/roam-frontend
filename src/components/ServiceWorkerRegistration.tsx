"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for offline asset caching on the web/PWA path.
 * No-ops on native Capacitor (which uses a local static bundle instead).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("[SW] Registration failed:", err));
  }, []);

  return null;
}
