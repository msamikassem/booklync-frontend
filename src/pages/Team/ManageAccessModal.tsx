import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { teamApi, type TeamUser, type RoleInfo } from "./api";
import { formatApiError } from "../../lib/errors";
import { useToast } from "@/hooks/use-toast";
import type { ApiError } from "../../api/types";
import type { AgentResponse } from "../../api/types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

interface Props {
  user: TeamUser;
  roles: RoleInfo[];
  agents: AgentResponse[];
  onClose: () => void;
}

export function ManageAccessModal({ user: initial, roles, agents, onClose }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [user, setUser] = useState<TeamUser>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [addAgent, setAddAgent] = useState("");
  const [addRole, setAddRole] = useState("");

  // Owner role is the is_owner flag, never a branch-role assignment.
  const roleOptions = roles.filter(r => r.key !== "owner");
  const assignedIds = new Set(user.branches.map(b => b.agent_id));
  const available = agents.filter(a => !assignedIds.has(a.id));

  const synced = (updated: TeamUser) => { setUser(updated); setErr(null); qc.invalidateQueries({ queryKey: ["team-users"] }); };
  const onErr = (e: unknown) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Something went wrong."));

  const active = useMutation({
    mutationFn: (next: boolean) => teamApi.setActive(user.id, next),
    onSuccess: (u) => { synced(u); toast({ description: u.active ? "Account activated." : "Account deactivated." }); },
    onError: onErr,
  });
  const assign = useMutation({
    mutationFn: (v: { agentId: number; role: string }) => teamApi.assignRole(user.id, v.agentId, v.role),
    onSuccess: (u) => { synced(u); setAddAgent(""); setAddRole(""); },
    onError: onErr,
  });
  const revoke = useMutation({
    mutationFn: (agentId: number) => teamApi.revokeRole(user.id, agentId),
    onSuccess: (_d, agentId) => {
      setUser(u => ({ ...u, branches: u.branches.filter(b => b.agent_id !== agentId) }));
      setErr(null);
      qc.invalidateQueries({ queryKey: ["team-users"] });
    },
    onError: onErr,
  });

  const busy = active.isPending || assign.isPending || revoke.isPending;
  const roleName = (key: string) => roleOptions.find(r => r.key === key)?.name ?? key;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-canvas">
        <DialogHeader>
          <DialogTitle>Manage access</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="font-medium text-ink">{user.employee_name || user.email}</div>
            <div className="text-xs text-muted">{user.email}</div>
          </div>

          {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

          {/* Account status */}
          <div className="flex items-center justify-between rounded-lg border border-hairline p-3">
            <div>
              <div className="text-sm font-medium text-ink">Account status</div>
              <div className="text-xs text-muted">{user.active ? "Can sign in to the dashboard." : "Sign-in is disabled."}</div>
            </div>
            <Button variant={user.active ? "outline" : "default"} size="sm" disabled={busy}
              onClick={() => active.mutate(!user.active)}>
              {user.active ? "Deactivate" : "Activate"}
            </Button>
          </div>

          {/* Branch roles */}
          <div>
            <div className="text-sm font-medium text-ink mb-2">Branch access</div>
            {user.branches.length === 0 && (
              <p className="text-sm text-muted mb-2">No branch access — add one below. (Without any, this is a no-access account.)</p>
            )}
            <div className="space-y-2">
              {user.branches.map(b => (
                <div key={b.agent_id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-ink truncate">{b.agent_name}</span>
                  <Select value={b.role_key} onValueChange={(v) => assign.mutate({ agentId: b.agent_id, role: v })} disabled={busy}>
                    <SelectTrigger className="w-44 h-9"><SelectValue>{roleName(b.role_key)}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {roleOptions.map(r => <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button onClick={() => revoke.mutate(b.agent_id)} disabled={busy}
                    className="text-muted hover:text-error p-1.5" title="Remove access"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>

            {/* Add a branch */}
            {available.length > 0 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-hairline">
                <Select value={addAgent} onValueChange={setAddAgent} disabled={busy}>
                  <SelectTrigger className="flex-1 h-9"><SelectValue placeholder="Add a branch…" /></SelectTrigger>
                  <SelectContent>
                    {available.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.agent_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={addRole} onValueChange={setAddRole} disabled={busy || !addAgent}>
                  <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Role…" /></SelectTrigger>
                  <SelectContent>
                    {roleOptions.map(r => <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-9 gap-1" disabled={busy || !addAgent || !addRole}
                  onClick={() => assign.mutate({ agentId: Number(addAgent), role: addRole })}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
