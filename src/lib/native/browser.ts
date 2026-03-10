// src/lib/native/browser.ts
"use client";

import { isNative, hasPlugin } from "./platform";

/**
 * Open a URL in the native in-app browser.
 *
 * Better than opening the system browser for OAuth because:
 *   - User stays in the app context
 *   - Redirect back is seamless
 *   - No app switch animation jank
 *
 * Falls back to window.open on web.
 */
export async function openInAppBrowser(url: string): Promise<void> {
  if (isNative && hasPlugin("Browser")) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({
        url,
        presentationStyle: "popover",
        toolbarColor: "#0a0a0a",
      });
      return;
    } catch (e) {
      console.warn("[Browser] in-app open failed, falling back", e);
    }
  }

  // Web fallback
  window.open(url, "_blank");
}

/**
 * Close the in-app browser (if open).
 */
export async function closeInAppBrowser(): Promise<void> {
  if (!isNative || !hasPlugin("Browser")) return;
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {}
}

/**
 * Listen for browser close events (e.g. user dismissed OAuth flow).
 * Returns unsubscribe function.
 */
export async function onBrowserClosed(fn: () => void): Promise<() => void> {
  if (!isNative || !hasPlugin("Browser")) {
    return () => {};
  }

  try {
    const { Browser } = await import("@capacitor/browser");
    const handle = await Browser.addListener("browserFinished", fn);
    return () => handle.remove();
  } catch {
    return () => {};
  }
}