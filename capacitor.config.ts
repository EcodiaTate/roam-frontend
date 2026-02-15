// capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "com.roam.app",
  appName: "Roam",
  webDir: ".next",
  server: {
    url: "http://localhost:3000",
    cleartext: true,
    androidScheme: "http",
  },
  plugins: {
    SplashScreen: {
      // Keep splash visible until we call hide() manually
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
      // If you have splash images:
      // splashImmersive: true,
      // splashFullScreen: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#00000000",
      overlaysWebView: true,
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      smallIcon: "ic_notification",
      iconColor: "#3b82f6",
    },
    ScreenOrientation: {
      // Locked in code, but you can also set it here
    },
  },
  // iOS specific
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0a0a0a",
    preferredContentMode: "mobile",
    // Allow inline media playback (needed for map)
    allowsLinkPreview: false,
  },
  // Android specific
  android: {
    backgroundColor: "#0a0a0a",
    allowMixedContent: true, // needed for pmtiles local + remote
    // Keep WebView alive in background for sync
    // webContentsDebuggingEnabled: true, // set true for dev only
  },
};

export default config;