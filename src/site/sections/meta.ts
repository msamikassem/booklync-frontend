/**
 * CLIENT-SAFE section catalogue — metadata only (no React components), so the
 * editor can build forms + the "add section" menu without bundling the server
 * renderers. Keep this list in sync with ./registry.ts.
 */
import type { SectionMeta } from "./types";

import { heroMeta } from "./hero/schema";
import { servicesMeta } from "./services/schema";
import { contactMeta } from "./contact/schema";
import { bookingMeta } from "./booking/schema";
import { aboutMeta } from "./about/schema";
import { galleryMeta } from "./gallery/schema";
import { ctaMeta } from "./cta/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SECTION_METAS: SectionMeta<any>[] = [
  heroMeta, aboutMeta, servicesMeta, galleryMeta, bookingMeta, ctaMeta, contactMeta,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SECTION_META_BY_TYPE: Record<string, SectionMeta<any>> = Object.fromEntries(
  SECTION_METAS.map((m) => [m.type, m]),
);
