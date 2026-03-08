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
};

export default nextConfig;
