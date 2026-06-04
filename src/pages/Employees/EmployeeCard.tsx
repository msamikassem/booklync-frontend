import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { employeesApi } from "./api";
import { EmployeeEditForm } from "./EmployeeEditForm";
import { EmployeeSchedule } from "./EmployeeSchedule";
import { EmployeeCapabilities } from "./EmployeeCapabilities";
import { AccessModal } from "./AccessModal";
import type { EmployeeResponse, AccessStatus } from "./types";
import type { AgentResponse } from "../../api/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "../../lib/utils";
import { Trash2, Pencil, Clock, Scissors, Mail } from "lucide-react";

type Panel = "view" | "edit" | "schedule" | "services";

const ACCESS_PILL: Record<AccessStatus, { label: string; cls: string }> = {
  active:         { label: "Dashboard: Active",   cls: "bg-green-100 text-green-800 border-transparent" },
  invite_pending: { label: "Invite pending",       cls: "bg-blue-100 text-blue-700 border-transparent" },
  invite_expired: { label: "Invite expired",       cls: "bg-amber-100 text-amber-700 border-transparent" },
  none:           { label: "No dashboard access",  cls: "bg-gray-100 text-gray-500 border-transparent" },
};

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
  const otherBranches = emp.branches.filter(b => b.agent_id !== agentId);
  const initials = emp.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const toggleActive = useMutation({
    mutationFn: () => isActive
      ? employeesApi.deactivate(emp.id, agentId)
      : employeesApi.activate(emp.id, agentId),
    onSuccess: () => { onReload(); onToast(`Employee ${isActive ? "deactivated" : "activated"}.`); },
    onError: () => onToast("Could not update status."),
  });

  const deleteMut = useMutation({
    mutationFn: () => employeesApi.delete(emp.id, agentId),
    onSuccess: () => { onReload(); onToast("Employee deleted."); },
    onError: (err: unknown) => {
      const data = (err as { data?: { code?: string } }).data;
      if (data?.code === "EMPLOYEE_MULTI_BRANCH") {
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

  async function handlePictureChange(file: File) {
    try {
      await employeesApi.uploadPicture(emp.id, agentId, file);
      onReload();
    } catch { onToast("Could not upload picture."); }
  }

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
                className={cn(
                  "w-12 h-12 rounded-full overflow-hidden bg-primary/10 grid place-items-center text-sm font-semibold text-primary",
                  canEditDetails && "cursor-pointer"
                )}
              >
                {emp.profile_picture_url
                  ? <img src={emp.profile_picture_url} alt="" className="w-full h-full object-cover" />
                  : initials}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePictureChange(f); }} />
            </div>

            {/* Name / role / contact */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="font-semibold text-ink">{emp.name}</span>
                {emp.role && <span className="text-xs text-muted">{emp.role}</span>}
              </div>
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

            {canManageEmployees && (
              <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(true)} disabled={deleteInProgress}
                className="text-muted hover:text-error h-8 w-8 flex-shrink-0">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Status + access pills */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {canToggleStatus ? (
              <button onClick={() => toggleActive.mutate()} disabled={toggleActive.isPending}
                className={cn(
                  "text-xs font-medium px-2.5 py-1 rounded-full transition-colors",
                  isActive ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                )}>
                {isActive ? "Active" : "Inactive"}
              </button>
            ) : (
              <Badge className={cn("rounded-full text-xs font-medium", isActive ? "bg-green-100 text-green-800 border-transparent" : "bg-gray-100 text-gray-500 border-transparent")}>
                {isActive ? "Active" : "Inactive"}
              </Badge>
            )}

            <Badge className={cn("rounded-full text-xs font-medium", accessPill.cls)}>
              {accessPill.label}
            </Badge>

            {!isBookable && (
              <Badge className="rounded-full text-xs font-medium bg-orange-100 text-orange-700 border-transparent">
                Non-bookable
              </Badge>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            {canEditDetails && (
              <Button variant="outline" size="sm" onClick={() => setPanel("edit")} className="h-7 gap-1.5 text-xs">
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            )}
            {isBookable && (
              <Button variant="outline" size="sm" onClick={() => setPanel("schedule")} className="h-7 gap-1.5 text-xs">
                <Clock className="h-3 w-3" /> Schedule
              </Button>
            )}
            {isBookable && canEditDetails && (
              <Button variant="outline" size="sm" onClick={() => setPanel("services")} className="h-7 gap-1.5 text-xs">
                <Scissors className="h-3 w-3" /> Services
              </Button>
            )}
            {canInviteUsers && (
              <Button variant="outline" size="sm" onClick={() => setShowAccess(true)} className="h-7 gap-1.5 text-xs">
                <Mail className="h-3 w-3" /> {inviteLabel()}
              </Button>
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

      {/* ── Delete confirm dialog ── */}
      <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <DialogContent className="max-w-sm p-6">
          <DialogHeader>
            <DialogTitle className="font-display font-semibold text-ink">Delete employee?</DialogTitle>
          </DialogHeader>
          {da.status === "active" && (
            <p className="text-xs text-error bg-red-50 border border-red-200 rounded px-2 py-1">
              This will also remove their dashboard login.
            </p>
          )}
          <p className="text-sm text-muted">
            Permanently delete <strong>{emp.name}</strong>? Their appointment history is kept.
          </p>
          <div className="flex gap-3 mt-2">
            <Button
              variant="destructive" className="flex-1"
              onClick={() => { setDeleteConfirm(false); deleteMut.mutate(); }}>
              Delete
            </Button>
            <Button variant="outline" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

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
