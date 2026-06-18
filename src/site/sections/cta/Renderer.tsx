import type { SectionRendererProps } from "../types";
import type { CtaSettings } from "./schema";

/** Call-to-action banner — jumps to the #book anchor. Server component. */
export default function Cta({ settings }: SectionRendererProps<CtaSettings>) {
  return (
    <section className="py-16" style={{ background: "linear-gradient(135deg, var(--site-primary), var(--site-accent))" }}>
      <div className="max-w-2xl mx-auto px-6 text-center text-white">
        <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          {settings.heading?.trim() || "Ready when you are"}
        </h2>
        {settings.subtext && <p className="mt-3 text-white/85">{settings.subtext}</p>}
        <a
          href="#book"
          className="mt-7 inline-flex items-center justify-center rounded-lg px-7 py-3.5 text-base font-semibold shadow-lg transition-transform hover:-translate-y-0.5"
          style={{ backgroundColor: "var(--site-bg)", color: "var(--site-text)" }}
        >
          {settings.buttonLabel?.trim() || "Book now"}
        </a>
      </div>
    </section>
  );
}
