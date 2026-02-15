// src/lib/native/notifications.ts
"use client";

import { hasPlugin, isNative } from "./platform";

/* ── Types ───────────────────────────────────────────────────────────── */

type NotifyOpts = {
  id?: number;
  title: string;
  body: string;
  /** Optional: schedule for the future (ms from now) */
  delayMs?: number;
  /** Extra data (retrievable when notification is tapped) */
  extra?: Record<string, string>;
};

/* ── Permission ──────────────────────────────────────────────────────── */

let _permissionGranted = false;

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative || !hasPlugin("LocalNotifications")) {
    // Web: use Notification API
    if (typeof Notification !== "undefined") {
      const perm = await Notification.requestPermission();
      _permissionGranted = perm === "granted";
      return _permissionGranted;
    }
    return false;
  }

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const result = await LocalNotifications.requestPermissions();
    _permissionGranted = result.display === "granted";
    return _permissionGranted;
  } catch {
    return false;
  }
}

/* ── Send notification ───────────────────────────────────────────────── */

let _nextId = 1;

export async function notify(opts: NotifyOpts): Promise<void> {
  const id = opts.id ?? _nextId++;

  if (isNative && hasPlugin("LocalNotifications")) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");

      if (!_permissionGranted) {
        await requestNotificationPermission();
      }

      const scheduleAt = opts.delayMs
        ? new Date(Date.now() + opts.delayMs)
        : undefined;

      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: opts.title,
            body: opts.body,
            schedule: scheduleAt ? { at: scheduleAt } : undefined,
            extra: opts.extra,
          },
        ],
      });
      return;
    } catch (e) {
      console.warn("[Notifications] native schedule failed", e);
    }
  }

  // Web fallback
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(opts.title, { body: opts.body });
  }
}

/* ── Listen for notification taps ────────────────────────────────────── */

type TapHandler = (extra: Record<string, string>) => void;
let _tapHandler: TapHandler | null = null;

export function onNotificationTap(handler: TapHandler) {
  _tapHandler = handler;
}

/**
 * Initialize notification tap listener. Call once at boot.
 */
export async function initNotificationTapListener(): Promise<void> {
  if (!isNative || !hasPlugin("LocalNotifications")) return;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      (action) => {
        const extra = (action.notification?.extra as Record<string, string>) ?? {};
        _tapHandler?.(extra);
      },
    );
  } catch {}
}

/* ── Convenience: common Roam notifications ──────────────────────────── */

export const roamNotify = {
  bundleReady(planLabel?: string) {
    notify({
      title: "Bundle ready",
      body: planLabel
        ? `"${planLabel}" is downloaded and ready for offline use.`
        : "Your trip is downloaded and ready for offline use.",
      extra: { type: "bundle_ready" },
    });
  },

  hazardAlert(description: string) {
    notify({
      title: "⚠️ Hazard ahead",
      body: description,
      extra: { type: "hazard" },
    });
  },

  syncComplete(count: number) {
    if (count <= 0) return;
    notify({
      title: "Sync complete",
      body: `${count} change${count > 1 ? "s" : ""} synced to cloud.`,
      extra: { type: "sync" },
    });
  },
};