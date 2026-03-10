// capacitor.config.ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "au.ecodia.roam",
  appName: "Roam Nav",

  // Fallback webDir (unused while server.url is set, but required by Capacitor)
  webDir: "out",

  // Wrap the deployed Vercel app — works for TestFlight iteration.
  // Switch back to a static bundle (remove this server block) before production.
  server: {
    url: "https://roam.ecodia.au",
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
