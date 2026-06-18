import type { SectionMeta } from "../types";

export interface BookingSettings {
  heading: string;
  intro: string;
  successMessage: string;
}

export const bookingMeta: SectionMeta<BookingSettings> = {
  type: "booking",
  label: "Book online",
  description: "Interactive booking: customers pick a service, time, and confirm — creates a real appointment.",
  defaults: {
    heading: "Book an appointment",
    intro: "Choose a service and a time that works for you.",
    successMessage: "Thanks! Your booking request has been received — we'll confirm shortly.",
  },
  fields: [
    { key: "heading", label: "Section title", type: "text", placeholder: "Book an appointment" },
    { key: "intro", label: "Intro text", type: "textarea" },
    { key: "successMessage", label: "Confirmation message", type: "textarea", help: "Shown after a successful booking." },
  ],
};
