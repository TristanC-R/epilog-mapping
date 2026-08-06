import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Cloudflare tunnel hostname to load Next.js dev resources
  // (fonts, HMR, Turbopack chunks) from a non-localhost origin.
  allowedDevOrigins: ["gower.tilth.earth"],
  // Turbopack rewrites chunk contents in place; long CDN caches keep serving
  // stale UI (e.g. the old brand name) through the tunnel.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
