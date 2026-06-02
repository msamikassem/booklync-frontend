/**
 * AuthContext — provides the current user, agents list, and auth actions.
 *
 * Identity is always-fetch: staleTime=0 so React Query always revalidates
 * on mount, matching the old always-fetch getMe() / getAgents() behaviour.
 * Cached data is shown as placeholderData while fresh data loads (no flash).
 */

import { createContext, useContext, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { storage } from "../auth/storage";
import { auth, staff, agents as agentsApi } from "../api";
import type { UserMeResponse, AgentResponse } from "../api/types";

export function isStaffOnlyUser(me: UserMeResponse | null | undefined): boolean {
  if (!me) return false;
  return (
    !me.is_owner &&
    me.employee_id != null &&
    !me.permissions.includes("view_branch_calendar")
  );
}

interface AuthContextValue {
  me: UserMeResponse | null | undefined;
  agents: AgentResponse[];
  isLoading: boolean;
  isStaff: boolean;
  logout: () => Promise<void>;
  refetchMe: () => void;
  refetchAgents: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<UserMeResponse | null> {
  if (!storage.getAccess()) return null;
  try {
    if (storage.isStaff()) {
      const savedId = storage.getActiveAgentId();
      try {
        return await staff.me(savedId);
      } catch (err: unknown) {
        const e = err as { status?: number };
        if (e.status === 403) return staff.me(null);
        throw err;
      }
    }
    return await auth.me();
  } catch {
    const cached = storage.getUser();
    return cached as UserMeResponse | null;
  }
}

async function fetchAgents(): Promise<AgentResponse[]> {
  if (!storage.getAccess()) return [];
  try {
    const data = await agentsApi.list();
    storage.saveAgents(data.agents);
    return data.agents;
  } catch {
    const cached = storage.getAgents();
    return (cached as AgentResponse[] | null) ?? [];
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const {
    data: me,
    isLoading: meLoading,
    refetch: refetchMe,
  } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 0,
    placeholderData: () => storage.getUser() as UserMeResponse | null,
    retry: false,
  });

  const {
    data: agentList,
    isLoading: agentsLoading,
    refetch: refetchAgents,
  } = useQuery({
    queryKey: ["agents"],
    queryFn: fetchAgents,
    staleTime: 0,
    placeholderData: () => (storage.getAgents() as AgentResponse[] | null) ?? [],
    retry: false,
    enabled: !!storage.getAccess(),
  });

  const logout = useCallback(async () => {
    try { await auth.logout(); } catch { /* ignore */ }
    storage.clear();
    queryClient.clear();
    window.location.href = "/login";
  }, [queryClient]);

  const value: AuthContextValue = {
    me: me ?? null,
    agents: agentList ?? [],
    isLoading: meLoading || agentsLoading,
    isStaff: storage.isStaff(),
    logout,
    refetchMe: () => refetchMe(),
    refetchAgents: () => refetchAgents(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
