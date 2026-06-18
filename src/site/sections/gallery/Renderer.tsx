import type { SectionRendererProps } from "../types";
import type { GallerySettings } from "./schema";

/** Photo gallery — responsive grid, server component. */
export default function Gallery({ settings, ctx }: SectionRendererProps<GallerySettings>) {
  const images = (settings.images ?? []).filter(Boolean);

  // Empty gallery: render NOTHING on the live site (don't show customers a blank
  // section), but in the editor preview show a selectable placeholder so the
  // owner can find + fill it.
  if (images.length === 0 && !ctx.preview) return null;

  return (
    <section className="py-16 sm:py-20" style={{ backgroundColor: "var(--site-bg)" }}>
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold text-center tracking-tight">
          {settings.heading?.trim() || "Gallery"}
        </h2>
        {images.length === 0 ? (
          <div className="mt-8 rounded-xl border-2 border-dashed border-black/15 py-12 text-center opacity-50 text-sm">
            Add photos to this gallery in the editor →
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" className="w-full aspect-square object-cover rounded-xl" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
