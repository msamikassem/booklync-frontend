import { CalendarDays } from "lucide-react";
import { SECTION_DEFS } from "./sections/registry";
import { brandStyle, displayName } from "./brand";
import type { SiteConfig, PublicSiteBranch, PublicSiteService } from "./types";

/**
 * The public site renderer — a SERVER component (zero client JS). Walks the
 * published config's sections and renders each via the section registry.
 *
 * Forward-compat (load-bearing): an UNKNOWN section type is skipped and missing
 * settings fall back to the section's defaults — so a future schema change can
 * never break an already-published site.
 */
export default function SiteRenderer({
  config,
  branch,
  services,
  brandingRemoved,
  preview = false,
}: {
  config: SiteConfig;
  branch: PublicSiteBranch;
  services: PublicSiteService[];
  brandingRemoved: boolean;
  preview?: boolean;
}) {
  const brand = config.brand ?? {};
  const ctx = { branch, services, brand, brandingRemoved, preview };
  const sections = Array.isArray(config.sections) ? config.sections : [];

  return (
    <div className="site-root min-h-screen flex flex-col" style={brandStyle(brand)}>
      {/* Per-site fonts: root sets the body font; this scopes the heading font to
          this site's display text without touching each section component. */}
      <style>{`.site-root .font-display{font-family:var(--site-font-heading)}`}</style>
      {brand.logoUrl && (
        <header className="px-6 py-4 flex items-center" style={{ backgroundColor: "var(--site-bg)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brand.logoUrl}
            alt={displayName(brand, branch.agent_name)}
            className="h-9 w-auto object-contain"
          />
        </header>
      )}

      <main className="flex-1">
        {sections.map((section) => {
          const def = SECTION_DEFS[section.type];
          if (!def) return null; // unknown type → skip (forward-compat)
          const Renderer = def.Renderer;
          const settings = { ...def.defaults, ...(section.settings ?? {}) };
          // The wrapper carries the section id/type so the editor preview can
          // click-to-select + outline a section. It's inert on the public site
          // (no listeners attached there).
          return (
            <div key={section.id} data-site-section={section.id} data-section-type={section.type}>
              <Renderer settings={settings} ctx={ctx} />
            </div>
          );
        })}
      </main>

      {!brandingRemoved && (
        <footer
          className="text-center py-6 border-t border-black/10"
          style={{ backgroundColor: "var(--site-bg)" }}
        >
          <span className="inline-flex items-center gap-1.5 text-xs opacity-60 font-medium">
            <CalendarDays className="w-3.5 h-3.5" />
            Powered by Booklync
          </span>
        </footer>
      )}
    </div>
  );
}
