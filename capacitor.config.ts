// capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";

const isDev = process.env.NODE_ENV === "development";

/**
 * DEV WRAPPER URL
 * - Android emulator: http://10.0.2.2:3000
 * - Physical device: http://<your-lan-ip>:3000
 * - iOS simulator: http://localhost:3000 (or LAN IP)
 *
 * Set CAP_SERVER_URL to whichever you need.
 */
const devServerUrl =
  process.env.CAP_SERVER_URL ||
  (process.env.CAP_ANDROID_EMULATOR === "1"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000");

const config: CapacitorConfig = {
  appId: "au.ecodia.roam",
  appName: "Roam Nav",

  // PROD (and fallback): serve the bundled static web build (Next export)
  webDir: "out",

  // DEV: wrap a running web server (live reload) for fast iteration
  ...(isDev
    ? {
        server: {
          url: devServerUrl,
          cleartext: devServerUrl.startsWith("http://"),
          androidScheme: devServerUrl.startsWith("http://") ? "http" : "https",

          // Allow navigation to your backend/CDN domains while wrapped
          allowNavigation: ["*.ecodia.au", "*.supabase.co", "*.supabase.in"],
        },
      }
    : {}),

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
  },

  ios: {
    contentInset: "never",
    backgroundColor: "#0a0a0a",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
    scrollEnabled: true, // safer for any search/login inputs
  },

  android: {
    backgroundColor: "#0a0a0a",
    allowMixedContent: isDev, // keep prod HTTPS-only
  },
};

export default config;
