import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  getBranchByDomain,
  getServices,
  branchMetadata,
} from "../_lib/publicFetch";
import BookingView from "../_components/BookingView";

// Resolved per-request from the Host header (set by middleware on a custom
// domain), so it can never be statically prerendered.
export const dynamic = "force-dynamic";

async function resolveHost(): Promise<string> {
  const h = await headers();
  const raw = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return raw.split(":")[0].toLowerCase();
}

export async function generateMetadata(): Promise<Metadata> {
  const host = await resolveHost();
  const branch = await getBranchByDomain(host).catch(() => null);
  return branchMetadata(branch);
}

export default async function SitePage() {
  const host = await resolveHost();
  const branch = await getBranchByDomain(host);
  const services =
    branch?.booking_page_slug
      ? (await getServices(branch.booking_page_slug)) ?? []
      : [];

  return (
    <BookingView branch={branch} services={services} notFoundLabel={host} />
  );
}
