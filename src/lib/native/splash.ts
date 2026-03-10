// src/lib/native/splash.ts
"use client";

import { isNative, hasPlugin } from "./platform";

/**
 * Hide the native splash screen.
 *
 * Call this after your app has hydrated IDB and is ready to render.
 * On web this is a no-op.
 *
 * We use a short fade for a polished feel.
 */
export async function hideSplash(): Promise<void> {
  if (!isNative || !hasPlugin("SplashScreen")) return;

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch (e) {
    console.warn("[SplashScreen] hide failed", e);
  }
}

/**
 * Show the splash screen (e.g. during heavy background work).
 * Rarely needed but available.
 */
export async function showSplash(): Promise<void> {
  if (!isNative || !hasPlugin("SplashScreen")) return;

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.show({ fadeInDuration: 200, autoHide: false });
  } catch {}
}