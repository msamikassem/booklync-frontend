import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { teamApi, type TeamUser } from "./api";
import { cn } from "../../lib/utils";
import { ManageAccessModal } from "./ManageAccessModal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, ShieldCheck } from "lucide-react";

export default function Team() {
  const { me, agents } = useAuth();
  const [search, setSearch] = useState("");
  const [managing, setManaging] = useState<TeamUser | null>(null);

  const canManage = !!me && (me.is_owner || me.permissions.includes("manage_users"));

  const { data: users = [], isLoading, isError } = useQuery({
    queryKey: ["team-users"],
    queryFn: () => teamApi.list(),
    enabled: canManage,
    staleTime: 30 * 1000,
  });
  const { data: roles = [] } = useQuery({
    queryKey: ["team-roles"],
    queryFn: () => teamApi.roles(),
    enabled: canManage,
    staleTime: 5 * 60 * 1000,
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.email.toLowerCase().includes(q) || (u.employee_name ?? "").toLowerCase().includes(q));
  }, [users, search]);

  if (!canManage) return <p className="text-sm text-muted px-6 py-4">Only owners and users with “manage users” can view the team.</p>;

  return (
    <div className="px-6 pb-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-ink">Team</h1>
        <p className="text-sm text-muted">Everyone who can sign in to the dashboard, and what they can access.</p>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none h-3.5 w-3.5" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" className="pl-9" />
      </div>

      {isLoading && <p className="text-sm text-muted py-8 text-center">Loading team…</p>}
      {isError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">Could not load the team.</div>}

      {!isLoading && !isError && (
        <div className="bg-canvas rounded-xl border border-hairline divide-y divide-hairline overflow-hidden">
          {visible.length === 0 && <p className="text-sm text-muted p-8 text-center">{search ? "No matches." : "No users yet."}</p>}
          {visible.map(u => (
            <div key={u.id} className="flex items-center gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink truncate">{u.employee_name || u.email}</span>
                  {u.is_owner && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide bg-amber-100 text-amber-800 rounded-full px-1.5 py-0.5">
                      <ShieldCheck className="h-3 w-3" /> Owner
                    </span>
                  )}
                  {!u.active && <Badge className="rounded-full text-[10px] bg-gray-100 text-gray-500 border-transparent">Inactive</Badge>}
                </div>
                <div className="text-xs text-muted truncate">{u.email}</div>
              </div>

              {/* Branch-role chips */}
              <div className="hidden sm:flex flex-wrap gap-1.5 justify-end max-w-[45%]">
                {u.is_owner ? (
                  <span className="text-xs text-muted">All branches</span>
                ) : u.branches.length === 0 ? (
                  <span className="text-xs text-muted italic">No access</span>
                ) : (
                  u.branches.map(b => (
                    <span key={b.agent_id} className="text-xs rounded-full bg-surface-soft border border-hairline px-2 py-0.5">
                      <span className="text-ink">{b.agent_name}</span>
                      <span className="text-muted"> · {b.role_name}</span>
                    </span>
                  ))
                )}
              </div>

              <Button variant="outline" size="sm" disabled={u.is_owner}
                className={cn(u.is_owner && "opacity-0 pointer-events-none")}
                onClick={() => setManaging(u)}>
                Manage
              </Button>
            </div>
          ))}
        </div>
      )}

      {managing && (
        <ManageAccessModal user={managing} roles={roles} agents={agents} onClose={() => setManaging(null)} />
      )}
    </div>
  );
}
