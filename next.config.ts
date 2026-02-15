/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ✅ This is what makes `next export` (and `out/`) happen
  output: "export",

  // ✅ Capacitor / static hosting needs trailingSlash for clean routing
  // (so /trip becomes /trip/ and maps to /trip/index.html)
  trailingSlash: true,

  // ✅ Static export must ignore image optimization
  images: {
    unoptimized: true,
    remotePatterns: [],
  },

  // ✅ Rewrites only work in dev (they require a running Next server).
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      { source: "/styles/:path*", destination: "http://127.0.0.1:8000/styles/:path*" },
      { source: "/tiles/:path*", destination: "http://127.0.0.1:8000/tiles/:path*" },
      // optionally add /health, /nav, /places, /bundle in dev if you want
    ];
  },
};

module.exports = nextConfig;
