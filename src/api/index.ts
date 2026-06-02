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
  async list(agentId: number, params?: { search?: string; page?: number; page_size?: number }): Promise<CustomerListResponse> {
    const qs = new URLSearchParams({ agent_id: String(agentId) });
    if (params?.search) qs.set("search", params.search);
    if (params?.page != null) qs.set("page", String(params.page));
    if (params?.page_size != null) qs.set("page_size", String(params.page_size));
    const res = await apiFetch(`/customers/?${qs}`);
    if (!res.ok) throw new Error("Failed to load customers");
    return res.json();
  },

  async get(id: number, agentId: number): Promise<CustomerResponse> {
    const res = await apiFetch(`/customers/${id}?agent_id=${agentId}`);
    if (!res.ok) throw new Error("Failed to load customer");
    return res.json();
  },

  async create(agentId: number, body: CustomerCreate): Promise<CustomerResponse> {
    const res = await apiFetch(`/customers/?agent_id=${agentId}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      throw Object.assign(new Error("Create failed"), { data });
    }
    return res.json();
  },

  async update(id: number, agentId: number, body: CustomerUpdate): Promise<CustomerResponse> {
    const res = await apiFetch(`/customers/${id}?agent_id=${agentId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      throw Object.assign(new Error("Update failed"), { data });
    }
    return res.json();
  },

  async delete(id: number, agentId: number): Promise<void> {
    const res = await apiFetch(`/customers/${id}?agent_id=${agentId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      throw Object.assign(new Error("Delete failed"), { data });
    }
  },
};
