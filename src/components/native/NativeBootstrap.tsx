// src/components/native/NativeBootstrap.tsx

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

import {
    configureStatusBar,
    configureKeyboard,
    lockPortrait,
    hideSplash,
    initAppLifecycle,
    onAppStateChange,
    initNotificationTapListener,
    requestNotificationPermission,
    requestLocationPermission,
    onNotificationTap,
} from "@/lib/native";
import { App } from "@capacitor/app";
import { networkMonitor } from "@/lib/offline/networkMonitor";
import { planSync } from "@/lib/offline/planSync";
import { initRevenueCat } from "@/lib/paywall/tripGate";
import { supabase } from "@/lib/supabase/client";

// Set this env var to your RevenueCat iOS/Android API key
const RC_API_KEY = import.meta.env.VITE_REVENUECAT_API_KEY ?? "";

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
  const router = useNavigate();
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
          networkMonitor.start(); // idempotent - will re-poll health
          planSync.drainQueue();
        }
      });

      // 5. Permissions (notifications + location requested together so both
      //    OS prompts appear at boot - location alone doesn't trigger a
      //    visible prompt on some devices)
      await Promise.all([
        requestNotificationPermission(),
        requestLocationPermission(),
      ]);
      await initNotificationTapListener();

      // Handle notification taps → route to relevant screen
      onNotificationTap((extra) => {
        const type = extra?.type;
        if (type === "bundle_ready" || type === "sync" || type === "hazard") {
          router("/trip");
        }
      });

      // 6. Handle deep links (e.g. OAuth callback via custom URL scheme)
      App.addListener("appUrlOpen", ({ url }) => {
        // au.ecodia.roam://auth/callback?code=... → /auth/callback?code=...
        try {
          const parsed = new URL(url);
          if (parsed.pathname === "/auth/callback") {
            router("/auth/callback" + parsed.search + parsed.hash, { replace: true });
          }
        } catch {}
      });

      // 7. Initialize RevenueCat (non-blocking - paywall still works via cached state)
      if (RC_API_KEY) {
        initRevenueCat(RC_API_KEY).catch(() => {});

        // Log RC in with the Supabase user ID so the RC webhook can identify
        // which user to unlock when a purchase completes on device.
        // We subscribe to auth changes so this works for both immediate and
        // delayed sign-ins (e.g. user opens app → signs in → buys).
        supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.user?.id) {
            import("@revenuecat/purchases-capacitor")
              .then(({ Purchases }) => Purchases.logIn({ appUserID: session.user.id }))
              .catch(() => {});
          }
        });
      }

      // 8. Hide splash (everything is ready)
      //    Small delay ensures the first paint has happened
      setTimeout(() => hideSplash(), 150);
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
