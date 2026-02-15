// src/lib/native/appLifecycle.ts
"use client";

import { isNative, hasPlugin } from "./platform";

type LifecycleListener = (state: "foreground" | "background") => void;

const _listeners = new Set<LifecycleListener>();

/**
 * Subscribe to app foreground/background transitions.
 *
 * On native: uses Capacitor App plugin.
 * On web: uses visibilitychange event.
 *
 * Returns unsubscribe function.
 *
 * Usage:
 *   const unsub = onAppStateChange((state) => {
 *     if (state === "foreground") planSync.drainQueue();
 *   });
 */
export function onAppStateChange(fn: LifecycleListener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _emit(state: "foreground" | "background") {
  for (const fn of _listeners) {
    try {
      fn(state);
    } catch (e) {
      console.error("[AppLifecycle] listener error", e);
    }
  }
}

let _initialized = false;

/**
 * Initialize lifecycle listeners. Call once at boot.
 */
export async function initAppLifecycle(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  if (isNative && hasPlugin("App")) {
    try {
      const { App } = await import("@capacitor/app");

      // Foreground (app resumed)
      await App.addListener("appStateChange", ({ isActive }) => {
        _emit(isActive ? "foreground" : "background");
      });

      // Back button (Android) — prevent accidental exit
      await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        }
        // Don't exit app — user must use the system gesture
      });
    } catch (e) {
      console.warn("[AppLifecycle] native init failed", e);
      _setupWebFallback();
    }
  } else {
    _setupWebFallback();
  }
}

function _setupWebFallback() {
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", () => {
    _emit(document.hidden ? "background" : "foreground");
  });
}