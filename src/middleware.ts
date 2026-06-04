import { NextResponse, type NextRequest } from "next/server";

/**
 * Custom-domain routing.
 *
 * Hostnames that belong to Booklync itself serve the normal app (dashboard,
 * /login, /b/:slug previews, …). Any OTHER host is a customer's verified custom
 * domain, where the entire site IS their public booking page — so every path is
 * rewritten to the `/site` resolver, which looks the branch up by hostname and
 * server-renders it (SEO intact on custom domains too).
 *
 * Behind a proxy/CDN (Vercel) the real host is in `x-forwarded-host`; fall back
 * to `host` for direct/local requests.
 */

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

export function middleware(req: NextRequest) {
  const rawHost =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const host = rawHost.split(":")[0].toLowerCase();

  if (isBooklyncHost(host)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/site";
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next internals and any path with a file extension (static assets).
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
