import type { SectionRendererProps } from "../types";
import type { HeroSettings } from "./schema";
import { displayName } from "../../brand";

/** Hero banner — server component, no client JS. */
export default function Hero({ settings, ctx }: SectionRendererProps<HeroSettings>) {
  const name = displayName(ctx.brand, ctx.branch.agent_name || ctx.branch.business_name);
  const heading = settings.heading?.trim() || name;
  const phone = (ctx.branch.phone_number || "").replace(/\s+/g, "");

  const callHref = phone ? `tel:${phone}` : undefined;
  const isCall = settings.ctaStyle === "call";
  const ctaHref = isCall ? callHref : "#book";

  return (
    <section
      className="relative isolate overflow-hidden"
      style={
        settings.imageUrl
          ? {
              backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.30), rgba(0,0,0,0.55)), url(${settings.imageUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : { background: "linear-gradient(135deg, var(--site-primary), var(--site-accent))" }
      }
    >
      <div className="max-w-3xl mx-auto px-6 py-24 sm:py-32 text-center text-white">
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05]">
          {heading}
        </h1>
        {settings.subheading && (
          <p className="mt-5 text-lg sm:text-xl text-white/85 max-w-xl mx-auto">
            {settings.subheading}
          </p>
        )}
        {ctaHref && (
          <a
            href={ctaHref}
            className="mt-8 inline-flex items-center justify-center rounded-lg px-7 py-3.5 text-base font-semibold shadow-lg transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: "var(--site-bg)", color: "var(--site-text)" }}
          >
            {settings.ctaLabel?.trim() || "Book now"}
          </a>
        )}
      </div>
    </section>
  );
}
