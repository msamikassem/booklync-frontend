import type { SectionRendererProps } from "../types";
import type { AboutSettings } from "./schema";

/** About — text + optional image, server component. */
export default function About({ settings }: SectionRendererProps<AboutSettings>) {
  const hasImage = !!settings.imageUrl;
  const imageRight = settings.imageSide !== "left";

  return (
    <section className="py-16 sm:py-20" style={{ backgroundColor: "var(--site-bg)" }}>
      <div className="max-w-5xl mx-auto px-6">
        <div className={`grid gap-10 items-center ${hasImage ? "md:grid-cols-2" : ""}`}>
          <div className={!imageRight && hasImage ? "md:order-2" : ""}>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
              {settings.heading?.trim() || "About us"}
            </h2>
            {settings.body && (
              <p className="mt-4 opacity-75 leading-relaxed whitespace-pre-line">{settings.body}</p>
            )}
          </div>
          {hasImage && (
            <div className={!imageRight ? "md:order-1" : ""}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={settings.imageUrl as string} alt={settings.heading || ""} className="w-full rounded-2xl object-cover shadow-sm" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
