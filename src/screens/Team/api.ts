import { apiFetch } from "../../auth/client";
import type { components } from "../../api/schema";

export type TeamUser = components["schemas"]["UserSummary"];
export type RoleInfo = components["schemas"]["RoleInfo"];
export type BranchRole = components["schemas"]["BranchRoleInfo"];

async function unwrap<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(fallback), { data, status: res.status });
  }
  return res.json();
}

export const teamApi = {
  list: () => apiFetch("/users/").then(r => unwrap<{ users: TeamUser[] }>(r, "Failed to load users")).then(d => d.users ?? []),
  roles: () => apiFetch("/users/roles").then(r => unwrap<{ roles: RoleInfo[] }>(r, "Failed to load roles")).then(d => d.roles ?? []),

  setActive: (id: number, active: boolean) =>
    apiFetch(`/users/${id}/${active ? "activate" : "deactivate"}`, { method: "PATCH" })
      .then(r => unwrap<TeamUser>(r, "Could not update the user.")),

  /** Upserts: assigns OR changes the user's role at that branch. */
  assignRole: (id: number, agent_id: number, role: string) =>
    apiFetch(`/users/${id}/branch-roles`, { method: "POST", body: JSON.stringify({ agent_id, role }) })
      .then(r => unwrap<TeamUser>(r, "Could not update branch access.")),

  revokeRole: (id: number, agentId: number) =>
    apiFetch(`/users/${id}/branch-roles/${agentId}`, { method: "DELETE" })
      .then(r => unwrap<{ message: string }>(r, "Could not revoke access.")),
};
