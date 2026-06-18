import type { SectionRendererProps } from "../types";
import type { ContactSettings } from "./schema";

/** Contact + booking CTA — server component. `#book` anchor for hero CTAs. */
export default function Contact({ settings, ctx }: SectionRendererProps<ContactSettings>) {
  const phone = (ctx.branch.phone_number || "").replace(/\s+/g, "");

  return (
    <section id="book" className="py-16 sm:py-20" style={{ backgroundColor: "var(--site-bg)" }}>
      <div className="max-w-xl mx-auto px-6 text-center">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
          {settings.heading?.trim() || "Visit us"}
        </h2>
        {settings.blurb && <p className="mt-4 opacity-75">{settings.blurb}</p>}

        <div className="mt-8 space-y-2 text-[15px]">
          {settings.showAddress && ctx.branch.location_name && (
            <div className="opacity-80">{ctx.branch.location_name}</div>
          )}
          {settings.showPhone && ctx.branch.phone_number && (
            <div>
              <a href={phone ? `tel:${phone}` : undefined} className="font-medium hover:underline">
                {ctx.branch.phone_number}
              </a>
            </div>
          )}
        </div>

        {ctx.branch.phone_number && (
          <a
            href={`tel:${phone}`}
            className="mt-8 inline-flex items-center justify-center rounded-lg px-7 py-3.5 text-base font-semibold text-white shadow-md transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: "var(--site-primary)" }}
          >
            Call to book
          </a>
        )}
      </div>
    </section>
  );
}
