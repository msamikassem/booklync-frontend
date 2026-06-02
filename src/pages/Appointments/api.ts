import { apiFetch } from "../../auth/client";
import type { AppointmentDetailResponse } from "./types";

export const appointmentsApi = {
  async list(params: {
    agent_id: number;
    date_from?: string;
    date_to?: string;
    status?: string;
    employee_id?: string | number;
  }): Promise<AppointmentDetailResponse[]> {
    const qs = new URLSearchParams();
    qs.set("agent_id", String(params.agent_id));
    if (params.date_from) qs.set("date_from", params.date_from);
    if (params.date_to) qs.set("date_to", params.date_to);
    if (params.status) qs.set("status", params.status);
    if (params.employee_id) qs.set("employee_id", String(params.employee_id));
    const res = await apiFetch(`/appointments/?${qs}`);
    if (!res.ok) throw new Error("Failed to load appointments");
    const d = await res.json();
    return d.appointments ?? [];
  },

  async create(body: Record<string, unknown>): Promise<AppointmentDetailResponse> {
    const res = await apiFetch("/appointments/", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) {
      const d = await res.json();
      throw Object.assign(new Error("Create failed"), { data: d });
    }
    return res.json();
  },

  async updateStatus(id: number, status: string): Promise<AppointmentDetailResponse> {
    const res = await apiFetch(`/appointments/${id}/status`, {
      method: "PATCH", body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw Object.assign(new Error("Update failed"), { data: d });
    }
    return res.json();
  },
};
