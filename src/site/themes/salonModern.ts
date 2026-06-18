import { SCHEMA_VERSION, type SiteConfig } from "../types";
import { uid } from "../factory";
import { heroMeta } from "../sections/hero/schema";
import { servicesMeta } from "../sections/services/schema";
import { contactMeta } from "../sections/contact/schema";
import { bookingMeta } from "../sections/booking/schema";
import type { Theme } from "./types";

/**
 * The first theme. A theme is just a starting config — the owner edits freely
 * afterwards. Keep `build()` pure + deterministic except for section ids.
 */
export const salonModern: Theme = {
  id: "salon-modern",
  name: "Salon Modern",
  description: "Clean, image-led layout for salons, spas, and studios.",
  build: (): SiteConfig => ({
    schemaVersion: SCHEMA_VERSION,
    theme: "salon-modern",
    brand: {
      logoUrl: null,
      faviconUrl: null,
      businessName: null,
      font: "satoshi",
      colors: { primary: "#7C3AED", accent: "#DB2777", bg: "#ffffff", text: "#1F2937" },
    },
    seo: {},
    sections: [
      {
        id: uid(),
        type: "hero",
        settings: {
          ...heroMeta.defaults,
          heading: "Look good. Feel great.",
          subheading: "Book your next appointment online in just a few taps.",
          ctaStyle: "book",
          ctaLabel: "Book an appointment",
        },
      },
      { id: uid(), type: "services", settings: { ...servicesMeta.defaults } },
      { id: uid(), type: "booking", settings: { ...bookingMeta.defaults } },
      {
        id: uid(),
        type: "contact",
        settings: {
          ...contactMeta.defaults,
          heading: "Visit us",
          blurb: "Have a question or prefer to book by phone? Give us a call.",
        },
      },
    ],
  }),
};
