// src/lib/native/orientation.ts
"use client";

import { isNative, hasPlugin } from "./platform";

/**
 * Lock screen to portrait orientation.
 * Mobile-first, one-handed UI — portrait is the only supported mode.
 *
 * Call once at app boot.
 */
export async function lockPortrait(): Promise<void> {
  if (!isNative || !hasPlugin("ScreenOrientation")) return;

  try {
    const { ScreenOrientation } = await import("@capacitor/screen-orientation");
    await ScreenOrientation.lock({ orientation: "portrait" });
  } catch (e) {
    console.warn("[Orientation] lock failed", e);
  }
}

/**
 * Unlock orientation (e.g. if you ever want landscape for map).
 */
export async function unlockOrientation(): Promise<void> {
  if (!isNative || !hasPlugin("ScreenOrientation")) return;

  try {
    const { ScreenOrientation } = await import("@capacitor/screen-orientation");
    await ScreenOrientation.unlock();
  } catch (e) {
    console.warn("[Orientation] unlock failed", e);
  }
}