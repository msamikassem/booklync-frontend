import type { Metadata } from "next";
import type { components } from "@/api/schema";
import type { PublicSiteResponse } from "@/site/types";

export type PublicAgent = components["schemas"]["PublicAgentResponse"];
export type PublicService = components["schemas"]["PublicServiceResponse"];

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";

/** Cache tag for a branch's published site. The backend hits /api/revalidate
 *  with this slug after a publish → revalidateTag(siteTag(slug)) swaps the ISR
 *  render. Keep this in sync with app/api/revalidate/route.ts. */
export function siteTag(slug: string): string {
  return `site:${slug}`;
}

/**
 * The branch's PUBLISHED website (builder output) + identity + services, in one
 * call. ISR-cached and tagged so a publish can revalidate it on demand. Returns
 * null on 404 (unknown slug).
 */
export async function getPublishedSite(slug: string): Promise<PublicSiteResponse | null> {
  const res = await fetch(`${API_BASE}/public/site/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60, tags: [siteTag(slug)] },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Public site request failed (${res.status})`);
  return (await res.json()) as PublicSiteResponse;
}

/**
 * The branch's DRAFT website for the editor live preview. NEVER cached (only the
 * owner, holding a signed token, sees it). Returns null on 404 / bad token.
 */
export async function getDraftSite(
  slug: string,
  token: string,
): Promise<PublicSiteResponse | null> {
  const res = await fetch(
    `${API_BASE}/public/site/${encodeURIComponent(slug)}/draft?token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Draft site request failed (${res.status})`);
  return (await res.json()) as PublicSiteResponse;
}

/**
 * Server-side GET against an open `/public/*` endpoint.
 *
 * Runs during SSR so the branch identity + service menu land in the initial
 * HTML — the whole point of the Next.js move: customers, Google, and link
 * unfurlers (which don't run JS) see real content, not an empty shell.
 *
 * Returns `null` on 404 (unknown slug/domain) so the route can render the
 * not-found state; throws on any other non-OK status so a backend/network
 * failure surfaces as a 5xx instead of a silent empty page.
 *
 * `revalidate: 60` lets Next serve a cached render for up to a minute — booking
 * pages change rarely, and identical fetches in one request (e.g. the page body
 * and `generateMetadata`) are de-duplicated automatically.
 */
async function publicGet<T>(path: string): Promise<T | null> {
  const res = await fetch(API_BASE + path, { next: { revalidate: 60 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Public request failed (${res.status})`);
  return (await res.json()) as T;
}

export function getBranchBySlug(slug: string): Promise<PublicAgent | null> {
  return publicGet<PublicAgent>(`/public/business/${encodeURIComponent(slug)}`);
}

export function getBranchByDomain(hostname: string): Promise<PublicAgent | null> {
  return publicGet<PublicAgent>(
    `/public/business-by-domain/${encodeURIComponent(hostname)}`,
  );
}

export function getServices(slug: string): Promise<PublicService[] | null> {
  return publicGet<PublicService[]>(
    `/public/business/${encodeURIComponent(slug)}/services`,
  );
}

/**
 * SEO metadata for a built website. Prefers the owner-set SEO (config.seo),
 * falling back to a sensible default from the branch identity. Used by both the
 * slug route and the custom-domain resolver.
 */
export function siteMetadata(site: PublicSiteResponse | null): Metadata {
  if (!site) return { title: { absolute: "Page not found — Booklync" } };
  const seo = site.published ? site.config?.seo : undefined;
  const name =
    site.config?.brand?.businessName?.trim() ||
    site.branch.agent_name ||
    site.branch.business_name ||
    "Book an Appointment";
  const title = seo?.title?.trim() || `${name} — Book an Appointment`;
  const description =
    seo?.description?.trim() ||
    `Book an appointment with ${name}${
      site.branch.location_name ? ` in ${site.branch.location_name}` : ""
    }.`;
  const ogImage = seo?.ogImageUrl || undefined;
  const favicon = site.config?.brand?.faviconUrl || undefined;
  return {
    title: { absolute: title },
    description,
    ...(favicon ? { icons: { icon: favicon } } : {}),
    openGraph: {
      title,
      description,
      type: "website",
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: { card: ogImage ? "summary_large_image" : "summary", title, description },
  };
}

/**
 * SEO metadata for a branch (shared by the slug route and the custom-domain
 * resolver). `title.absolute` bypasses the root layout's "%s — Booklync"
 * template so the public page owns its full title.
 */
export function branchMetadata(branch: PublicAgent | null): Metadata {
  if (!branch) return { title: { absolute: "Page not found — Booklync" } };
  const name =
    branch.agent_name || branch.business_name || "Book an Appointment";
  const title = `${name} — Book an Appointment`;
  const description = `Book an appointment with ${name}${
    branch.location_name ? ` in ${branch.location_name}` : ""
  }.`;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}
