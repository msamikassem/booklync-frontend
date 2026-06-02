import { apiFetch } from "../../auth/client";
import type { AgentTimeRef } from "./utils";
import type { AppointmentDetailResponse } from "./types";
import type { BusinessHourResponse } from "../../api/types";

export interface CalWorkingHour { id: number; employee_id: number; day_of_week: number; start_time: string; end_time: string; }
export interface CalBreak       { id: number; employee_id: number; day_of_week: number; start_time: string; end_time: string; reason?: string | null; }
export interface CalDayOff      { id: number; employee_id: number | null; agent_id: number; name: string; start_date: string; end_date: string; }
export interface CalEmployee    { id: number; name: string; profile_picture_url?: string | null; active: boolean; branches?: { agent_id: number; active: boolean }[]; }

export const calApi = {
  async agentTime(agentId: number): Promise<AgentTimeRef | null> {
    const res = await apiFetch(`/availability/time?agent_id=${agentId}`);
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

  async employees(agentId: number): Promise<CalEmployee[]> {
    const res = await apiFetch(`/employees/?agent_id=${agentId}&bookable_only=true`);
    if (!res.ok) return [];
    const d = await res.json();
    return (d.employees ?? []).map((e: CalEmployee) => ({
      id: e.id, name: e.name, profile_picture_url: e.profile_picture_url,
      active: (e.branches ?? []).find((b: { agent_id: number; active: boolean }) => b.agent_id === agentId)?.active ?? true,
      branches: e.branches,
    }));
  },

  async appointments(agentId: number, dateFrom: string, dateTo: string): Promise<AppointmentDetailResponse[]> {
    const res = await apiFetch(`/appointments/?agent_id=${agentId}&date_from=${dateFrom}&date_to=${dateTo}`);
    if (!res.ok) return [];
    const d = await res.json();
    return d.appointments ?? [];
  },

  async hours(empId: number, agentId: number): Promise<CalWorkingHour[]> {
    const res = await apiFetch(`/employees/${empId}/working-hours?agent_id=${agentId}`);
    if (!res.ok) return [];
    return (await res.json()).working_hours ?? [];
  },

  async breaks(empId: number, agentId: number): Promise<CalBreak[]> {
    const res = await apiFetch(`/employees/${empId}/blocked-times?agent_id=${agentId}`);
    if (!res.ok) return [];
    return (await res.json()).blocked_times ?? [];
  },

  async daysOff(empId: number, agentId: number): Promise<CalDayOff[]> {
    const res = await apiFetch(`/employees/${empId}/days-off?agent_id=${agentId}`);
    if (!res.ok) return [];
    return (await res.json()).days_off ?? [];
  },

  async businessHours(agentId: number): Promise<BusinessHourResponse[]> {
    const res = await apiFetch(`/business-hours/?agent_id=${agentId}`);
    if (!res.ok) return [];
    return (await res.json()).business_hours ?? [];
  },

  async branchDaysOff(agentId: number): Promise<CalDayOff[]> {
    const res = await apiFetch(`/days-off/?agent_id=${agentId}`);
    if (!res.ok) return [];
    return ((await res.json()).days_off ?? []).filter((d: CalDayOff) => d.employee_id == null);
  },
};
