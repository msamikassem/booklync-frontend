import type { CSSProperties } from "react";
import type { Brand } from "./types";

/** Fallback palette when a site hasn't set its own brand colors. */
export const DEFAULT_COLORS = {
  primary: "#2563EB",
  accent: "#7C3AED",
  bg: "#ffffff",
  text: "#0F172A",
} as const;

/**
 * Brand colors are exposed to every section as CSS custom properties on the
 * site root. Sections reference them (`var(--site-primary)` etc.) so a single
 * wrapper re-themes the whole page — no per-section colour plumbing.
 */
/** Curated per-site font pairings. `key` is stored in brand.font; values are the
 *  CSS vars declared on <html> by app/fonts.ts. */
export const FONT_OPTIONS: { key: string; label: string; heading: string; body: string }[] = [
  { key: "satoshi", label: "Modern (Satoshi)", heading: "var(--font-satoshi)", body: "var(--font-inter)" },
  { key: "playfair", label: "Elegant (Playfair)", heading: "var(--font-playfair)", body: "var(--font-inter)" },
  { key: "poppins", label: "Friendly (Poppins)", heading: "var(--font-poppins)", body: "var(--font-poppins)" },
];

function fontVars(font: string | undefined): { heading: string; body: string } {
  return FONT_OPTIONS.find((f) => f.key === font) ?? FONT_OPTIONS[0];
}

export function brandStyle(brand: Brand | undefined): CSSProperties {
  const c = { ...DEFAULT_COLORS, ...(brand?.colors ?? {}) };
  const f = fontVars(brand?.font);
  return {
    "--site-primary": c.primary,
    "--site-accent": c.accent,
    "--site-bg": c.bg,
    "--site-text": c.text,
    "--site-font": f.body,
    "--site-font-heading": f.heading,
    backgroundColor: "var(--site-bg)",
    color: "var(--site-text)",
    fontFamily: "var(--site-font)",
  } as CSSProperties;
}

/** The display name a site should show (brand override → branch name). */
export function displayName(brand: Brand | undefined, branchName: string): string {
  return (brand?.businessName || "").trim() || branchName;
}
