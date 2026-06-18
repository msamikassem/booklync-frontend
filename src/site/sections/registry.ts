/**
 * SERVER section registry — maps section type → full definition (incl. renderer).
 * Imported by SiteRenderer (a server component) only.
 *
 * ── To add a new section ──────────────────────────────────────────────────────
 *   1. create sections/<type>/schema.ts (its SectionMeta) + Renderer.tsx
 *   2. add one line here, and one line in ./meta.ts
 * That's it — the public renderer and the editor pick it up automatically.
 */
import type { SectionDef } from "./types";

import { heroMeta } from "./hero/schema";
import Hero from "./hero/Renderer";
import { servicesMeta } from "./services/schema";
import Services from "./services/Renderer";
import { contactMeta } from "./contact/schema";
import Contact from "./contact/Renderer";
import { bookingMeta } from "./booking/schema";
import Booking from "./booking/Renderer";
import { aboutMeta } from "./about/schema";
import About from "./about/Renderer";
import { galleryMeta } from "./gallery/schema";
import Gallery from "./gallery/Renderer";
import { ctaMeta } from "./cta/schema";
import Cta from "./cta/Renderer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DEFS: SectionDef<any>[] = [
  { ...heroMeta, Renderer: Hero },
  { ...aboutMeta, Renderer: About },
  { ...servicesMeta, Renderer: Services },
  { ...galleryMeta, Renderer: Gallery },
  { ...bookingMeta, Renderer: Booking },
  { ...ctaMeta, Renderer: Cta },
  { ...contactMeta, Renderer: Contact },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SECTION_DEFS: Record<string, SectionDef<any>> = Object.fromEntries(
  DEFS.map((d) => [d.type, d]),
);

export function getSectionDef(type: string): SectionDef | undefined {
  return SECTION_DEFS[type];
}
