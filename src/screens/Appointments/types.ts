import type { components } from "../../api/schema";

export type AppointmentDetailResponse = components["schemas"]["AppointmentDetailResponse"];
export type AppointmentStatus = components["schemas"]["AppointmentStatusEnum"];

export interface ApptEmployee { id: number; name: string; }
export interface ApptCustomer { id: number; name: string; phone: string; }

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", cancelled: "Cancelled",
  completed: "Completed", no_show: "No-show",
};
export const SOURCE_LABELS: Record<string, string> = {
  ai: "AI", sms: "SMS", dashboard: "Dashboard",
  booking_page: "Booking", manual: "Manual",
};
export const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-700",
  cancelled: "bg-gray-100 text-gray-500",
  completed: "bg-green-100 text-green-800",
  no_show:   "bg-red-100 text-red-700",
};

// Re-export shared type
export type { ApiError } from "../../api/types";
