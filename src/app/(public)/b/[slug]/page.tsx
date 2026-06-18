import type { Metadata } from "next";
import { getPublishedSite, siteMetadata } from "../../_lib/publicFetch";
import type { PublicAgent, PublicService } from "../../_lib/publicFetch";
import BookingView from "../../_components/BookingView";
import SiteRenderer from "@/site/SiteRenderer";

type Params = Promise<{ slug: string }>;

// NOTE: this route must NOT read `searchParams` — doing so forces dynamic
// rendering and defeats the ISR cache that `revalidateTag` swaps on publish.
// The editor's draft preview lives at its own route: /preview/[slug].

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const site = await getPublishedSite(slug).catch(() => null);
  return siteMetadata(site);
}

export default async function PublicBookingPage({ params }: { params: Params }) {
  const { slug } = await params;
  const site = await getPublishedSite(slug);

  // Unknown slug → built-in not-found view.
  if (!site) {
    return <BookingView branch={null} services={[]} notFoundLabel={slug} />;
  }

  // Published builder site → render it.
  if (site.published && site.config) {
    return (
      <SiteRenderer
        config={site.config}
        branch={site.branch}
        services={site.services}
        brandingRemoved={site.branding_removed}
      />
    );
  }

  // Known branch with no published site yet → the simple built-in booking page
  // (reuse the identity + services we already fetched). The site payload shapes
  // are field-compatible with the legacy BookingView props.
  return (
    <BookingView
      branch={site.branch as unknown as PublicAgent}
      services={site.services as unknown as PublicService[]}
      notFoundLabel={slug}
    />
  );
}
