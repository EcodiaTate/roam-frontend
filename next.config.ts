import type { NextConfig } from "next";

const isStatic = process.env.ROAM_STATIC === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Default: server-rendered for Vercel deployment (web wrapper mode).
  // The Capacitor app loads https://roam.ecodia.au directly.
  //
  // Static export: run `npm run build:static` to produce an `out/` dir
  // for Capacitor local bundle (offline-first production build).
  ...(isStatic && {
    output: "export" as const,
    trailingSlash: true,
  }),

  // ── Bundle optimizations ──────────────────────────────────────────
  experimental: {
    // Tree-shake barrel files in these packages so only used exports land
    // in client chunks. Especially impactful for lucide-react (icon lib)
    // and the Capacitor plugin ecosystem.
    optimizePackageImports: [
      "lucide-react",
      "@capacitor/core",
      "@capacitor/app",
      "@capacitor/browser",
      "@capacitor/geolocation",
      "@capacitor/haptics",
      "@capacitor/keyboard",
      "@capacitor/local-notifications",
      "@capacitor/network",
      "@capacitor/screen-orientation",
      "@capacitor/share",
      "@capacitor/splash-screen",
      "@capacitor/status-bar",
      "@capacitor/filesystem",
      "@revenuecat/purchases-capacitor",
      "@supabase/supabase-js",
      "zod",
      "fflate",
      "idb",
    ],
  },
};

export default nextConfig;
