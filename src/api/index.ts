/**
 * api.* — the typed surface over the backend.
 * Every call goes through apiFetch (auth header + 401→refresh→retry).
 */

import { apiFetch, API_BASE } from "../auth/client";
import type {
  UserMeResponse,
  AgentListResponse,
  AgentResponse,
  CustomerResponse,
  CustomerListResponse,
  CustomerCreate,
  CustomerUpdate,
  AppointmentDetailResponse,
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
