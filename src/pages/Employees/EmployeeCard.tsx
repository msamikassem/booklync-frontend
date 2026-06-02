/**
 * Employee card — the main UI unit.
 *
 * Panels (only one visible at a time):
 *   view      — default: avatar, name, role, branch chips, status/access pills + action buttons
 *   edit      — EmployeeEditForm
 *   schedule  — EmployeeSchedule (working hours, breaks, days off)
 *   services  — EmployeeCapabilities
 *
 * Action buttons and UI elements are gated by four permission scopes:
 *   manage_employees      — delete button, branch checkboxes in edit form
 *   edit_employee_details — edit button, services tab, profile-pic click
 *   toggle_employee_status — active/inactive pill (button vs. read-only span)
 *   invite_users          — invite button label + access modal
 */

import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { employeesApi } from "./api";
import { EmployeeEditForm } from "./EmployeeEditForm";
import { EmployeeSchedule } from "./EmployeeSchedule";
import { EmployeeCapabilities } from "./EmployeeCapabilities";
import { AccessModal } from "./AccessModal";
import type { EmployeeResponse, AccessStatus } from "./types";
import type { AgentResponse } from "../../api/types";

type Panel = "view" | "edit" | "schedule" | "services";

// ── Status pill colours ────────────────────────────────────────────────────────

const ACCESS_PILL: Record<AccessStatus, { label: string; cls: string }> = {
  active:         { label: "Dashboard: Active",   cls: "bg-green-100 text-green-800" },
  invite_pending: { label: "Invite pending",       cls: "bg-blue-100 text-blue-700" },
  invite_expired: { label: "Invite expired",       cls: "bg-amber-100 text-amber-700" },
  none:           { label: "No dashboard access",  cls: "bg-gray-100 text-gray-500" },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  emp: EmployeeResponse;
  agentId: number;
  agents: AgentResponse[];
  canManageEmployees: boolean;
  canEditDetails: boolean;
  canToggleStatus: boolean;
  canInviteUsers: boolean;
  canManageUsers: boolean;
  canInviteAtBranch: (id: number) => boolean;
  canManageUsersAtBranch: (id: number) => boolean;
  canManageSchedules: boolean;
  onReload: () => void;
  onToast: (msg: string) => void;
}

export function EmployeeCard({
  emp, agentId, agents,
  canManageEmployees, canEditDetails, canToggleStatus,
  canInviteUsers, canManageUsers,
  canInviteAtBranch, canManageUsersAtBranch,
  canManageSchedules, onReload, onToast,
}: Props) {
  const qc = useQueryClient();
  const [panel, setPanel] = useState<Panel>("view");
  const [showAccess, setShowAccess] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const branch = emp.branches.find(b => b.agent_id === agentId);
  const isBookable = branch?.can_receive_bookings ?? true;
  const isActive   = branch?.active ?? true;
  const da         = emp.dashboard_access;

  // Other branches this employee belongs to (shown as chips)
  const otherBranches = emp.branches.filter(b => b.agent_id !== agentId);

  // Initials + avatar
  const initials = emp.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  // ── Toggle active/inactive ───────────────────────────────────────────────

  const toggleActive = useMutation({
    mutationFn: () => isActive
      ? employeesApi.deactivate(emp.id, agentId)
      : employeesApi.activate(emp.id, agentId),
    onSuccess: () => { onReload(); onToast(`Employee ${isActive ? "deactivated" : "activated"}.`); },
    onError: () => onToast("Could not update status."),
  });

  // ── Delete ───────────────────────────────────────────────────────────────

  const deleteMut = useMutation({
    mutationFn: () => employeesApi.delete(emp.id, agentId),
    onSuccess: () => { onReload(); onToast("Employee deleted."); },
    onError: (err: unknown) => {
      const data = (err as { data?: { code?: string } }).data;
      if (data?.code === "EMPLOYEE_MULTI_BRANCH") {
        // Offer unassign instead of delete
        if (window.confirm(
          `${emp.name} is assigned to multiple branches. Remove them from this branch only (keeps other branches and history)?`
        )) unassignMut.mutate();
      } else {
        onToast("Could not delete employee.");
      }
    },
  });

  const unassignMut = useMutation({
    mutationFn: () => employeesApi.unassignBranch(emp.id, agentId),
    onSuccess: () => { onReload(); onToast("Employee removed from this branch."); },
    onError: () => onToast("Could not unassign employee."),
  });

  // ── Profile picture upload ────────────────────────────────────────────────

  async function handlePictureChange(file: File) {
    try {
      await employeesApi.uploadPicture(emp.id, agentId, file);
      onReload();
    } catch { onToast("Could not upload picture."); }
  }

  // ── Invite button label ───────────────────────────────────────────────────

  function inviteLabel(): string {
    if (da.status === "active")         return "Dashboard";
    if (da.status === "invite_pending") return "Invited";
    if (da.status === "invite_expired") return "Resend invite";
    return "Invite";
  }

  const accessPill = ACCESS_PILL[da.status];
  const deleteInProgress = deleteMut.isPending || unassignMut.isPending;

  return (
    <div className="bg-canvas rounded-xl border border-hairline overflow-hidden">
      {/* ── View panel ── */}
      {panel === "view" && (
        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div
                onClick={() => canEditDetails && fileRef.current?.click()}
                className={`w-12 h-12 rounded-full overflow-hidden bg-primary/10 grid place-items-center text-sm font-semibold text-primary ${canEditDetails ? "cursor-pointer" : ""}`}
              >
                {emp.profile_picture_url
                  ? <img src={emp.profile_picture_url} alt="" className="w-full h-full object-cover" />
                  : initials}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePictureChange(f); }} />
            </div>

            {/* Name / role / branches / contact */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="font-semibold text-ink">{emp.name}</span>
                {emp.role && <span className="text-xs text-muted">{emp.role}</span>}
              </div>
              {/* Branch chips */}
              {otherBranches.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {otherBranches.map(b => (
                    <span key={b.agent_id}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${b.active ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700"}`}>
                      {b.agent_name}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                {emp.phone && <span>{emp.phone}</span>}
                {emp.email && <span>{emp.email}</span>}
              </div>
            </div>

            {/* Delete icon */}
            {canManageEmployees && (
              <button onClick={() => setDeleteConfirm(true)} disabled={deleteInProgress}
                className="text-muted hover:text-error p-1 rounded transition-colors flex-shrink-0">
                <TrashIcon />
              </button>
            )}
          </div>

          {/* Status + access pills */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {canToggleStatus ? (
              <button onClick={() => toggleActive.mutate()} disabled={toggleActive.isPending}
                className={`text-xs font-medium px-2.5 py-1 rounded-pill transition-colors ${isActive ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                {isActive ? "Active" : "Inactive"}
              </button>
            ) : (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-pill ${isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                {isActive ? "Active" : "Inactive"}
              </span>
            )}

            <span className={`text-xs font-medium px-2.5 py-1 rounded-pill ${accessPill.cls}`}>
              {accessPill.label}
            </span>

            {!isBookable && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-pill bg-orange-100 text-orange-700">Non-bookable</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            {canEditDetails && (
              <button onClick={() => setPanel("edit")}
                className="flex items-center gap-1.5 text-xs font-medium px-3 h-7 border border-hairline rounded hover:bg-surface-soft transition-colors">
                <EditIcon /> Edit
              </button>
            )}
            {isBookable && (
              <button onClick={() => setPanel("schedule")}
                className="flex items-center gap-1.5 text-xs font-medium px-3 h-7 border border-hairline rounded hover:bg-surface-soft transition-colors">
                <ClockIcon /> Schedule
              </button>
            )}
            {isBookable && canEditDetails && (
              <button onClick={() => setPanel("services")}
                className="flex items-center gap-1.5 text-xs font-medium px-3 h-7 border border-hairline rounded hover:bg-surface-soft transition-colors">
                <ServicesIcon /> Services
              </button>
            )}
            {canInviteUsers && (
              <button onClick={() => setShowAccess(true)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 h-7 border border-hairline rounded hover:bg-surface-soft transition-colors">
                <MailIcon /> {inviteLabel()}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Edit panel ── */}
      {panel === "edit" && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-ink">Edit employee</h3>
            <button onClick={() => setPanel("view")} className="text-xs text-muted hover:text-ink">Back</button>
          </div>
          <EmployeeEditForm emp={emp} agentId={agentId} agents={agents}
            canManageEmployees={canManageEmployees}
            onSaved={updated => { qc.setQueryData<EmployeeResponse[]>(["employees", agentId], prev => prev?.map(e => e.id === updated.id ? updated : e)); setPanel("view"); onToast("Employee updated."); }}
            onCurrentBranchRemoved={() => { onReload(); onToast("Employee removed from this branch."); }}
            onCancel={() => setPanel("view")} />
        </div>
      )}

      {/* ── Schedule panel ── */}
      {panel === "schedule" && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-ink">Schedule</h3>
            <button onClick={() => setPanel("view")} className="text-xs text-muted hover:text-ink">Back</button>
          </div>
          <EmployeeSchedule empId={emp.id} agentId={agentId} canEdit={canManageSchedules} />
        </div>
      )}

      {/* ── Services panel ── */}
      {panel === "services" && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-ink">Assigned services</h3>
            <button onClick={() => setPanel("view")} className="text-xs text-muted hover:text-ink">Back</button>
          </div>
          <EmployeeCapabilities empId={emp.id} agentId={agentId} canEdit={canEditDetails} />
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/25 z-50" onClick={() => setDeleteConfirm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-canvas rounded-xl shadow-lg w-full max-w-sm pointer-events-auto p-6">
              <h3 className="font-display font-semibold text-ink mb-1">Delete employee?</h3>
              {da.status === "active" && (
                <p className="text-xs text-error bg-red-50 border border-red-200 rounded px-2 py-1 mb-2">
                  This will also remove their dashboard login.
                </p>
              )}
              <p className="text-sm text-muted mb-5">
                Permanently delete <strong>{emp.name}</strong>? Their appointment history is kept.
              </p>
              <div className="flex gap-3">
                <button onClick={() => { setDeleteConfirm(false); deleteMut.mutate(); }}
                  className="flex-1 h-9 bg-error hover:bg-red-700 text-white text-sm font-medium rounded-md disabled:opacity-60">
                  Delete
                </button>
                <button onClick={() => setDeleteConfirm(false)}
                  className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Access modal ── */}
      {showAccess && (
        <AccessModal emp={emp} agents={agents}
          canManageUsers={canManageUsers}
          canInviteAtBranch={canInviteAtBranch}
          canManageUsersAtBranch={canManageUsersAtBranch}
          onClose={() => setShowAccess(false)}
          onSuccess={() => { onReload(); }} />
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const s = { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function TrashIcon()    { return <svg {...s}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function EditIcon()     { return <svg {...s}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function ClockIcon()    { return <svg {...s}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
function ServicesIcon() { return <svg {...s}><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>; }
function MailIcon()     { return <svg {...s}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>; }
