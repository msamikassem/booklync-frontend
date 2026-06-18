import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { siteTag } from "@/app/(public)/_lib/publicFetch";

/**
 * On-demand revalidation. The BACKEND calls this (server-to-server) right after
 * a site is published, so the live ISR page swaps to the new content within
 * seconds instead of waiting out its revalidate window.
 *
 * Auth: a shared secret (REVALIDATE_SECRET) that must match the backend's. If
 * the secret is unset, the endpoint refuses everything (fail closed).
 */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { slug?: string };
  if (!body.slug || typeof body.slug !== "string") {
    return NextResponse.json({ error: "missing slug" }, { status: 400 });
  }

  revalidateTag(siteTag(body.slug));
  return NextResponse.json({ revalidated: true, slug: body.slug });
}
