import type { SectionRendererProps } from "../types";
import type { ServicesSettings } from "./schema";

function formatPrice(price: number): string {
  // No currency on the public payload yet (Phase 2) — show the bare amount.
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Live service menu — server component. Data comes from ctx.services. */
export default function Services({ settings, ctx }: SectionRendererProps<ServicesSettings>) {
  const services = ctx.services ?? [];

  return (
    <section className="py-16 sm:py-20" style={{ backgroundColor: "var(--site-bg)" }}>
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold text-center tracking-tight">
          {settings.heading?.trim() || "Our Services"}
        </h2>

        {services.length === 0 ? (
          <p className="mt-8 text-center text-sm opacity-60">No services listed yet.</p>
        ) : (
          <ul className="mt-10 divide-y divide-black/10">
            {services.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-6 py-5">
                <div className="min-w-0">
                  <div className="font-medium text-[17px]">{s.name}</div>
                  {s.description && (
                    <p className="mt-1 text-sm opacity-70 line-clamp-2">{s.description}</p>
                  )}
                  {settings.showDurations && s.duration_minutes != null && (
                    <div className="mt-1.5 text-[13px] opacity-60">{s.duration_minutes} min</div>
                  )}
                </div>
                {settings.showPrices && s.price != null && (
                  <div className="font-display text-lg font-semibold whitespace-nowrap">
                    {formatPrice(s.price)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
