/**
 * Token storage — mirrors auth.js storage helper exactly.
 *
 * Active token wins: reads across both stores so a stale value in one store
 * can't shadow the other. `save()` clears both stores first.
 * `active_agent_id` is localStorage-only (persists across tabs).
 */

const KEYS = [
  "access_token",
  "refresh_token",
  "user_profile",
  "user_profile_ts",
  "agents_list",
  "agents_list_ts",
  "active_agent_id",
  "account_type",
] as const;

type AccountType = "business" | "staff";

export interface StoredTokens {
  access_token: string;
  refresh_token?: string;
}

export const storage = {
  save(tokens: StoredTokens, remember: boolean, accountType: AccountType = "business") {
    this.clear();
    const store = remember ? localStorage : sessionStorage;
    store.setItem("access_token", tokens.access_token);
    if (tokens.refresh_token) store.setItem("refresh_token", tokens.refresh_token);
    store.setItem("account_type", accountType);
  },

  isStaff(): boolean {
    const acc = localStorage.getItem("access_token")
      ? localStorage.getItem("account_type")
      : sessionStorage.getItem("account_type");
    return acc === "staff";
  },

  getAccess(): string | null {
    return localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
  },

  getRefresh(): string | null {
    return localStorage.getItem("refresh_token") || sessionStorage.getItem("refresh_token");
  },

  /** Which store currently holds the active token. */
  _activeStore(): Storage {
    return localStorage.getItem("access_token") ? localStorage : sessionStorage;
  },

  saveUser(user: unknown) {
    const store = this._activeStore();
    store.setItem("user_profile", JSON.stringify(user));
    store.setItem("user_profile_ts", String(Date.now()));
  },

  getUser(): unknown | null {
    const raw = localStorage.getItem("user_profile") || sessionStorage.getItem("user_profile");
    const ts = localStorage.getItem("user_profile_ts") || sessionStorage.getItem("user_profile_ts");
    const TTL = 5 * 60 * 1000;
    if (!raw || !ts || Date.now() - Number(ts) > TTL) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  saveAgents(agents: unknown[]) {
    const store = this._activeStore();
    store.setItem("agents_list", JSON.stringify(agents));
    store.setItem("agents_list_ts", String(Date.now()));
  },

  getAgents(): unknown[] | null {
    const raw = localStorage.getItem("agents_list") || sessionStorage.getItem("agents_list");
    const ts = localStorage.getItem("agents_list_ts") || sessionStorage.getItem("agents_list_ts");
    const TTL = 10 * 60 * 1000;
    if (!raw || !ts || Date.now() - Number(ts) > TTL) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  getActiveAgentId(): string | null {
    return localStorage.getItem("active_agent_id");
  },

  setActiveAgentId(id: string | number) {
    localStorage.setItem("active_agent_id", String(id));
  },

  updateAccessToken(token: string) {
    this._activeStore().setItem("access_token", token);
  },

  clear() {
    KEYS.forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
  },
};
