import type { SectionMeta } from "../types";

export interface HeroSettings {
  heading: string;
  subheading: string;
  imageUrl: string | null;
  /** "book" → scrolls to booking/contact CTA; "call" → tel: link. */
  ctaStyle: "book" | "call";
  ctaLabel: string;
}

export const heroMeta: SectionMeta<HeroSettings> = {
  type: "hero",
  label: "Hero banner",
  description: "Big welcome banner with a headline, background image, and a call-to-action.",
  defaults: {
    heading: "Welcome",
    subheading: "Book your appointment online in seconds.",
    imageUrl: null,
    ctaStyle: "book",
    ctaLabel: "Book now",
  },
  fields: [
    { key: "heading", label: "Headline", type: "text", placeholder: "Welcome to…" },
    { key: "subheading", label: "Subtext", type: "textarea", placeholder: "A short line under the headline" },
    { key: "imageUrl", label: "Background image", type: "image" },
    {
      key: "ctaStyle", label: "Button action", type: "select",
      options: [
        { value: "book", label: "Jump to booking" },
        { value: "call", label: "Call the business" },
      ],
    },
    { key: "ctaLabel", label: "Button text", type: "text", placeholder: "Book now" },
  ],
};
