import type { SectionMeta } from "../types";

export interface ContactSettings {
  heading: string;
  blurb: string;
  showPhone: boolean;
  showAddress: boolean;
}

export const contactMeta: SectionMeta<ContactSettings> = {
  type: "contact",
  label: "Contact & booking",
  description: "Phone, address, and a call-to-book button. Anchor target for hero CTAs.",
  defaults: {
    heading: "Visit us",
    blurb: "Call to book your appointment — we'd love to see you.",
    showPhone: true,
    showAddress: true,
  },
  fields: [
    { key: "heading", label: "Section title", type: "text", placeholder: "Visit us" },
    { key: "blurb", label: "Intro text", type: "textarea" },
    { key: "showPhone", label: "Show phone number", type: "toggle" },
    { key: "showAddress", label: "Show address", type: "toggle" },
  ],
};
