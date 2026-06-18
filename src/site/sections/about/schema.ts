import type { SectionMeta } from "../types";

export interface AboutSettings {
  heading: string;
  body: string;
  imageUrl: string | null;
  imageSide: "left" | "right";
}

export const aboutMeta: SectionMeta<AboutSettings> = {
  type: "about",
  label: "About",
  description: "A text block with an optional image — tell customers your story.",
  defaults: {
    heading: "About us",
    body: "We're a friendly local team dedicated to helping you look and feel your best.",
    imageUrl: null,
    imageSide: "right",
  },
  fields: [
    { key: "heading", label: "Heading", type: "text" },
    { key: "body", label: "Body text", type: "textarea" },
    { key: "imageUrl", label: "Image", type: "image" },
    {
      key: "imageSide", label: "Image side", type: "select",
      options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }],
    },
  ],
};
