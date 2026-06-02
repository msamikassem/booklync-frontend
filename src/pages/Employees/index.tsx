/**
 * Employees page — branch-scoped list with search.
 * Every card handles its own edit/schedule/services/access state.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { employeesApi } from "./api";
import { EmployeeCard } from "./EmployeeCard";
import { AddEmployeeForm } from "./AddEmployeeForm";
import { useAuth } from "../../contexts/AuthContext";
import { useAgent } from "../../contexts/AgentContext";

export default function Employees() {
  const { me, agents } = useAuth();
  const { activeAgentId } = useAgent();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Permission helpers
  const can = (...perms: string[]) => me?.is_owner || perms.some(p => me?.permissions.includes(p));
  const canAtBranch = (perm: string, id: number) => {
    if (me?.is_owner) return true;
    if (!me) return false;
    const accessible = me.branches.some(b => b.agent_id === id);
    return accessible && me.permissions.includes(perm);
  };

  const canManageEmployees = can("manage_employees");
  const canEditDetails     = can("edit_employee_details");
  const canToggleStatus    = can("toggle_employee_status");
  const canInviteUsers     = can("invite_users");
  const canManageUsers     = can("manage_users");
  const canManageSchedules = can("manage_schedules");

  const { data: employees = [], isLoading, isError } = useQuery({
    queryKey: ["employees", activeAgentId],
    queryFn: () => employeesApi.list(activeAgentId!),
    enabled: activeAgentId != null,
    staleTime: 5 * 60 * 1000,
  });

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }
  function reload() { qc.invalidateQueries({ queryKey: ["employees", activeAgentId] }); }

  const visible = search.trim()
    ? employees.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.role || "").toLowerCase().includes(search.toLowerCase()))
    : employees;

  const currentIds = new Set(employees.map(e => e.id));

  if (!activeAgentId) return <p className="text-sm text-muted">No branch selected.</p>;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="w-full h-9 pl-9 pr-3 border border-hairline rounded-md text-sm bg-canvas focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
        </div>
        {canManageEmployees && (
          <button onClick={() => setShowAdd(s => !s)}
            className="h-9 px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md transition-colors flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add employee
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-5">
          <AddEmployeeForm
            agentId={activeAgentId}
            agents={agents}
            currentAgentEmployeeIds={currentIds}
            onSaved={() => { setShowAdd(false); reload(); showToast("Employee added."); }}
            onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {/* States */}
      {isLoading && <p className="text-sm text-muted py-8 text-center">Loading employees…</p>}
      {isError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">Could not load employees.</div>}

      {!isLoading && !isError && employees.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center max-w-lg">
          <p className="font-semibold text-ink mb-1">No employees yet</p>
          <p className="text-sm text-muted">Add your first employee to this branch.</p>
        </div>
      )}

      {!isLoading && !isError && employees.length > 0 && visible.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center max-w-lg">
          <p className="font-semibold text-ink mb-1">No results</p>
          <p className="text-sm text-muted">No employees match &ldquo;<strong>{search}</strong>&rdquo;.</p>
        </div>
      )}

      {/* Employee cards */}
      <div className="flex flex-col gap-3">
        {visible.map(emp => (
          <EmployeeCard
            key={emp.id}
            emp={emp}
            agentId={activeAgentId}
            agents={agents}
            canManageEmployees={canManageEmployees}
            canEditDetails={canEditDetails}
            canToggleStatus={canToggleStatus}
            canInviteUsers={canInviteUsers}
            canManageUsers={canManageUsers}
            canInviteAtBranch={id => canAtBranch("invite_users", id)}
            canManageUsersAtBranch={id => canAtBranch("manage_users", id)}
            canManageSchedules={canManageSchedules}
            onReload={reload}
            onToast={showToast}
          />
        ))}
      </div>

      {/* Global toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
