export type { AppointmentDetailResponse } from "../Appointments/types";
export type { AgentTimeRef } from "./utils";

export interface CalEmployee {
  id: number;
  name: string;
  profile_picture_url?: string | null;
  active: boolean;
}

export interface CalRange {
  startHour: number;
  endHour: number;
  hourCount: number;
  pxPerMin: number;
}

export const ROW_H = 96; // px per hour — MUST match CSS --cal-row-h in Calendar.css
