/**
 * The `/staff/*` own-scope surface for the staff calendar.
 *
 * Returns the SAME row shapes (`Cal*`) the dashboard Calendar's view components
 * consume, so the staff page can reuse DayView/WeekView/MonthView verbatim — the
 * only difference is the data comes from the own-scope endpoints (the caller only
 * ever sees their own appointments + schedule).
 */

import { apiFetch } from "../../auth/client";
import type { AgentTimeRef } from "../Calendar/utils";
import type { CalWorkingHour, CalBreak, CalDayOff } from "../Calendar/api";
import type { AppointmentDetailResponse } from "../Calendar/types";
import type { components } from "../../api/schema";

type S = components["schemas"];
export type StaffMe = S["StaffMeResponse"];

const q = (agentId: number | null) => (agentId ? `?agent_id=${agentId}` : "");

export const staffCalApi = {
  async me(agentId?: number | null): Promise<StaffMe> {
    const res = await apiFetch(`/staff/me${q(agentId ?? null)}`);
    if (!res.ok) throw Object.assign(new Error("Failed to load profile"), { status: res.status });
    return res.json();
  },

  async agentTime(agentId: number): Promise<AgentTimeRef | null> {
    const res = await apiFetch(`/staff/time?agent_id=${agentId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const m = (data.current_time || "").match(/[T ](\d{2}):(\d{2}):(\d{2})/);
    if (!m || !data.current_date) return null;
    return {
      agentId, dateISO: data.current_date,
      hours: Number(m[1]), mins: Number(m[2]), secs: Number(m[3]),
      timezone: data.timezone ?? null, fetchedAt: Date.now(),
    };
  },

  async appointments(agentId: number, dateFrom: string, dateTo: string): Promise<AppointmentDetailResponse[]> {
    const res = await apiFetch(`/staff/appointments?agent_id=${agentId}&date_from=${dateFrom}&date_to=${dateTo}`);
    if (!res.ok) return [];
    return (await res.json()).appointments ?? [];
  },

  async workingHours(agentId: number): Promise<CalWorkingHour[]> {
    const res = await apiFetch(`/staff/working-hours?agent_id=${agentId}`);
    if (!res.ok) return [];
    return (await res.json()).working_hours ?? [];
  },

  async blockedTimes(agentId: number): Promise<CalBreak[]> {
    const res = await apiFetch(`/staff/blocked-times?agent_id=${agentId}`);
    if (!res.ok) return [];
    return (await res.json()).blocked_times ?? [];
  },

  /** Branch closures (employee_id == null) + the user's own personal days off. */
  async daysOff(agentId: number): Promise<CalDayOff[]> {
    const res = await apiFetch(`/staff/days-off?agent_id=${agentId}`);
    if (!res.ok) return [];
    return (await res.json()).days_off ?? [];
  },

  async businessHours(agentId: number): Promise<S["BusinessHourResponse"][]> {
    const res = await apiFetch(`/staff/business-hours?agent_id=${agentId}`);
    if (!res.ok) return [];
    return (await res.json()).business_hours ?? [];
  },

  async updateStatus(id: number, status: string): Promise<AppointmentDetailResponse> {
    const res = await apiFetch(`/staff/appointments/${id}/status`, {
      method: "PATCH", body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw Object.assign(new Error("Update failed"), { data: d });
    }
    return res.json();
  },
};
