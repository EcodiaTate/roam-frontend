// capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const isDev = process.env.NODE_ENV === "development";

const config: CapacitorConfig = {
  //  Correct, stable bundle identity
  appId: "com.ecodia.roam",
  appName: "Roam Nav",

  //  Static export output folder (Next output: export)
  webDir: "out",

  //  Dev-only live reload server. In prod, Capacitor serves the static bundle from /out.
  ...(isDev
    ? {
        server: {
          url: "http://localhost:3000",
          cleartext: true,
          androidScheme: "http",
        },
      }
    : {}),

  plugins: {
    SplashScreen: {
      // Keep splash visible until we call hide() manually
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
      resize: KeyboardResize.None,
      resizeOnFullScreen: true,
    },

    LocalNotifications: {
      smallIcon: "ic_notification",
      iconColor: "#3b82f6",
    },
  },

  // capacitor.config.ts
  ios: {
    contentInset: "always", // Changed from automatic to ensure safe areas are consistent
    backgroundColor: "#0a0a0a",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
    scrollEnabled: false, // THIS stops the whole window from scrolling/bouncing
  },

  android: {
    backgroundColor: "#0a0a0a",

    // You’re loading remote resources (Supabase PMTiles, optional satellite),
    // so mixed content can matter depending on what’s embedded.
    allowMixedContent: true,

    // Keeps input handling stable for gesture-heavy map UIs
    captureInput: true,
  },
};

export default config;
