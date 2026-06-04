import type { Metadata } from "next";
import type { components } from "@/api/schema";

export type PublicAgent = components["schemas"]["PublicAgentResponse"];
export type PublicService = components["schemas"]["PublicServiceResponse"];

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";

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
