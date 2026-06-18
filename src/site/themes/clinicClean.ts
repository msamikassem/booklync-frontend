import { SCHEMA_VERSION, type SiteConfig } from "../types";
import { uid } from "../factory";
import { heroMeta } from "../sections/hero/schema";
import { aboutMeta } from "../sections/about/schema";
import { servicesMeta } from "../sections/services/schema";
import { bookingMeta } from "../sections/booking/schema";
import { contactMeta } from "../sections/contact/schema";
import type { Theme } from "./types";

/** A calmer, trust-forward layout for clinics, dentists, and practitioners. */
export const clinicClean: Theme = {
  id: "clinic-clean",
  name: "Clinic Clean",
  description: "Calm, trustworthy layout for clinics, dentists, and practitioners.",
  build: (): SiteConfig => ({
    schemaVersion: SCHEMA_VERSION,
    theme: "clinic-clean",
    brand: {
      logoUrl: null,
      faviconUrl: null,
      businessName: null,
      font: "inter",
      colors: { primary: "#0369A1", accent: "#0EA5E9", bg: "#F8FAFC", text: "#0F172A" },
    },
    seo: {},
    sections: [
      {
        id: uid(),
        type: "hero",
        settings: {
          ...heroMeta.defaults,
          heading: "Care you can trust",
          subheading: "Book your visit online — quick, simple, and secure.",
          ctaStyle: "book",
          ctaLabel: "Book a visit",
        },
      },
      {
        id: uid(),
        type: "about",
        settings: { ...aboutMeta.defaults, heading: "Why patients choose us", body: "Experienced practitioners, modern facilities, and care that puts you first." },
      },
      { id: uid(), type: "services", settings: { ...servicesMeta.defaults, heading: "Treatments" } },
      { id: uid(), type: "booking", settings: { ...bookingMeta.defaults, heading: "Request an appointment" } },
      { id: uid(), type: "contact", settings: { ...contactMeta.defaults } },
    ],
  }),
};
