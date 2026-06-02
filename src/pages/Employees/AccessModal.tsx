/**
 * Dashboard access modal — 4 modes driven by dashboard_access.status.
 *
 * none           → send invite  (role + branches + email)
 * invite_pending → edit+resend  (same fields pre-filled + "Cancel invitation")
 * invite_expired → resend       (same pre-filled + "Cancel invitation")
 * active         → manage branches (branch checkboxes only + "Revoke access" if manage_users)
 *
 * After any successful action, calls onSuccess() so the parent reloads the employee list.
 */

import { useState } from "react";
import { employeesApi } from "./api";
import { formatApiError } from "../../lib/errors";
import type { EmployeeResponse, ApiError } from "./types";
import type { AgentResponse } from "../../api/types";

interface Props {
  emp: EmployeeResponse;
  agents?: AgentResponse[];
  canManageUsers: boolean;
  canInviteAtBranch: (agentId: number) => boolean;
  canManageUsersAtBranch: (agentId: number) => boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const INVITE_ROLES = [
  { value: "staff", label: "Staff — own calendar & appointment statuses" },
  { value: "receptionist", label: "Receptionist — bookings & customer messaging" },
  { value: "branch_manager", label: "Branch Manager — runs the branch" },
];

export function AccessModal({ emp, canManageUsers, canInviteAtBranch, canManageUsersAtBranch, onClose, onSuccess }: Props) {
  const da = emp.dashboard_access;
  const status = da.status;

  const [role, setRole] = useState<string>(da.invite_role ?? "staff");
  const [email, setEmail] = useState<string>(da.email ?? emp.email ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Branch selection — which branches the invite/access covers
  const initBranches = (): Set<number> => {
    if (status === "active") {
      return new Set((da.account_branches ?? []).map(b => b.agent_id));
    }
    if (da.invite_agent_ids?.length) return new Set(da.invite_agent_ids);
    // Default for new invite: all branches the caller can invite on
    return new Set(emp.branches.filter(b => canInviteAtBranch(b.agent_id)).map(b => b.agent_id));
  };

  const [selectedBranches, setSelectedBranches] = useState<Set<number>>(initBranches);

  function toggleBranch(agentId: number, canPick: boolean) {
    if (!canPick) return;
    setSelectedBranches(prev => {
      const next = new Set(prev);
      next.has(agentId) ? next.delete(agentId) : next.add(agentId);
      return next;
    });
  }

  const isPending = status === "invite_pending";
  const isExpired = status === "invite_expired";
  const isActive  = status === "active";

  const title = isActive
    ? "Manage dashboard access"
    : isPending ? "Edit invitation"
    : isExpired ? "Resend invitation"
    : "Invite to dashboard";

  const confirmLabel = isActive
    ? "Save branches"
    : isPending ? "Save & resend"
    : isExpired ? "Resend invitation"
    : "Send invite";

  async function handleConfirm() {
    setErr(null);
    if (!isActive && !email.trim()) { setErr("Email is required."); return; }

    setSaving(true);
    try {
      if (isActive) {
        // Diff checked vs. original, then assign/revoke
        const orig = new Set((da.account_branches ?? []).map(b => b.agent_id));
        const adds = [...selectedBranches].filter(id => !orig.has(id));
        const removes = [...orig].filter(id => !selectedBranches.has(id));
        const userId = da.user_id!;
        await Promise.all([
          ...adds.map(id => employeesApi.assignBranchRole(userId, { agent_id: id, role: "staff" })),
          ...removes.map(id => employeesApi.revokeBranchRole(userId, id)),
        ]);
      } else {
        // send or resend invite
        await employeesApi.invite(emp.id, {
          role,
          agent_ids: [...selectedBranches],
          email: email.trim() || undefined,
        });
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Action failed. Please try again."));
    } finally { setSaving(false); }
  }

  async function handleDestroy() {
    setSaving(true); setErr(null);
    try {
      if (isActive) {
        await employeesApi.revokeAccount(emp.id);
      } else {
        await employeesApi.cancelInvite(emp.id);
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not complete action."));
    } finally { setSaving(false); }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-canvas rounded-xl shadow-lg w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
            <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
            <button onClick={onClose} className="text-muted hover:text-ink p-1 rounded hover:bg-surface-soft">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="px-6 py-5 flex flex-col gap-4">
            {/* Intro */}
            <p className="text-sm text-muted">
              {isActive
                ? <><strong className="text-ink">{emp.name}</strong> has an active dashboard login. Update which branches it covers, or revoke access entirely.</>
                : isPending
                  ? <><strong className="text-ink">{emp.name}</strong>'s invitation is awaiting acceptance. Change role, branches or email and resend, or cancel.</>
                  : isExpired
                    ? <>The previous invitation for <strong className="text-ink">{emp.name}</strong> expired. Resend to mint a fresh link, or cancel.</>
                    : <>Send <strong className="text-ink">{emp.name}</strong> an email invitation to create a dashboard login.</>
              }
            </p>

            {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

            {/* Email — invite modes only */}
            {!isActive && (
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Email <span className="text-error">*</span></label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              </div>
            )}

            {/* Role — invite modes only */}
            {!isActive && (
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Role at every selected branch</label>
                <select value={role} onChange={e => setRole(e.target.value)}
                  className="w-full h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                  {INVITE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            )}

            {/* Branch checkboxes */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                {isActive ? "Branches with dashboard access" : "Branches to include"}
              </label>
              <p className="text-xs text-muted mb-2">
                {isActive
                  ? "Tick a branch to grant access; untick to revoke at that branch only."
                  : "Pick which of this employee's branches the dashboard login should cover."}
              </p>
              <div className="flex flex-col gap-1.5">
                {emp.branches.map(b => {
                  const canPick = isActive
                    ? canManageUsersAtBranch(b.agent_id)
                    : canInviteAtBranch(b.agent_id);
                  return (
                    <label key={b.agent_id} className={`flex items-center gap-2.5 text-sm cursor-pointer ${!canPick ? "opacity-50 cursor-not-allowed" : ""}`}>
                      <input type="checkbox" checked={selectedBranches.has(b.agent_id)} disabled={!canPick}
                        onChange={() => toggleBranch(b.agent_id, canPick)}
                        className="accent-primary" />
                      <span className={canPick ? "text-ink" : "text-muted"}>{b.agent_name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-6 pb-5 gap-3">
            {/* Destructive button */}
            {(isPending || isExpired) && (
              <button onClick={handleDestroy} disabled={saving}
                className="h-9 px-4 border border-error text-error text-sm font-medium rounded-md hover:bg-red-50 disabled:opacity-60 transition-colors">
                Cancel invitation
              </button>
            )}
            {isActive && canManageUsers && (
              <button onClick={handleDestroy} disabled={saving}
                className="h-9 px-4 border border-error text-error text-sm font-medium rounded-md hover:bg-red-50 disabled:opacity-60 transition-colors">
                Revoke access
              </button>
            )}
            {!isPending && !isExpired && !isActive && <div />}

            {/* Confirm */}
            <button onClick={handleConfirm} disabled={saving}
              className="h-9 px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors ml-auto">
              {saving ? "Saving…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
