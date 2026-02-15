// capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

const isDev = process.env.NODE_ENV === "development";

const config: CapacitorConfig = {
  appId: "com.ecodia.roam",
  appName: "Roam Nav",

  // IMPORTANT:
  // This must point to the static export output
  webDir: "out",

  ...(isDev && {
    server: {
      url: "http://localhost:3000",
      cleartext: true,
      androidScheme: "http",
    },
  }),

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
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },

    LocalNotifications: {
      smallIcon: "ic_notification",
      iconColor: "#3b82f6",
    },
  },

  ios: {
    contentInset: "automatic",
    backgroundColor: "#0a0a0a",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
  },

  android: {
    backgroundColor: "#0a0a0a",

    // REQUIRED for:
    // • pmtiles
    // • local tile serving
    // • mixed asset sources
    allowMixedContent: true,

    // Required for local bundle fetches (OSRM, packs)
    // prevents blocked requests inside WebView
    captureInput: true,
  },
};

export default config;
