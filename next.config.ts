import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint runs as a separate `npm run lint` step against the repo's existing
  // flat config. We intentionally do NOT install eslint-config-next, so Next's
  // build-time lint integration is disabled here. Type-checking stays ON — a
  // TypeScript error still fails `next build` (that's the migration's gate).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
