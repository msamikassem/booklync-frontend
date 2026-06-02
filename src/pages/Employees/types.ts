import type { components } from "../../api/schema";

export type EmployeeResponse = components["schemas"]["EmployeeResponse"];
export type EmployeeBranchSummary = components["schemas"]["EmployeeBranchSummary"];
export type DashboardAccessSummary = components["schemas"]["DashboardAccessSummary"];
export type DashboardAccessBranch = components["schemas"]["DashboardAccessBranch"];
export type CapabilityResponse = components["schemas"]["CapabilityResponse"];

export interface WorkingHour {
  id: number;
  employee_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface BlockedTime {
  id: number;
  employee_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  reason?: string | null;
}

export interface PersonalDayOff {
  id: number;
  employee_id: number | null;
  agent_id: number;
  name: string;
  start_date: string;
  end_date: string;
}

/** Grouped break row (multiple days sharing same time+reason). */
export interface BreakGroup {
  days: number[];
  ids: number[];
  start: string;
  end: string;
  reason: string;
}

export type AccessStatus = "none" | "invite_pending" | "invite_expired" | "active";

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const BREAK_DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
export const INACTIVE_STATUSES = new Set(["cancelled", "no_show", "completed"]);

// Re-export shared error type
export type { ApiError } from "../../api/types";
