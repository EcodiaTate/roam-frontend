/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Static export (writes to /out on build)
  output: "export",

  // Required for file-based routing: /trip -> /trip/index.html
  trailingSlash: true,

  // No Next image optimizer in static export
  images: {
    unoptimized: true,
  },

  //  No rewrites (tiles/styles no longer proxied through Next)
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;
