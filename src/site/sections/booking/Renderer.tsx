"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SectionRendererProps } from "../types";
import type { BookingSettings } from "./schema";
import type { PublicSiteService, PublicSiteVariation } from "../../types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

interface Slot { employee_id: number; employee_name: string; start_time: string; end_time: string }

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

let _tsPromise: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined" || window.turnstile) return Promise.resolve();
  if (_tsPromise) return _tsPromise;
  _tsPromise = new Promise<void>((resolve) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.defer = true; s.onload = () => resolve();
    document.head.appendChild(s);
  });
  return _tsPromise;
}

/** Interactive online-booking widget — the one client island on a published site.
 *  Disabled (no real submit) inside the editor preview (ctx.preview). */
export default function Booking({ settings, ctx }: SectionRendererProps<BookingSettings>) {
  const { branch, services, preview } = ctx;
  const tz = branch.timezone;

  const [serviceId, setServiceId] = useState<number | null>(null);
  const [variationId, setVariationId] = useState<number | null>(null);
  const [date, setDate] = useState<string>("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const hpRef = useRef<HTMLInputElement | null>(null);
  const turnstileRef = useRef<HTMLDivElement | null>(null);

  const service = useMemo(() => services.find((s) => s.id === serviceId) ?? null, [services, serviceId]);
  const variations = service?.variations ?? [];
  const needsVariation = variations.length > 0;

  // next 14 calendar days, anchored to the BRANCH timezone "today".
  const days = useMemo(() => {
    const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    const base = new Date(todayISO + "T00:00:00");
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString("en-CA");
    });
  }, [tz]);

  useEffect(() => { if (!date && days[0]) setDate(days[0]); }, [days, date]);

  // fetch slots whenever the service/variation/date is ready
  useEffect(() => {
    if (serviceId == null || !date) { setSlots([]); return; }
    if (needsVariation && variationId == null) { setSlots([]); return; }
    let cancelled = false;
    setLoadingSlots(true); setSlot(null);
    const qs = new URLSearchParams({ agent_id: String(branch.agent_id), service_id: String(serviceId), date });
    if (variationId != null) qs.set("variation_id", String(variationId));
    fetch(`${API_BASE}/availability/public/date?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : { available_slots: [] }))
      .then((d) => { if (!cancelled) setSlots(d.available_slots ?? []); })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [serviceId, variationId, date, branch.agent_id, needsVariation]);

  // group slots by start time → one button per time (first free employee wins)
  const times = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const s of slots) if (!map.has(s.start_time)) map.set(s.start_time, s);
    return [...map.values()].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [slots]);

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(iso));
  const fmtDay = (iso: string) =>
    new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: tz }).format(new Date(iso + "T12:00:00"));

  // Render the Turnstile widget at the details step (token is short-lived +
  // single-use, so render it near submit). No-op without a site key or in preview.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || preview || !slot) return;
    let widgetId: string | undefined;
    let active = true;
    loadTurnstile().then(() => {
      if (!active || !window.turnstile || !turnstileRef.current) return;
      turnstileRef.current.innerHTML = "";
      widgetId = window.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (t: string) => setTurnstileToken(t),
        "expired-callback": () => setTurnstileToken(null),
        "error-callback": () => setTurnstileToken(null),
      });
    });
    return () => {
      active = false;
      if (window.turnstile && widgetId) { try { window.turnstile.remove(widgetId); } catch { /* noop */ } }
    };
  }, [slot, preview]);

  async function submit() {
    if (!service || !slot) return;
    setError(null);
    if (!name.trim()) return setError("Please enter your name.");
    if (phone.replace(/\D/g, "").length < 7) return setError("Please enter a valid phone number.");
    if (TURNSTILE_SITE_KEY && !turnstileToken) return setError("Please complete the spam check.");
    if (preview) return setError("Booking is disabled in preview. Publish your site to take bookings.");

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/public/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: branch.booking_page_slug,
          service_id: service.id,
          variation_id: variationId,
          employee_id: slot.employee_id,
          start_time: slot.start_time,
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          customer_email: email.trim() || null,
          hp: hpRef.current?.value || "",
          turnstile_token: turnstileToken,
        }),
      });
      if (res.ok) { setDone(true); return; }
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 || data?.code === "SLOT_UNAVAILABLE") {
        setError("That time was just taken — please pick another.");
        setSlot(null);
        // refresh availability
        setDate((d) => d);
      } else {
        setError(data?.detail || "Sorry, we couldn't complete your booking. Please try again.");
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="book" className="py-16 sm:py-20" style={{ backgroundColor: "var(--site-bg)" }}>
      <div className="max-w-xl mx-auto px-6">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold text-center tracking-tight">
          {settings.heading?.trim() || "Book an appointment"}
        </h2>
        {settings.intro && <p className="mt-3 text-center opacity-75">{settings.intro}</p>}

        <div className="mt-8 rounded-2xl border border-black/10 p-5 sm:p-6 bg-black/[0.015]">
          {done ? (
            <div className="text-center py-6">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full grid place-items-center text-white" style={{ backgroundColor: "var(--site-primary)" }}>✓</div>
              <p className="text-lg font-semibold">Booking received</p>
              <p className="mt-2 opacity-75 text-sm">{settings.successMessage}</p>
            </div>
          ) : services.length === 0 ? (
            <p className="text-center text-sm opacity-60 py-4">No services available to book yet.</p>
          ) : (
            <div className="space-y-5">
              {/* 1. service */}
              <Field label="Service">
                <div className="grid gap-2">
                  {services.map((s: PublicSiteService) => (
                    <ChoiceRow key={s.id} active={serviceId === s.id}
                      onClick={() => { setServiceId(s.id); setVariationId(null); setSlot(null); }}>
                      <span className="font-medium">{s.name}</span>
                      {s.price != null && <span className="opacity-70 text-sm">{s.price.toFixed(2)}</span>}
                    </ChoiceRow>
                  ))}
                </div>
              </Field>

              {/* 1b. variation */}
              {needsVariation && (
                <Field label="Option">
                  <div className="flex flex-wrap gap-2">
                    {variations.map((v: PublicSiteVariation) => (
                      <Chip key={v.id} active={variationId === v.id} onClick={() => { setVariationId(v.id); setSlot(null); }}>
                        {v.name}{v.price != null ? ` · ${v.price.toFixed(2)}` : ""}
                      </Chip>
                    ))}
                  </div>
                </Field>
              )}

              {/* 2. date + time */}
              {serviceId != null && (!needsVariation || variationId != null) && (
                <>
                  <Field label="Date">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {days.map((d) => (
                        <Chip key={d} active={date === d} onClick={() => { setDate(d); setSlot(null); }}>{fmtDay(d)}</Chip>
                      ))}
                    </div>
                  </Field>
                  <Field label="Time">
                    {loadingSlots ? (
                      <p className="text-sm opacity-60 py-2">Loading times…</p>
                    ) : times.length === 0 ? (
                      <p className="text-sm opacity-60 py-2">No times available on this day.</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {times.map((t) => (
                          <Chip key={t.start_time} active={slot?.start_time === t.start_time} onClick={() => setSlot(t)}>
                            {fmtTime(t.start_time)}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </Field>
                </>
              )}

              {/* 3. details */}
              {slot && (
                <div className="space-y-3 pt-1">
                  <Field label="Your name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Full name" /></Field>
                  <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="Phone number" inputMode="tel" /></Field>
                  <Field label="Email (optional)"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" inputMode="email" /></Field>
                  {/* honeypot — visually hidden; bots fill it */}
                  <input ref={hpRef} type="text" name="website" tabIndex={-1} autoComplete="off"
                    aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />

                  {/* Turnstile (only when configured + not in preview) */}
                  {TURNSTILE_SITE_KEY && !preview && <div ref={turnstileRef} />}

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <button onClick={submit} disabled={submitting}
                    className="w-full py-3.5 rounded-lg font-semibold text-white shadow-md transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                    style={{ backgroundColor: "var(--site-primary)" }}>
                    {submitting ? "Booking…" : preview ? "Confirm (disabled in preview)" : "Confirm booking"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const inputCls = "w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-black/10";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[13px] font-semibold uppercase tracking-wide opacity-60 mb-2">{label}</div>
      {children}
    </div>
  );
}

function ChoiceRow({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center justify-between w-full text-left rounded-lg border px-4 py-3 transition-colors"
      style={active ? { borderColor: "var(--site-primary)", boxShadow: "0 0 0 1px var(--site-primary) inset" } : { borderColor: "rgba(0,0,0,0.12)" }}>
      {children}
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors"
      style={active
        ? { backgroundColor: "var(--site-primary)", borderColor: "var(--site-primary)", color: "#fff" }
        : { borderColor: "rgba(0,0,0,0.14)" }}>
      {children}
    </button>
  );
}
