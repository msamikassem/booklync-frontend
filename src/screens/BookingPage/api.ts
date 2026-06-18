import { apiFetch } from "../../auth/client";
import type { components } from "../../api/schema";
import type { AgentResponse, AgentUpdate } from "../../api/types";

export type CustomDomain = components["schemas"]["CustomDomainResponse"];

async function unwrap<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(fallback), { data, status: res.status });
  }
  return res.json();
}

export const bookingPageApi = {
  connectDomain: (agentId: number, domain: string) =>
    apiFetch(`/agents/${agentId}/custom-domain`, { method: "POST", body: JSON.stringify({ domain }) })
      .then(r => unwrap<CustomDomain>(r, "Could not connect the domain.")),

  verifyDomain: (agentId: number, force = false) =>
    apiFetch(`/agents/${agentId}/custom-domain/verify${force ? "?force=true" : ""}`, { method: "POST" })
      .then(r => unwrap<CustomDomain>(r, "Could not verify the domain.")),

  removeDomain: (agentId: number) =>
    apiFetch(`/agents/${agentId}/custom-domain`, { method: "DELETE" })
      .then(r => unwrap<{ message: string }>(r, "Could not remove the domain.")),

  updateAgent: (agentId: number, body: AgentUpdate) =>
    apiFetch(`/agents/${agentId}`, { method: "PUT", body: JSON.stringify(body) })
      .then(r => unwrap<AgentResponse>(r, "Could not save the setting.")),
};
