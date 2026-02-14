/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Roam is API-driven + local-first; don’t let build-time caching confuse you.
  // You can still opt into caching per-request later.
  experimental: {
    // keep defaults; add here if you introduce server actions / etc
  },

  images: {
    // Add patterns later if you load remote images (e.g. Supabase storage).
    remotePatterns: [],
  },

  async rewrites() {
    return [
      // Map assets (serve as same-origin via Next -> backend)
      { source: "/styles/:path*", destination: "http://127.0.0.1:8000/styles/:path*" },
      { source: "/tiles/:path*", destination: "http://127.0.0.1:8000/tiles/:path*" },

      // Optional: if you want ALL API calls to be same-origin too, uncomment:
      // { source: "/health", destination: "http://127.0.0.1:8000/health" },
      // { source: "/nav/:path*", destination: "http://127.0.0.1:8000/nav/:path*" },
      // { source: "/places/:path*", destination: "http://127.0.0.1:8000/places/:path*" },
      // { source: "/bundle/:path*", destination: "http://127.0.0.1:8000/bundle/:path*" },
    ];
  },

  // If you later host tiles/pmtiles on a different domain and need CORS tweaks,
  // do it at the backend or via a reverse proxy.
};

export default nextConfig;
