import type { SectionMeta } from "../types";

export interface ServicesSettings {
  heading: string;
  showPrices: boolean;
  showDurations: boolean;
}

export const servicesMeta: SectionMeta<ServicesSettings> = {
  type: "services",
  label: "Service menu",
  description: "Lists the branch's live services with prices and durations.",
  defaults: {
    heading: "Our Services",
    showPrices: true,
    showDurations: true,
  },
  fields: [
    { key: "heading", label: "Section title", type: "text", placeholder: "Our Services" },
    { key: "showPrices", label: "Show prices", type: "toggle" },
    { key: "showDurations", label: "Show durations", type: "toggle" },
  ],
};
