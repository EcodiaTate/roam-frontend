// capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const config: CapacitorConfig = {
  appId: "au.ecodia.roam",
  appName: "Roam",

  // Static bundle built via `npm run build:static` → `out/`
  // Capacitor serves this from device storage — fully offline, no network required.
  webDir: "out",

  server: {
    cleartext: false,
    allowNavigation: ["*.ecodia.au", "*.supabase.co", "*.supabase.in"],
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
    },

    StatusBar: {
      style: "DARK",
      backgroundColor: "#00000000",
      overlaysWebView: true,
    },

    Keyboard: {
      // "body" resizes the WebView so content scrolls naturally above the keyboard.
      // Matches the runtime config in src/lib/native/keyboard.ts.
      resize: "body" as KeyboardResize,
      resizeOnFullScreen: true,
    },
  },

  ios: {
    contentInset: "never",
    backgroundColor: "#0a0a0a",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },

  android: {
    backgroundColor: "#0a0a0a",
    allowMixedContent: false,
  },
};

export default config;
