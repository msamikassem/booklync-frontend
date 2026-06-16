/**
 * Calendar date/time utilities — verbatim port of _cal* helpers.
 * Mon=0 … Sun=6 day-of-week convention throughout.
 */

import type { AppointmentDetailResponse } from "../Appointments/types";

// ── Date helpers ──────────────────────────────────────────────────────────────

export function calCloneDate(d: Date): Date { return new Date(d.getTime()); }
export function calStartOfDay(d: Date): Date { const x = calCloneDate(d); x.setHours(0,0,0,0); return x; }
export function calAddDays(d: Date, n: number): Date { const x = calCloneDate(d); x.setDate(x.getDate() + n); return x; }

/** Monday-anchored week start */
export function calWeekStart(d: Date): Date {
  const x = calStartOfDay(d);
  const dow = x.getDay(); // 0 Sun … 6 Sat
  const back = (dow + 6) % 7; // distance to last Monday
  return calAddDays(x, -back);
}
export function calMonthStart(d: Date): Date { const x = calStartOfDay(d); x.setDate(1); return x; }
export function calMonthEnd(d: Date): Date { const x = calStartOfDay(d); x.setMonth(x.getMonth()+1); x.setDate(0); return x; }

export function calToISODate(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth()+1).padStart(2,"0");
  const dy = String(d.getDate()).padStart(2,"0");
  return `${yr}-${mo}-${dy}`;
}
export function calFromISODate(s: string): Date {
  const [yr, mo, dy] = s.split("-").map(Number);
  return new Date(yr, mo-1, dy, 0, 0, 0, 0);
}
export function calSameDay(a: Date, b: Date): boolean {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
/** Mon=0 … Sun=6 */
export function calDow(d: Date): number { return (d.getDay()+6)%7; }

// ── Time axis range ───────────────────────────────────────────────────────────

export function calRangeFromBH(
  businessHours: { day_of_week: number; open_time: string; closed_time: string }[],
  dow: number
): { startHour: number; endHour: number } | null {
  const todayBH = businessHours.filter(bh => bh.day_of_week === dow);
  if (!todayBH.length) return null;
  let minMin = Infinity, maxMin = -Infinity;
  for (const bh of todayBH) {
    const [oH, oM] = (bh.open_time   || "08:00").split(":").map(Number);
    const [cH, cM] = (bh.closed_time || "17:00").split(":").map(Number);
    if (oH*60+oM < minMin) minMin = oH*60+oM;
    if (cH*60+cM > maxMin) maxMin = cH*60+cM;
  }
  return { startHour: Math.floor(minMin/60), endHour: Math.min(24, Math.ceil(maxMin/60)+1) };
}

export function calComputeTimeRange(
  allHours: { start_time: string; end_time: string }[][]
): { startHour: number; endHour: number } {
  let minMin = Infinity, maxMin = -Infinity;
  for (const arr of allHours) {
    for (const h of arr) {
      const [sH, sM] = (h.start_time || "08:00").split(":").map(Number);
      const [eH, eM] = (h.end_time   || "20:00").split(":").map(Number);
      const s = sH*60+sM, e = eH*60+eM;
      if (s < minMin) minMin = s;
      if (e > maxMin) maxMin = e;
    }
  }
  if (minMin === Infinity) { minMin = 8*60; maxMin = 20*60; }
  return { startHour: Math.max(0, Math.floor(minMin/60)-1), endHour: Math.min(24, Math.ceil(maxMin/60)+1) };
}

export function calFmtTimeLabel(hour: number): string {
  const h = ((hour%24)+24)%24;
  if (h===0)       return "12:00 am";
  if (h===12)      return "12:00 pm";
  if (h<12)        return `${h}:00 am`;
  return `${h-12}:00 pm`;
}

// ── Agent wall-clock ──────────────────────────────────────────────────────────

export interface AgentTimeRef {
  agentId: number;
  dateISO: string;
  hours: number;
  mins: number;
  secs: number;
  timezone: string | null;
  fetchedAt: number;
}

/** Project an AgentTimeRef forward to the current wall-clock time. */
export function calAgentNow(ref: AgentTimeRef | null): { dateISO: string; minutes: number } | null {
  if (!ref) return null;
  const elapsedSec = Math.floor((Date.now() - ref.fetchedAt) / 1000);
  const totalSec = ref.hours*3600 + ref.mins*60 + ref.secs + elapsedSec;
  const dayShift = Math.floor(totalSec / 86400);
  const daySec   = ((totalSec % 86400) + 86400) % 86400;
  const hours    = Math.floor(daySec / 3600);
  const mins     = Math.floor((daySec % 3600) / 60);
  let dateISO    = ref.dateISO;
  if (dayShift !== 0) {
    const [y,mo,d] = dateISO.split("-").map(Number);
    const dt = new Date(y, mo-1, d);
    dt.setDate(dt.getDate() + dayShift);
    dateISO = calToISODate(dt);
  }
  return { dateISO, minutes: hours*60 + mins };
}

// ── Appointment helpers ───────────────────────────────────────────────────────

/** Extract the local date + minute-of-day from start_time_local; falls back to UTC conversion. */
export function calApptLocalParts(appt: AppointmentDetailResponse, tz?: string): { dateISO: string; minutes: number } | null {
  const localStr = appt.start_time_local;
  if (localStr && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(localStr)) {
    return { dateISO: localStr.slice(0,10), minutes: Number(localStr.slice(11,13))*60 + Number(localStr.slice(14,16)) };
  }
  const utcStr = appt.start_time;
  if (!utcStr) return null;
  const d = new Date(utcStr);
  const tzName = tz ?? "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tzName, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hour12: false,
  }).formatToParts(d);
  const p: Record<string,string> = {};
  parts.forEach(x => { p[x.type]=x.value; });
  const h = p.hour==="24" ? "00" : p.hour;
  return { dateISO: `${p.year}-${p.month}-${p.day}`, minutes: Number(h)*60 + Number(p.minute) };
}

/** Duration in minutes — same fallback chain as old app. */
export function calApptDuration(appt: AppointmentDetailResponse): number {
  if (appt.start_time_local && appt.end_time_local) {
    const mins = (Number(appt.end_time_local.slice(11,13))*60 + Number(appt.end_time_local.slice(14,16)))
               - (Number(appt.start_time_local.slice(11,13))*60 + Number(appt.start_time_local.slice(14,16)));
    if (mins > 0) return mins;
  }
  if (appt.start_time && appt.end_time) {
    const mins = Math.round((new Date(appt.end_time).getTime() - new Date(appt.start_time).getTime()) / 60000);
    if (mins > 0) return mins;
  }
  return 30;
}

/**
 * Group a single column's appointments into "visits" — runs of appointments
 * that were booked together (same `booking_group_id`), are performed by the same
 * employee, and are contiguous in time (each starts where the previous ends).
 * Each run is returned in start order; runs of one are ordinary appointments.
 * Callers (DayView / WeekView) already pass a single employee's list, but the
 * employee check keeps the helper correct regardless of caller.
 */
export function calGroupVisits(appts: AppointmentDetailResponse[], tz?: string): AppointmentDetailResponse[][] {
  const sorted = [...appts].sort(
    (a, b) => (calApptLocalParts(a, tz)?.minutes ?? 0) - (calApptLocalParts(b, tz)?.minutes ?? 0)
  );
  const runs: AppointmentDetailResponse[][] = [];
  for (const a of sorted) {
    const run = runs[runs.length - 1];
    if (run) {
      const prev = run[run.length - 1];
      const pp = calApptLocalParts(prev, tz);
      const ap = calApptLocalParts(a, tz);
      const sameGroup = !!a.booking_group_id && a.booking_group_id === prev.booking_group_id;
      const sameEmp = Number(a.employee_id) === Number(prev.employee_id);
      const contiguous = !!pp && !!ap && Math.abs(ap.minutes - (pp.minutes + calApptDuration(prev))) <= 1;
      if (sameGroup && sameEmp && contiguous) { run.push(a); continue; }
    }
    runs.push([a]);
  }
  return runs;
}

/** Short time string from start_time_local. */
export function calApptShortTime(appt: AppointmentDetailResponse, which: "start"|"end", tz?: string): string {
  const localKey = which==="end" ? "end_time_local" : "start_time_local";
  const utcKey   = which==="end" ? "end_time"       : "start_time";
  const localStr = appt[localKey];
  if (localStr && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(localStr)) {
    const hh = Number(localStr.slice(11,13));
    const mm = localStr.slice(14,16);
    const ampm = hh>=12 ? "PM" : "AM";
    const h12 = ((hh+11)%12)+1;
    return `${h12}:${mm} ${ampm}`;
  }
  const utc = appt[utcKey];
  if (!utc) return "";
  return new Date(utc).toLocaleTimeString("en-US", { timeZone: tz??"UTC", hour:"numeric", minute:"2-digit" });
}

// ── Service colour ────────────────────────────────────────────────────────────

const CAL_AVATAR_PALETTE = ["#3ba7c9","#3bc88f","#e85a8c","#d83d7a","#e89e3a","#e87e3a","#9573d8","#7ec23a"];
const CAL_COLOR_COUNT = 8;

function calHashIdx(value: string | number | null | undefined, n: number): number {
  if (value==null) return 0;
  const s = String(value);
  let h = 0;
  for (let i=0; i<s.length; i++) h = ((h<<5)-h+s.charCodeAt(i))|0;
  return Math.abs(h)%n;
}

export function calEmpColor(empId: number): string {
  return CAL_AVATAR_PALETTE[Math.abs(empId)%CAL_AVATAR_PALETTE.length];
}

export function calServiceColorClass(appt: AppointmentDetailResponse): string {
  const key = appt.service_id!=null ? `s${appt.service_id}`
            : appt.customer_id!=null ? `c${appt.customer_id}`
            : appt.employee_id!=null ? `e${appt.employee_id}` : "0";
  return `c${calHashIdx(key, CAL_COLOR_COUNT)}`;
}

/** Returns a 25%-opacity tint of the service color (renders as pastel on white). */
export function calSvcColorStyle(hex: string | null | undefined): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "";
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},0.25)`;
}

// ── Date label formatting ─────────────────────────────────────────────────────

const DOW_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MONTH_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function calFormatDateLabel(d: Date, view: "day"|"week"|"month", todayISO: string): string {
  if (view==="day") {
    const dISO = calToISODate(d);
    if (dISO===todayISO) return `Today · ${d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}`;
    const tom  = calToISODate(calAddDays(calFromISODate(todayISO),1));
    const yest = calToISODate(calAddDays(calFromISODate(todayISO),-1));
    if (dISO===tom)  return `Tomorrow · ${d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;
    if (dISO===yest) return `Yesterday · ${d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`;
    return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});
  }
  if (view==="week") {
    const start = calWeekStart(d);
    const end   = calAddDays(start,6);
    const sameMonth = start.getMonth()===end.getMonth();
    const startStr = start.toLocaleDateString("en-US",sameMonth?{month:"short",day:"numeric"}:{month:"short",day:"numeric"});
    const endStr   = end.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
    return `${startStr} – ${endStr}`;
  }
  return `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export { DOW_SHORT, MONTH_LONG };
