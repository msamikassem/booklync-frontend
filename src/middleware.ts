import { NextResponse, type NextRequest } from "next/server";

/**
 * Custom-domain routing.
 *
 * Hostnames that belong to Booklync itself serve the normal app (dashboard,
 * /login, /b/:slug, …). Any OTHER host is a customer's verified custom domain,
 * where the whole site IS their published booking page.
 *
 * We resolve host → branch slug (cached) and **rewrite onto the ISR-cached
 * `/b/[slug]` renderer**, so a custom domain serves the exact same cached HTML
 * as the slug URL (no per-request, uncached resolve). Publishing revalidates the
 * shared `site:{slug}` tag, so both surfaces update together.
 *
 * Behind a proxy/CDN the real host is in `x-forwarded-host`; fall back to `host`.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";

const BOOKLYNC_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "booklync.com",
  "www.booklync.com",
]);

function isBooklyncHost(h: string): boolean {
  return (
    BOOKLYNC_HOSTS.has(h) ||
    h.endsWith(".vercel.app") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(h)
  );
}

// In-memory host→slug cache (per server instance). Domains change rarely, so a
// short TTL keeps the middleware lookup off the hot path without going stale for
// long. Negatives are cached too (shorter) so unknown hosts don't hammer the API.
const TTL_OK = 5 * 60_000;
const TTL_MISS = 30_000;
const _cache = new Map<string, { slug: string | null; exp: number }>();

async function resolveSlug(host: string): Promise<string | null> {
  const hit = _cache.get(host);
  if (hit && hit.exp > Date.now()) return hit.slug;

  let slug: string | null = null;
  try {
    const res = await fetch(`${API_BASE}/public/domain-slug/${encodeURIComponent(host)}`);
    if (res.ok) slug = (await res.json())?.slug ?? null;
  } catch {
    // backend unreachable → treat as miss; the /b page will show not-found
  }
  _cache.set(host, { slug, exp: Date.now() + (slug ? TTL_OK : TTL_MISS) });
  return slug;
}

export async function middleware(req: NextRequest) {
  const rawHost =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const host = rawHost.split(":")[0].toLowerCase();

  if (isBooklyncHost(host)) return NextResponse.next();

  const slug = await resolveSlug(host);
  const url = req.nextUrl.clone();
  // Unknown host → use it as the (non-matching) slug so /b/[slug] renders the
  // server-side not-found view, labelled with the host.
  url.pathname = `/b/${slug ?? host}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next internals and any path with a file extension (static assets).
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
