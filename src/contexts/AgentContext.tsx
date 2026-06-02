/**
 * AgentContext — the active branch (agent_id), persisted to localStorage.
 *
 * On boot: read from localStorage → validate against the loaded agents list →
 * fall back to the first agent if the saved one is no longer accessible.
 * Every query that needs ?agent_id= reads activeAgentId from this context.
 */

import { createContext, useContext, useState, useEffect } from "react";
import { storage } from "../auth/storage";
import type { AgentResponse } from "../api/types";

interface AgentContextValue {
  activeAgent: AgentResponse | null;
  activeAgentId: number | null;
  setActiveAgent: (agent: AgentResponse) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({
  agents,
  children,
}: {
  agents: AgentResponse[];
  children: React.ReactNode;
}) {
  const [activeAgent, setActiveAgentState] = useState<AgentResponse | null>(() => {
    const savedId = storage.getActiveAgentId();
    if (savedId && agents.length) {
      const found = agents.find((a) => String(a.id) === savedId);
      return found ?? agents[0] ?? null;
    }
    return agents[0] ?? null;
  });

  // Re-resolve when agents list changes (e.g. after login / branch added)
  useEffect(() => {
    if (!agents.length) return;
    const savedId = storage.getActiveAgentId();
    if (savedId) {
      const found = agents.find((a) => String(a.id) === savedId);
      setActiveAgentState(found ?? agents[0]);
    } else {
      setActiveAgentState(agents[0]);
    }
  }, [agents]);

  function setActiveAgent(agent: AgentResponse) {
    storage.setActiveAgentId(agent.id);
    setActiveAgentState(agent);
  }

  return (
    <AgentContext.Provider
      value={{
        activeAgent,
        activeAgentId: activeAgent?.id ?? null,
        setActiveAgent,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used within AgentProvider");
  return ctx;
}
