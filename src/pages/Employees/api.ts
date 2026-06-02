import { apiFetch, API_BASE } from "../../auth/client";
import { storage } from "../../auth/storage";
import type {
  EmployeeResponse, WorkingHour, BlockedTime, PersonalDayOff, CapabilityResponse,
} from "./types";

const e = (id: number, agentId: number) => `/employees/${id}?agent_id=${agentId}`;

export const employeesApi = {
  async list(agentId: number): Promise<EmployeeResponse[]> {
    const res = await apiFetch(`/employees/?agent_id=${agentId}`);
    if (!res.ok) throw new Error("Failed to load employees");
    const d = await res.json();
    return d.employees ?? [];
  },

  async create(body: Record<string, unknown>): Promise<EmployeeResponse> {
    const res = await apiFetch("/employees/", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Create failed"), { data: d }); }
    return res.json();
  },

  async update(id: number, agentId: number, body: Record<string, unknown>): Promise<EmployeeResponse> {
    const res = await apiFetch(`${e(id, agentId)}`, { method: "PUT", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Update failed"), { data: d }); }
    return res.json();
  },

  async delete(id: number, agentId: number): Promise<void> {
    const res = await apiFetch(`${e(id, agentId)}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Delete failed"), { data: d }); }
  },

  async activate(id: number, agentId: number): Promise<EmployeeResponse> {
    const res = await apiFetch(`/employees/${id}/activate?agent_id=${agentId}`, { method: "PATCH" });
    if (!res.ok) throw new Error("Failed");
    return res.json();
  },

  async deactivate(id: number, agentId: number): Promise<EmployeeResponse> {
    const res = await apiFetch(`/employees/${id}/deactivate?agent_id=${agentId}`, { method: "PATCH" });
    if (!res.ok) throw new Error("Failed");
    return res.json();
  },

  // ── Branch assignment ───────────────────────────────────────────────────────

  async assignBranch(id: number, body: { agent_id: number; can_receive_bookings?: boolean }): Promise<EmployeeResponse> {
    const res = await apiFetch(`/employees/${id}/branches`, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Assign failed"), { data: d }); }
    return res.json();
  },

  async unassignBranch(id: number, agentId: number): Promise<void> {
    const res = await apiFetch(`/employees/${id}/branches/${agentId}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Unassign failed"), { data: d }); }
  },

  // ── Working hours ───────────────────────────────────────────────────────────

  async getHours(id: number, agentId: number): Promise<WorkingHour[]> {
    const res = await apiFetch(`/employees/${id}/working-hours?agent_id=${agentId}`);
    if (!res.ok) throw new Error("Failed to load hours");
    const d = await res.json();
    return d.working_hours ?? [];
  },

  async setHours(id: number, agentId: number, working_hours: { day_of_week: number; start_time: string; end_time: string }[]): Promise<WorkingHour[]> {
    const res = await apiFetch(`/employees/${id}/working-hours?agent_id=${agentId}`, {
      method: "POST", body: JSON.stringify({ working_hours }),
    });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Save failed"), { data: d }); }
    const d = await res.json();
    return d.working_hours ?? [];
  },

  // ── Blocked times (breaks) ──────────────────────────────────────────────────

  async getBlockedTimes(id: number, agentId: number): Promise<BlockedTime[]> {
    const res = await apiFetch(`/employees/${id}/blocked-times?agent_id=${agentId}`);
    if (!res.ok) throw new Error("Failed to load breaks");
    const d = await res.json();
    return d.blocked_times ?? [];
  },

  async addBlockedTime(id: number, agentId: number, body: { day_of_week: number; start_time: string; end_time: string; reason?: string }): Promise<BlockedTime> {
    const res = await apiFetch(`/employees/${id}/blocked-times?agent_id=${agentId}`, {
      method: "POST", body: JSON.stringify(body),
    });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Add failed"), { data: d }); }
    return res.json();
  },

  async deleteBlockedTime(id: number, agentId: number, btId: number): Promise<void> {
    await apiFetch(`/employees/${id}/blocked-times/${btId}?agent_id=${agentId}`, { method: "DELETE" });
  },

  // ── Personal days off ───────────────────────────────────────────────────────

  async getDaysOff(id: number, agentId: number): Promise<PersonalDayOff[]> {
    const res = await apiFetch(`/employees/${id}/days-off?agent_id=${agentId}`);
    if (!res.ok) throw new Error("Failed to load days off");
    const d = await res.json();
    return d.days_off ?? [];
  },

  async addDayOff(id: number, agentId: number, body: { name: string; start_date: string; end_date: string }): Promise<PersonalDayOff> {
    const res = await apiFetch(`/employees/${id}/days-off?agent_id=${agentId}`, {
      method: "POST", body: JSON.stringify(body),
    });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Add failed"), { data: d }); }
    return res.json();
  },

  async deleteDayOff(id: number, agentId: number, dId: number): Promise<void> {
    await apiFetch(`/employees/${id}/days-off/${dId}?agent_id=${agentId}`, { method: "DELETE" });
  },

  // ── Capabilities ────────────────────────────────────────────────────────────

  async getCapabilities(id: number, agentId: number): Promise<CapabilityResponse[]> {
    const res = await apiFetch(`/employees/${id}/capabilities?agent_id=${agentId}`);
    if (!res.ok) throw new Error("Failed to load capabilities");
    return res.json();
  },

  async addCapability(id: number, agentId: number, body: { title_id?: number; service_id?: number; variation_id?: number; extra_price?: number }): Promise<CapabilityResponse> {
    const res = await apiFetch(`/employees/${id}/capabilities?agent_id=${agentId}`, {
      method: "POST", body: JSON.stringify(body),
    });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Add failed"), { data: d }); }
    return res.json();
  },

  async removeCapability(id: number, agentId: number, capId: number): Promise<void> {
    await apiFetch(`/employees/${id}/capabilities/${capId}?agent_id=${agentId}`, { method: "DELETE" });
  },

  // ── Profile picture ─────────────────────────────────────────────────────────

  async uploadPicture(id: number, agentId: number, file: File): Promise<EmployeeResponse> {
    const form = new FormData();
    form.append("file", file);
    const doUpload = (token: string | null) =>
      fetch(`${API_BASE}/employees/${id}/profile-picture?agent_id=${agentId}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
    let res = await doUpload(storage.getAccess());
    if (res.status === 401) {
      const newToken = storage.getAccess();
      res = await doUpload(newToken);
    }
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },

  async deletePicture(id: number, agentId: number): Promise<void> {
    await apiFetch(`/employees/${id}/profile-picture?agent_id=${agentId}`, { method: "DELETE" });
  },

  // ── Dashboard access ────────────────────────────────────────────────────────

  async invite(id: number, body: { role: string; agent_ids?: number[]; email?: string }): Promise<void> {
    const res = await apiFetch(`/employees/${id}/invite`, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Invite failed"), { data: d }); }
  },

  async cancelInvite(id: number): Promise<void> {
    const res = await apiFetch(`/employees/${id}/invite`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Cancel failed"), { data: d }); }
  },

  async revokeAccount(id: number): Promise<void> {
    const res = await apiFetch(`/employees/${id}/account`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Revoke failed"), { data: d }); }
  },

  async assignBranchRole(userId: number, body: { agent_id: number; role: string }): Promise<void> {
    const res = await apiFetch(`/users/${userId}/branch-roles`, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Assign failed"), { data: d }); }
  },

  async revokeBranchRole(userId: number, agentId: number): Promise<void> {
    const res = await apiFetch(`/users/${userId}/branch-roles/${agentId}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); throw Object.assign(new Error("Revoke failed"), { data: d }); }
  },
};
