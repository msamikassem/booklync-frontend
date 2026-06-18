import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint runs as a separate `npm run lint` step against the repo's existing
  // flat config. We intentionally do NOT install eslint-config-next, so Next's
  // build-time lint integration is disabled here. Type-checking stays ON — a
  // TypeScript error still fails `next build` (that's the migration's gate).
  eslint: { ignoreDuringBuilds: true },
  // Website-builder image assets. Dev serves them from the backend's /uploads
  // (localhost:8000). Add the production asset host (e.g. the Supabase Storage
  // domain) here at cut-over so next/image can optimize them.
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000" },
      { protocol: "http", hostname: "127.0.0.1", port: "8000" },
    ],
  },
};

export default nextConfig;
