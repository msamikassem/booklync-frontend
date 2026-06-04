import type { Metadata } from "next";
import {
  getBranchBySlug,
  getServices,
  branchMetadata,
} from "../../_lib/publicFetch";
import BookingView from "../../_components/BookingView";

type Params = Promise<{ slug: string }>;

// Server-rendered <title>/<meta>/OG tags from live branch data. This is what
// link unfurlers and crawlers read — they never run JS, so it must be here, not
// set client-side. The branch fetch is de-duplicated with the page body.
export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug).catch(() => null);
  return branchMetadata(branch);
}

export default async function PublicBookingPage({
  params,
}: {
  params: Params;
}) {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);
  const services =
    branch?.booking_page_slug
      ? (await getServices(branch.booking_page_slug)) ?? []
      : [];

  return (
    <BookingView branch={branch} services={services} notFoundLabel={slug} />
  );
}
