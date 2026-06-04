/**
 * Timezone utilities — verbatim port of the helpers in dashboard-appointments.js.
 * Do NOT rewrite these; the probe-offset algorithm in localInputToUtc handles DST
 * correctly by measuring the actual UTC↔local offset at the target moment rather
 * than assuming a fixed offset.
 *
 * Functions:
 *   utcToLocalInput(utcStr, tz)  →  "YYYY-MM-DDTHH:MM"  (for datetime-local inputs)
 *   localInputToUtc(localStr, tz) → UTC ISO string
 *   fmtDate(utcStr, tz)          → "Jan 5, 2025"
 *   fmtTime(utcStr, tz)          → "9:30 AM"
 *   apptDuration(appt)           → minutes (number)
 *   extractPrepSuggestedTime(detail) → { display, value } | null
 */

import type { AppointmentDetailResponse } from "./types";

/** Convert a UTC ISO string to "YYYY-MM-DDTHH:MM" in the given IANA timezone. */
export function utcToLocalInput(utcStr: string, tz: string): string {
  if (!utcStr) return "";
  const d = new Date(utcStr);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const p: Record<string, string> = {};
  parts.forEach(({ type, value }) => { p[type] = value; });
  const h = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day}T${h}:${p.minute}`;
}

/**
 * Convert "YYYY-MM-DDTHH:MM" (interpreted as a wall-clock time in `tz`) back to
 * a UTC ISO string. Uses the probe-offset method to handle DST correctly.
 */
export function localInputToUtc(localStr: string, tz: string): string | null {
  if (!localStr) return null;
  const [datePart, timePart] = localStr.split("T");
  const [yr, mo, dy] = datePart.split("-").map(Number);
  const [hr, mi] = timePart.split(":").map(Number);
  // Create a probe date treating the input as UTC
  const probe = new Date(Date.UTC(yr, mo - 1, dy, hr, mi, 0));
  // Find what local time shows for the probe in `tz`
  const lparts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(probe);
  const lp: Record<string, string> = {};
  lparts.forEach(({ type, value }) => { lp[type] = value; });
  const lh = lp.hour === "24" ? 0 : Number(lp.hour);
  const probeLocalMs = Date.UTC(
    Number(lp.year), Number(lp.month) - 1, Number(lp.day),
    lh, Number(lp.minute)
  );
  // offset = probe − probeLocal; real UTC = probe + offset
  return new Date(probe.getTime() + (probe.getTime() - probeLocalMs)).toISOString();
}

/** Format a UTC string as a short date in the given timezone. */
export function fmtDate(utcStr: string, tz: string): string {
  if (!utcStr) return "—";
  return new Date(utcStr).toLocaleDateString("en-US", {
    timeZone: tz, month: "short", day: "numeric", year: "numeric",
  });
}

/** Format a UTC string as a short time in the given timezone. */
export function fmtTime(utcStr: string, tz: string): string {
  if (!utcStr) return "";
  return new Date(utcStr).toLocaleTimeString("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit",
  });
}

/** Duration in minutes, falling back through local → UTC → service default. */
export function apptDuration(appt: AppointmentDetailResponse): number {
  if (appt.start_time_local && appt.end_time_local) {
    const sH = Number(appt.start_time_local.slice(11, 13));
    const sM = Number(appt.start_time_local.slice(14, 16));
    const eH = Number(appt.end_time_local.slice(11, 13));
    const eM = Number(appt.end_time_local.slice(14, 16));
    const mins = (eH * 60 + eM) - (sH * 60 + sM);
    if (mins > 0) return mins;
  }
  if (appt.start_time && appt.end_time) {
    const mins = Math.round((new Date(appt.end_time).getTime() - new Date(appt.start_time).getTime()) / 60000);
    if (mins > 0) return mins;
  }
  return 30;
}

/**
 * Parse a time like "3:12 PM" from a PREP_TIME_CONFLICT detail string.
 * Returns { display: "3:12 PM", value: "15:12" } or null.
 */
export function extractPrepSuggestedTime(detail: string): { display: string; value: string } | null {
  const m = detail.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toUpperCase();
  if (ampm === "AM" && hour === 12) hour = 0;
  if (ampm === "PM" && hour !== 12) hour += 12;
  return {
    display: `${m[1]}:${min} ${ampm}`,
    value: `${String(hour).padStart(2, "0")}:${min}`,
  };
}

/** Phone formatter: +13015551234 → (301) 555-1234 */
export function fmtPhone(phone: string): string {
  return phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3") || phone;
}
