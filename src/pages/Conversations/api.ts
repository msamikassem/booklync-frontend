import { apiFetch } from "../../auth/client";
import type { components } from "../../api/schema";

export type ConversationHistory = components["schemas"]["ConversationHistoryResponse"];

/** A row in the conversation list (the list endpoint returns an unnamed dict). */
export interface ConversationSummary {
  conversation_id: number;
  agent_id: number;
  customer_id: number;
  customer_name?: string | null;
  customer_phone: string;
  channel: string;
  total_messages: number;
  last_message?: string | null;
  created_at: string;
}

/** One stored message: { role, content, ts? }. content is a plain string. */
export interface ConvMessage {
  role: string;
  content?: string | null;
  ts?: string | null;
}

export const conversationsApi = {
  async list(agentId: number): Promise<ConversationSummary[]> {
    const res = await apiFetch(`/chat/conversations/?agent_id=${agentId}`);
    if (!res.ok) throw Object.assign(new Error("Failed to load conversations"), { status: res.status });
    return (await res.json()).conversations ?? [];
  },

  async get(id: number): Promise<ConversationHistory> {
    const res = await apiFetch(`/chat/conversations/${id}`);
    if (!res.ok) throw Object.assign(new Error("Failed to load conversation"), { status: res.status });
    return res.json();
  },

  async clear(id: number): Promise<void> {
    const res = await apiFetch(`/chat/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) throw Object.assign(new Error("Failed to clear conversation"), { status: res.status });
  },
};
