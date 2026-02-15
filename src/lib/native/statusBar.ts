// src/lib/native/statusBar.ts
"use client";

import { isNative, hasPlugin, isIOS, isAndroid } from "./platform";

/**
 * Configure the status bar for an immersive, dark navigation UI.
 *
 * Call once at app boot. On web this is a no-op.
 */
export async function configureStatusBar() {
  if (!isNative || !hasPlugin("StatusBar")) return;

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");

    // Dark content on dark background
    await StatusBar.setStyle({ style: Style.Dark });

    if (isAndroid) {
      // Transparent status bar — content draws behind it
      await StatusBar.setBackgroundColor({ color: "#00000000" });
      await StatusBar.setOverlaysWebView({ overlay: true });
    }

    // iOS: status bar style is controlled by Style.Dark above
    // The WebView already extends under the status bar via viewport-fit=cover
  } catch (e) {
    console.warn("[StatusBar] config failed", e);
  }
}

/**
 * Hide status bar (e.g. during full-screen map navigation).
 */
export async function hideStatusBar() {
  if (!isNative || !hasPlugin("StatusBar")) return;
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.hide({ animation: "SLIDE" as any });
  } catch {}
}

/**
 * Show status bar again.
 */
export async function showStatusBar() {
  if (!isNative || !hasPlugin("StatusBar")) return;
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.show({ animation: "SLIDE" as any });
  } catch {}
}