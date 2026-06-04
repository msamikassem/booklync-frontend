/**
 * PublicBooking — the customer-facing booking page (UNAUTHENTICATED).
 *
 * Rendered OUTSIDE AuthProvider (see App.tsx). Two entry modes:
 *   • Slug mode   — `/b/:slug` on a Booklync host. Branch resolved by slug.
 *   • Domain mode — root of a customer's verified custom domain (no :slug).
 *                   Branch resolved by hostname, then services by the branch's
 *                   own `booking_page_slug`.
 *
 * Scope: this ports + extends the legacy `book.html` (branch landing card) and
 * adds the live service menu. The interactive booking flow (pick service → pick
 * time → confirm) is intentionally NOT built yet: slot search is already public
 * (/availability/public/date), but there is NO public create-booking endpoint
 * (create_appointment requires auth), and no `currency` on the public payload
 * (see ./api.ts). The CTA is a real `tel:` link. The interactive flow plugs in
 * at the marked extension point below.
 */

import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Phone, MapPin, Clock, SearchX, Loader2 } from "lucide-react";
import { publicApi, type PublicService } from "./api";
import { storage } from "../../auth/storage";

function initials(name: string): string {
  return (
    (name || "")
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

// Prices arrive WITHOUT a currency (the public payload has no `currency` field —
// see ./api.ts). Until the backend exposes one, show the bare amount to 2 dp.
function formatPrice(price: number): string {
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PublicBooking() {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const isDomainMode = !slugParam;
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";

  // 1. Resolve the branch — by slug (slug mode) or by hostname (domain mode).
  const branchQuery = useQuery({
    queryKey: [
      "public-branch",
      isDomainMode ? `domain:${hostname}` : `slug:${slugParam}`,
    ],
    queryFn: () =>
      isDomainMode
        ? publicApi.businessByDomain(hostname)
        : publicApi.businessBySlug(slugParam as string),
    retry: false,
  });

  const branch = branchQuery.data ?? null;
  const resolvedSlug = branch?.booking_page_slug ?? null;

  // 2. Service menu — keyed off the branch's OWN slug (works in domain mode too,
  //    where there is no by-domain services endpoint). Empty list ≠ not-found.
  const servicesQuery = useQuery({
    queryKey: ["public-services", resolvedSlug],
    queryFn: () => publicApi.services(resolvedSlug as string),
    enabled: !!resolvedSlug,
    retry: false,
  });
  const services: PublicService[] = servicesQuery.data ?? [];

  // Owner-preview banner: shown when whoever is logged in (cached agents list,
  // readable outside AuthProvider) owns/accesses this branch.
  const isPreviewing = useMemo(() => {
    if (!resolvedSlug) return false;
    const agents =
      (storage.getAgents() as Array<{ booking_page_slug?: string }> | null) ?? [];
    return agents.some((a) => a.booking_page_slug === resolvedSlug);
  }, [resolvedSlug]);

  useEffect(() => {
    if (branch) {
      document.title = `${branch.agent_name || branch.business_name} — Book an Appointment`;
    } else if (branchQuery.isError || branchQuery.data === null) {
      document.title = "Page not found — Booklync";
    } else {
      document.title = "Book an Appointment — Booklync";
    }
  }, [branch, branchQuery.isError, branchQuery.data]);

  const notFoundLabel = isDomainMode ? hostname : slugParam || "this URL";

  return (
    <div className="min-h-screen flex flex-col bg-surface-soft font-body text-body">
      {/* Top bar */}
      <header className="bg-canvas border-b border-hairline px-6 py-3.5 flex items-center justify-center">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-primary">
          <span className="w-[22px] h-[22px] rounded-md bg-primary flex items-center justify-center">
            <CalendarDays className="w-3 h-3 text-white" />
          </span>
          Booklync
        </span>
      </header>

      {/* Owner preview banner */}
      {isPreviewing && (
        <div className="bg-[#fefce8] border-b border-[#fde68a] px-6 py-2.5 text-center text-[13px] font-medium text-[#92400e]">
          You&apos;re previewing your booking page. This is exactly what your customers will see.
        </div>
      )}

      <main className="flex-1 flex items-start justify-center px-4 sm:px-6 pt-12 sm:pt-16 pb-20">
        <div className="w-full max-w-[520px]">
          {branchQuery.isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted">
              <Loader2 className="w-6 h-6 animate-spin mb-3" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : branchQuery.isError ? (
            <NotFound
              title="Something went wrong"
              sub="We couldn't load this booking page. Please try again in a moment."
            />
          ) : !branch ? (
            <NotFound
              title="Page not found"
              sub={
                <>
                  No business found at <strong className="text-ink">{notFoundLabel}</strong>.
                </>
              }
            />
          ) : (
            <>
              {/* Business card */}
              <div className="bg-canvas border border-hairline rounded-2xl shadow-lg overflow-hidden">
                <div className="bg-gradient-to-br from-primary to-primary-hover px-9 pt-9 pb-8 text-center">
                  <div className="w-[72px] h-[72px] rounded-full bg-white/20 border-[3px] border-white/40 flex items-center justify-center font-display text-[28px] font-bold text-white mx-auto mb-4 tracking-tight">
                    {initials(branch.agent_name || branch.business_name)}
                  </div>
                  <div className="font-display text-[26px] font-semibold text-white tracking-tight leading-tight">
                    {branch.agent_name || branch.location_name}
                  </div>
                  {branch.business_name &&
                    branch.business_name !== branch.agent_name && (
                      <div className="text-white/75 text-sm mt-1.5">
                        {branch.business_name}
                      </div>
                    )}
                </div>

                <div className="px-9 pt-7 pb-8">
                  <ul className="flex flex-col gap-3.5">
                    {branch.phone_number && (
                      <InfoRow icon={<Phone className="w-[15px] h-[15px]" />}>
                        <a
                          href={`tel:${branch.phone_number.replace(/\s+/g, "")}`}
                          className="hover:text-primary"
                        >
                          {branch.phone_number}
                        </a>
                      </InfoRow>
                    )}
                    {branch.location_name && (
                      <InfoRow icon={<MapPin className="w-[15px] h-[15px]" />}>
                        {branch.location_name}
                      </InfoRow>
                    )}
                  </ul>

                  <div className="h-px bg-hairline my-6" />

                  {/*
                    EXTENSION POINT — interactive booking flow.
                    Slot search is already public (GET /availability/public/date,
                    params agent_id+service_id+date). When the backend adds a
                    public create-booking endpoint, replace this CTA block with the
                    service-selection → slot-selection → confirm flow. Service data
                    is already loaded in `services` above.
                  */}
                  <div className="text-[13px] font-semibold text-muted uppercase tracking-[0.06em] mb-3">
                    Ready to book?
                  </div>
                  {branch.phone_number ? (
                    <a
                      href={`tel:${branch.phone_number.replace(/\s+/g, "")}`}
                      className="flex items-center justify-center gap-2 w-full py-3.5 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold text-[15px] transition-colors"
                    >
                      <Phone className="w-4 h-4" />
                      Call to book
                    </a>
                  ) : (
                    <p className="text-sm text-muted">
                      Contact the business to book your appointment.
                    </p>
                  )}
                </div>
              </div>

              {/* Service menu */}
              <ServiceMenu
                loading={servicesQuery.isLoading}
                error={servicesQuery.isError}
                services={services}
              />
            </>
          )}
        </div>
      </main>

      <footer className="text-center py-6 border-t border-hairline bg-canvas">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted font-medium">
          <CalendarDays className="w-3.5 h-3.5" />
          Powered by Booklync
        </span>
      </footer>
    </div>
  );
}

function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-sm text-body">
      <span className="w-[34px] h-[34px] rounded-md bg-[#eff6ff] flex items-center justify-center flex-shrink-0 text-primary">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

function ServiceMenu({
  loading,
  error,
  services,
}: {
  loading: boolean;
  error: boolean;
  services: PublicService[];
}) {
  if (loading) {
    return (
      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading services…
      </div>
    );
  }
  // A service load failure is non-fatal — the branch card still shows.
  if (error) return null;
  if (services.length === 0) {
    return (
      <p className="mt-6 text-center text-sm text-muted">No services listed yet.</p>
    );
  }

  return (
    <section className="mt-6 bg-canvas border border-hairline rounded-2xl shadow-sm overflow-hidden">
      <h2 className="font-display text-base font-semibold text-ink px-6 pt-5 pb-3">
        Our Services
      </h2>
      <ul className="divide-y divide-hairline">
        {services.map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-4 px-6 py-4">
            <div className="min-w-0">
              <div className="font-medium text-ink">{s.name}</div>
              {s.description && (
                <p className="text-[13px] text-muted mt-0.5 line-clamp-2">{s.description}</p>
              )}
              <div className="flex items-center gap-1.5 text-[12px] text-muted mt-1.5">
                <Clock className="w-3.5 h-3.5" />
                {s.duration_minutes} min
              </div>
            </div>
            <div className="font-display text-base font-semibold text-ink whitespace-nowrap">
              {formatPrice(s.price)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NotFound({ title, sub }: { title: string; sub: React.ReactNode }) {
  return (
    <div className="text-center py-16">
      <div className="w-14 h-14 rounded-full bg-hairline-soft flex items-center justify-center mx-auto mb-5 text-muted">
        <SearchX className="w-6 h-6" />
      </div>
      <div className="font-display text-xl font-semibold text-ink mb-2">{title}</div>
      <div className="text-sm text-muted">{sub}</div>
    </div>
  );
}
