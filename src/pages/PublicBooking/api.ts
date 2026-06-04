/**
 * Public booking-page API — UNAUTHENTICATED.
 *
 * This is the only part of the app that talks to the backend without a JWT.
 * It hits the open `/public/*` endpoints directly (no Authorization header,
 * no 401→refresh), so it must never import `apiFetch`.
 *
 * Backend surface today:
 *   GET /public/business/{slug}            → PublicAgentResponse      (public.py)
 *   GET /public/business-by-domain/{host}  → PublicAgentResponse      (public.py)
 *   GET /public/business/{slug}/services   → PublicServiceResponse[]  (public.py; active, flat)
 *   GET /availability/public/date          → AvailabilityResponse     (availability.py; NO auth)
 *       params: agent_id, service_id, date, employee_id?, variation_id?
 *
 * Interactive-flow status (what's buildable vs. blocked):
 *   • Slot search IS already possible — /availability/public/date is public.
 *   • BLOCKED: there is NO public create-booking endpoint. appointments.create_appointment
 *     requires auth (get_current_user) and public.py exposes only GETs, so an
 *     unauthenticated customer cannot confirm a booking until the backend adds one.
 *   • `currency` is absent from PublicAgentResponse → prices render as bare
 *     numbers (see formatPrice in index.tsx).
 * So this page ships as branch landing + service menu + a "Call to book" CTA;
 * the slot-picker + confirm step plug in at the extension point in index.tsx
 * once the public create-booking endpoint (and ideally `currency`) land.
 */

import type { components } from "../../api/schema";
import { API_BASE } from "../../auth/client";

export type PublicAgent = components["schemas"]["PublicAgentResponse"];
export type PublicService = components["schemas"]["PublicServiceResponse"];

/**
 * Plain GET against a public endpoint.
 * Returns `null` on 404 (branch / domain not found) so callers can show the
 * not-found state; throws on any other non-OK status (network / server error).
 */
async function publicGet<T>(path: string): Promise<T | null> {
  const res = await fetch(API_BASE + path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export const publicApi = {
  businessBySlug: (slug: string) =>
    publicGet<PublicAgent>(`/public/business/${encodeURIComponent(slug)}`),

  businessByDomain: (hostname: string) =>
    publicGet<PublicAgent>(`/public/business-by-domain/${encodeURIComponent(hostname)}`),

  services: (slug: string) =>
    publicGet<PublicService[]>(`/public/business/${encodeURIComponent(slug)}/services`),
};
