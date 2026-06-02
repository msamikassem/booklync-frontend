/**
 * api.* — the typed surface over the backend.
 * Every call goes through apiFetch (auth header + 401→refresh→retry).
 */

import { apiFetch, API_BASE } from "../auth/client";
import type {
  UserMeResponse,
  AgentListResponse,
  AgentResponse,
  AgentUpdate,
  CustomerResponse,
  CustomerListResponse,
  CustomerCreate,
  CustomerUpdate,
  AppointmentDetailResponse,
  ServiceCatalogueResponse,
  ServiceResponse,
  ServiceVariationResponse,
  ServiceTitleResponse,
  ServiceCreate,
  BusinessHourResponse,
  BusinessHourCreate,
} from "./types";

// ── Auth ──────────────────────────────────────────────────────────

export const auth = {
  async register(body: Record<string, unknown>) {
    return fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  async login(email: string, password: string) {
    return fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  },

  async me(): Promise<UserMeResponse> {
    const res = await apiFetch("/auth/me");
    if (!res.ok) throw new Error("Failed to load user");
    return res.json();
  },

  async logout() {
    return apiFetch("/auth/logout", { method: "POST" });
  },
};

// ── Staff ─────────────────────────────────────────────────────────

export const staff = {
  async me(agentId?: string | null): Promise<UserMeResponse> {
    const qs = agentId ? `?agent_id=${agentId}` : "";
    const res = await apiFetch(`/staff/me${qs}`);
    if (!res.ok) throw Object.assign(new Error("Staff me failed"), { status: res.status });
    return res.json();
  },
};

// ── Agents ────────────────────────────────────────────────────────

export const agents = {
  async list(): Promise<AgentListResponse> {
    const res = await apiFetch("/agents/");
    if (!res.ok) throw new Error("Failed to load branches");
    return res.json();
  },

  async get(agentId: number): Promise<AgentResponse> {
    const res = await apiFetch(`/agents/${agentId}`);
    if (!res.ok) throw new Error("Failed to load branch");
    return res.json();
  },

  async create(body: Omit<AgentUpdate, "currency" | "tax_rate" | "tax_inclusive"> & { agent_name: string; phone_number: string; location_name: string; timezone: string; model: string }): Promise<AgentResponse> {
    const res = await apiFetch("/agents/", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Create failed"), { data: d }); }
    return res.json();
  },

  async update(id: number, body: AgentUpdate): Promise<AgentResponse> {
    const res = await apiFetch(`/agents/${id}`, { method: "PUT", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Update failed"), { data: d }); }
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`/agents/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Delete failed"), { data: d }); }
  },
};

// ── Business Hours ─────────────────────────────────────────────────────────────

export const businessHours = {
  async list(agentId: number): Promise<BusinessHourResponse[]> {
    const res = await apiFetch(`/business-hours/?agent_id=${agentId}`);
    if (!res.ok) throw new Error("Failed to load hours");
    const d = await res.json();
    return d.business_hours ?? [];
  },

  async set(agentId: number, hours: BusinessHourCreate[]): Promise<BusinessHourResponse[]> {
    const res = await apiFetch("/business-hours/", {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId, business_hours: hours }),
    });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Save failed"), { data: d }); }
    const d = await res.json();
    return d.business_hours ?? [];
  },
};

// ── Days Off (branch closures) ────────────────────────────────────────────────

export interface DayOff { id: number; agent_id: number; employee_id: number | null; name: string; start_date: string; end_date: string; }

export const daysOff = {
  async list(agentId: number): Promise<DayOff[]> {
    const res = await apiFetch(`/days-off/?agent_id=${agentId}`);
    if (!res.ok) throw new Error("Failed to load days off");
    const d = await res.json();
    return (d.days_off ?? []).filter((x: DayOff) => x.employee_id == null);
  },

  async create(agentId: number, body: { name: string; start_date: string; end_date: string }): Promise<DayOff> {
    const res = await apiFetch("/days-off/", {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId, ...body }),
    });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Create failed"), { data: d }); }
    return res.json();
  },

  async delete(id: number, agentId: number): Promise<void> {
    const res = await apiFetch(`/days-off/${id}?agent_id=${agentId}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Delete failed"), { data: d }); }
  },
};

// ── Customers ─────────────────────────────────────────────────────

export const customers = {
  async list(params?: { search?: string }): Promise<CustomerListResponse> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    const res = await apiFetch(`/customers/?${qs}`);
    if (!res.ok) throw new Error("Failed to load customers");
    return res.json();
  },

  async get(id: number): Promise<CustomerResponse> {
    const res = await apiFetch(`/customers/${id}`);
    if (!res.ok) throw new Error("Failed to load customer");
    return res.json();
  },

  async create(body: CustomerCreate): Promise<CustomerResponse> {
    const res = await apiFetch("/customers/", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      throw Object.assign(new Error("Create failed"), { data });
    }
    return res.json();
  },

  async update(id: number, body: CustomerUpdate): Promise<CustomerResponse> {
    const res = await apiFetch(`/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      throw Object.assign(new Error("Update failed"), { data });
    }
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`/customers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      throw Object.assign(new Error("Delete failed"), { data });
    }
  },

  async getAppointments(id: number): Promise<AppointmentDetailResponse[]> {
    const res = await apiFetch(`/customers/${id}/appointments`);
    if (!res.ok) throw new Error("Failed to load appointment history");
    const data = await res.json();
    return data.appointments ?? [];
  },
};

// ── Services ──────────────────────────────────────────────────────────────────

export const services = {
  async catalogue(agentId: number): Promise<ServiceCatalogueResponse> {
    const res = await apiFetch(`/services/catalogue?agent_id=${agentId}`);
    if (!res.ok) throw new Error("Failed to load catalogue");
    return res.json();
  },

  async create(body: ServiceCreate): Promise<ServiceResponse> {
    const res = await apiFetch("/services/", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Create failed"), { data: d }); }
    return res.json();
  },

  async update(id: number, agentId: number, body: Record<string, unknown>): Promise<ServiceResponse> {
    const res = await apiFetch(`/services/${id}?agent_id=${agentId}`, { method: "PUT", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Update failed"), { data: d }); }
    return res.json();
  },

  async delete(id: number, agentId: number): Promise<void> {
    const res = await apiFetch(`/services/${id}?agent_id=${agentId}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Delete failed"), { data: d }); }
  },

  async activate(id: number, agentId: number): Promise<ServiceResponse> {
    const res = await apiFetch(`/services/${id}/activate?agent_id=${agentId}`, { method: "PATCH" });
    if (!res.ok) throw new Error("Failed");
    return res.json();
  },

  async deactivate(id: number, agentId: number): Promise<ServiceResponse> {
    const res = await apiFetch(`/services/${id}/deactivate?agent_id=${agentId}`, { method: "PATCH" });
    if (!res.ok) throw new Error("Failed");
    return res.json();
  },

  async addVariation(svcId: number, agentId: number, body: { name: string; price: number; duration_minutes: number }): Promise<ServiceVariationResponse> {
    const res = await apiFetch(`/services/${svcId}/variations/?agent_id=${agentId}`, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Add variation failed"), { data: d }); }
    return res.json();
  },

  async updateVariation(svcId: number, varId: number, agentId: number, body: Record<string, unknown>): Promise<ServiceVariationResponse> {
    const res = await apiFetch(`/services/${svcId}/variations/${varId}?agent_id=${agentId}`, { method: "PUT", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Update variation failed"), { data: d }); }
    return res.json();
  },

  async deleteVariation(svcId: number, varId: number, agentId: number): Promise<void> {
    const res = await apiFetch(`/services/${svcId}/variations/${varId}?agent_id=${agentId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete variation failed");
  },

  async activateVariation(svcId: number, varId: number, agentId: number): Promise<ServiceVariationResponse> {
    const res = await apiFetch(`/services/${svcId}/variations/${varId}/activate?agent_id=${agentId}`, { method: "PATCH" });
    if (!res.ok) throw new Error("Failed");
    return res.json();
  },

  async deactivateVariation(svcId: number, varId: number, agentId: number): Promise<ServiceVariationResponse> {
    const res = await apiFetch(`/services/${svcId}/variations/${varId}/deactivate?agent_id=${agentId}`, { method: "PATCH" });
    if (!res.ok) throw new Error("Failed");
    return res.json();
  },
};

// ── Titles ────────────────────────────────────────────────────────────────────

export const titles = {
  async create(body: { agent_id: number; name: string }): Promise<ServiceTitleResponse> {
    const res = await apiFetch("/services/titles/", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Create failed"), { data: d }); }
    return res.json();
  },

  async update(id: number, agentId: number, body: { name?: string; sort_order?: number }): Promise<ServiceTitleResponse> {
    const res = await apiFetch(`/services/titles/${id}?agent_id=${agentId}`, { method: "PUT", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Update failed"), { data: d }); }
    return res.json();
  },

  async delete(id: number, agentId: number): Promise<void> {
    const res = await apiFetch(`/services/titles/${id}?agent_id=${agentId}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Delete failed"), { data: d }); }
  },
};
