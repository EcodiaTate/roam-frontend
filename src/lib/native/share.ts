// src/lib/native/share.ts
"use client";

import { hasPlugin, isNative } from "./platform";

export type ShareOpts = {
  title?: string;
  text?: string;
  url?: string;
};

/**
 * Open the native share sheet (or Web Share API on browsers).
 *
 * Usage:
 *   await nativeShare({
 *     title: "Join my Roam trip!",
 *     text: `Use code ${code} in the Roam app to join.`,
 *   });
 */
export async function nativeShare(opts: ShareOpts): Promise<boolean> {
  // Native Capacitor share
  if (isNative && hasPlugin("Share")) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
        dialogTitle: opts.title,
      });
      return true;
    } catch (e: any) {
      // User cancelled
      if (e?.message?.includes("cancel") || e?.message?.includes("dismiss")) return false;
      console.warn("[Share] native share failed", e);
    }
  }

  // Web Share API fallback
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
      });
      return true;
    } catch {
      return false; // user cancelled
    }
  }

  // Last resort: copy to clipboard
  const text = [opts.title, opts.text, opts.url].filter(Boolean).join("\n");
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }

  return false;
}