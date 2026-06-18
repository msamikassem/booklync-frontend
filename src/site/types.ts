/**
 * src/site/ — the website-builder runtime (renderer + section catalogue + themes).
 *
 * The site config is a single JSON document owned by the FRONTEND: section
 * definitions live here in TS, so adding a section/theme is a frontend-only
 * change (the backend stores the config as an opaque document). Keep this file
 * in sync with the backend's structural validation (site_service._validate_config)
 * and stamp `SCHEMA_VERSION` into every config the editor writes.
 */

export const SCHEMA_VERSION = 1;

export interface BrandColors {
  primary?: string;
  accent?: string;
  bg?: string;
  text?: string;
}

export interface Brand {
  logoUrl?: string | null;
  faviconUrl?: string | null;
  colors?: BrandColors;
  font?: string;
  /** Override the displayed business name; null/absent = inherit the branch name. */
  businessName?: string | null;
}

export interface Seo {
  title?: string;
  description?: string;
  ogImageUrl?: string | null;
}

/** One placed section. `settings` is section-type-specific (see each schema.ts). */
export interface Section<T = Record<string, unknown>> {
  id: string;
  type: string;
  settings: T;
}

export interface SiteConfig {
  schemaVersion: number;
  /** Which theme the config was seeded from (informational; layout lives in sections). */
  theme: string | null;
  brand: Brand;
  seo: Seo;
  sections: Section[];
}

// ── Public API payload shapes (mirror backend app/schemas/site.py) ───────────────

export interface PublicSiteBranch {
  agent_id: number;
  agent_name: string;
  location_name: string;
  phone_number: string;
  booking_page_slug: string;
  business_name: string;
  timezone: string;
}

export interface PublicSiteVariation {
  id: number;
  name: string;
  duration_minutes?: number | null;
  price?: number | null;
}

export interface PublicSiteService {
  id: number;
  name: string;
  description?: string | null;
  duration_minutes?: number | null;
  price?: number | null;
  variations?: PublicSiteVariation[];
}

export interface PublicSiteResponse {
  branch: PublicSiteBranch;
  services: PublicSiteService[];
  config: SiteConfig | null;
  published: boolean;
  branding_removed: boolean;
  preview: boolean;
}

/** Everything a section renderer is handed besides its own settings. */
export interface RenderContext {
  branch: PublicSiteBranch;
  services: PublicSiteService[];
  brand: Brand;
  /** Hide the "Powered by Booklync" footer (plan-gated white-label). */
  brandingRemoved: boolean;
  /** True inside the editor's draft preview — interactive sections (e.g. the
   *  booking widget) disable real submission so the owner can't book by accident. */
  preview: boolean;
}
