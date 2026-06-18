import type { SectionMeta } from "../types";

export interface GallerySettings {
  heading: string;
  images: string[];
}

export const galleryMeta: SectionMeta<GallerySettings> = {
  type: "gallery",
  label: "Gallery",
  description: "A grid of photos — show off your space and your work.",
  defaults: {
    heading: "Gallery",
    images: [],
  },
  fields: [
    { key: "heading", label: "Heading", type: "text" },
    { key: "images", label: "Photos", type: "imageList" },
  ],
};
