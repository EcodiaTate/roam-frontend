// src/lib/native/haptics.ts
"use client";

import { isNative, hasPlugin } from "./platform";

/**
 * Named haptic presets for consistent feedback across the app.
 *
 * Back-compat:
 * - Older code used `haptics.light()/medium()/heavy()/success()/error()/selection()`.
 * - Newer code uses `haptic.tap()/medium()/heavy()/success()/warning()/error()/selection()`.
 *
 * This file exports BOTH:
 *   - `haptic` (preferred)
 *   - `haptics` (legacy alias + legacy method names)
 *
 * Web fallback:
 * - If not native (or plugin missing), we fall back to `navigator.vibrate` where available.
 */
type VibratePattern = number | number[];

function vibrate(pattern: VibratePattern) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }
}

async function impact(style: "Light" | "Medium" | "Heavy", fallback: VibratePattern) {
  if (!isNative || !hasPlugin("Haptics")) {
    vibrate(fallback);
    return;
  }
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    const map = {
      Light: ImpactStyle.Light,
      Medium: ImpactStyle.Medium,
      Heavy: ImpactStyle.Heavy,
    } as const;
    await Haptics.impact({ style: map[style] });
  } catch {
    vibrate(fallback);
  }
}

async function notify(type: "Success" | "Warning" | "Error", fallback: VibratePattern) {
  if (!isNative || !hasPlugin("Haptics")) {
    vibrate(fallback);
    return;
  }
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    const map = {
      Success: NotificationType.Success,
      Warning: NotificationType.Warning,
      Error: NotificationType.Error,
    } as const;
    await Haptics.notification({ type: map[type] });
  } catch {
    vibrate(fallback);
  }
}

async function selectionTick(fallback: VibratePattern) {
  if (!isNative || !hasPlugin("Haptics")) {
    vibrate(fallback);
    return;
  }
  try {
    const { Haptics } = await import("@capacitor/haptics");
    // Prefer the simplest reliable call; selectionStart/End are optional niceties.
    await Haptics.selectionChanged();
  } catch {
    vibrate(fallback);
  }
}

/**
 * Preferred modern API
 */
export const haptic = {
  /** Light tap — tab press, list item selection, button confirm */
  async tap() {
    await impact("Light", 10);
  },

  /** Medium impact — map marker placed, stop added */
  async medium() {
    await impact("Medium", 20);
  },

  /** Heavy impact — long press confirmed, major action */
  async heavy() {
    await impact("Heavy", 40);
  },

  /** Success — route calculated, bundle ready, sync complete */
  async success() {
    await notify("Success", [10, 50, 20]);
  },

  /** Warning — hazard nearby, entering dead zone */
  async warning() {
    // Web has no "warning" haptic; this pattern is a gentle distinct buzz.
    await notify("Warning", [15, 30, 15]);
  },

  /** Error — permission denied, offline with no bundle */
  async error() {
    await notify("Error", [20, 40, 20, 40, 20]);
  },

  /** Selection tick — drag reorder, toggle switch, filter chip */
  async selection() {
    await selectionTick(5);
  },
};

/**
 * Legacy API (backwards compatible with older code)
 * Keeps existing callsites working with zero refactors.
 */
export const haptics = {
  light: haptic.tap,
  medium: haptic.medium,
  heavy: haptic.heavy,
  success: haptic.success,
  error: haptic.error,
  selection: haptic.selection,
};
