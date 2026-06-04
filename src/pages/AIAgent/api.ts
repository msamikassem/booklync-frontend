import { apiFetch } from "../../auth/client";

export interface NotifTemplate { key: string; preview: string; }
export interface NotifRule { type: string; name: string; minutes_before: number; template_key: string; enabled: boolean; }

export const automationsApi = {
  templates: () => apiFetch("/notifications/templates").then(async r => r.ok ? ((await r.json()).templates as NotifTemplate[] ?? []) : []),
  rules: () => apiFetch("/notifications/rules").then(async r => r.ok ? ((await r.json()).rules as NotifRule[] ?? []) : []),
};
