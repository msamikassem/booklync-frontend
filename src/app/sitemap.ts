import type { MetadataRoute } from "next";
import { headers } from "next/headers";

// Host-aware → must run per request, not be baked at build.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0];
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (!host) return [];
  // The published booking site lives at the host root (custom domain) or, for a
  // Booklync host, this is just the app root. One entry is enough for SEO here.
  return [{ url: `${proto}://${host}/`, changeFrequency: "weekly", priority: 1 }];
}
