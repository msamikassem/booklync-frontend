import type { Metadata } from "next";
import { getDraftSite } from "../../_lib/publicFetch";
import SiteRenderer from "@/site/SiteRenderer";
import PreviewBridge from "./PreviewBridge";

// Draft preview is per-request and token-gated — never cached, never indexed.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Preview — Booklync" },
  robots: { index: false, follow: false },
};

type Params = Promise<{ slug: string }>;
type Search = Promise<{ token?: string }>;

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { slug } = await params;
  const { token } = await searchParams;

  if (!token) return <PreviewNotice msg="Missing preview token." />;

  const site = await getDraftSite(slug, token).catch(() => null);
  if (!site) return <PreviewNotice msg="This preview link is invalid or has expired." />;
  if (!site.config) return <PreviewNotice msg="No draft to preview yet — pick a theme to start." />;

  return (
    <>
      <SiteRenderer
        config={site.config}
        branch={site.branch}
        services={site.services}
        brandingRemoved={site.branding_removed}
        preview
      />
      <PreviewBridge />
    </>
  );
}

function PreviewNotice({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-soft px-6">
      <p className="text-sm text-muted text-center max-w-sm">{msg}</p>
    </div>
  );
}
