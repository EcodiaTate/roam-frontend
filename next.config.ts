/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Server-rendered for Vercel deployment (web wrapper mode).
  // The Capacitor app loads https://roam.ecodia.au directly — no static bundle.
  // To switch back to static bundle: restore output:"export", trailingSlash:true.
};

module.exports = nextConfig;
