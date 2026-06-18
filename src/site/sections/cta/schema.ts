import type { SectionMeta } from "../types";

export interface CtaSettings {
  heading: string;
  subtext: string;
  buttonLabel: string;
}

export const ctaMeta: SectionMeta<CtaSettings> = {
  type: "cta",
  label: "Call to action",
  description: "A bold banner with a button that jumps to the booking section.",
  defaults: {
    heading: "Ready when you are",
    subtext: "Book your appointment online today.",
    buttonLabel: "Book now",
  },
  fields: [
    { key: "heading", label: "Heading", type: "text" },
    { key: "subtext", label: "Subtext", type: "text" },
    { key: "buttonLabel", label: "Button text", type: "text" },
  ],
};
