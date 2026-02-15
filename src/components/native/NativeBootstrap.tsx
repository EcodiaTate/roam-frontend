// src/components/native/NativeBootstrap.tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  isNative,
  configureStatusBar,
  configureKeyboard,
  lockPortrait,
  hideSplash,
  initAppLifecycle,
  onAppStateChange,
  initNotificationTapListener,
  requestNotificationPermission,
  onNotificationTap,
} from "@/lib/native";
import { networkMonitor } from "@/lib/offline/networkMonitor";
import { planSync } from "@/lib/offline/planSync";

/**
 * Invisible component that initializes all native Capacitor plugins.
 *
 * Mount once in the root layout. Renders nothing.
 *
 * Initialization order:
 *   1. Status bar → dark, transparent (instant visual)
 *   2. Screen orientation → lock portrait
 *   3. Keyboard → configure resize + done button
 *   4. App lifecycle → listen for foreground/background
 *   5. Notifications → request permission + listen for taps
 *   6. Splash screen → hide after all setup is done
 */
export function NativeBootstrap() {
  const router = useRouter();
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      // 1. Visual setup (status bar)
      await configureStatusBar();

      // 2. Lock orientation
      await lockPortrait();

      // 3. Keyboard behavior
      await configureKeyboard();

      // 4. App lifecycle (foreground/background)
      await initAppLifecycle();

      // When app comes to foreground: trigger sync drain + network recheck
      onAppStateChange((state) => {
        if (state === "foreground") {
          // Recheck network and drain sync queue
          networkMonitor.start(); // idempotent — will re-poll health
          planSync.drainQueue();
        }
      });

      // 5. Notifications
      await requestNotificationPermission();
      await initNotificationTapListener();

      // Handle notification taps → route to relevant screen
      onNotificationTap((extra) => {
        const type = extra?.type;
        if (type === "bundle_ready" || type === "sync") {
          router.push("/plans");
        } else if (type === "hazard") {
          router.push("/trip");
        }
      });

      // 6. Hide splash (everything is ready)
      //    Small delay ensures the first paint has happened
      setTimeout(() => hideSplash(), 150);
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}