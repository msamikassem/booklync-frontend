import type { MetadataRoute } from "next";
import { headers } from "next/headers";

// Host-aware → must run per request, not be baked at build.
export const dynamic = "force-dynamic";

function origin(h: Headers): string {
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0];
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = origin(await headers());
  return {
    rules: { userAgent: "*", allow: "/" },
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
