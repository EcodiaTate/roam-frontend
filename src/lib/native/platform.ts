// src/lib/native/platform.ts

import { Capacitor } from "@capacitor/core";

/** True when running inside the Capacitor native shell (iOS/Android) */
export const isNative = Capacitor.isNativePlatform();

/** "ios" | "android" | "web" */
export const platform = Capacitor.getPlatform() as "ios" | "android" | "web";

/** True when running in a real browser (not Capacitor WebView) */
export const isWeb = platform === "web";

/** True on iOS native */
export const isIOS = platform === "ios";

/** True on Android native */
export const isAndroid = platform === "android";

/**
 * Safe plugin check — returns false if plugin isn't available on this platform
 * instead of throwing. Use before calling optional plugin APIs.
 */
export function hasPlugin(name: string): boolean {
  return Capacitor.isPluginAvailable(name);
}