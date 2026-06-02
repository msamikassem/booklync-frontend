/**
 * Add employee form — two modes:
 *   "New employee"         — name/role/phone/email/bookable + branch picker + optional invite
 *   "From another branch"  — searchable list of existing employees from other branches
 *
 * The mode toggle is shown only when the business has multiple branches.
 * Mirrors _initEmpSection's add-form section in dashboard-employees.js.
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { employeesApi } from "./api";
import { formatApiError } from "../../lib/errors";
import type { EmployeeResponse, ApiError } from "./types";
import type { AgentResponse } from "../../api/types";

const iCls = "w-full h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

interface Props {
  agentId: number;
  agents: AgentResponse[];
  currentAgentEmployeeIds: Set<number>;  // already in this branch
  onSaved: () => void;
  onCancel: () => void;
}

export function AddEmployeeForm({ agentId, agents, currentAgentEmployeeIds, onSaved, onCancel }: Props) {
  const showToggle = agents.length > 1;
  const [mode, setMode] = useState<"new" | "existing">("new");

  // ── New employee fields ──────────────────────────────────────────────────
  const [name, setName]     = useState("");
  const [role, setRole]     = useState("");
  const [phone, setPhone]   = useState("");
  const [email, setEmail]   = useState("");
  const [bookable, setBookable] = useState(true);
  const [grantAccess, setGrantAccess] = useState(false);
  const [inviteRole, setInviteRole]   = useState("staff");
  const [selectedBranches, setSelectedBranches] = useState<Set<number>>(new Set([agentId]));
  const [err, setErr]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Existing employee search ─────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const [candidateBookable, setCandidateBookable] = useState(true);

  // Load employees from all other branches
  const otherBranchIds = agents.filter(a => a.id !== agentId).map(a => a.id);
  const { data: allOtherEmps = [], isLoading: othersLoading } = useQuery({
    queryKey: ["other-branch-emps", otherBranchIds.join(",")],
    queryFn: async () => {
      const results = await Promise.all(otherBranchIds.map(id => employeesApi.list(id).catch(() => [] as EmployeeResponse[])));
      // Deduplicate by id, exclude employees already in this branch
      const seen = new Set<number>();
      const deduped: EmployeeResponse[] = [];
      for (const batch of results) {
        for (const emp of batch) {
          if (!seen.has(emp.id) && !currentAgentEmployeeIds.has(emp.id)) {
            seen.add(emp.id);
            deduped.push(emp);
          }
        }
      }
      return deduped;
    },
    enabled: mode === "existing" && otherBranchIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const filteredCandidates = search.trim()
    ? allOtherEmps.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.role || "").toLowerCase().includes(search.toLowerCase()))
    : allOtherEmps;

  async function handleNewSave() {
    if (!name.trim()) { setErr("Name is required."); return; }
    if (selectedBranches.size === 0) { setErr("Select at least one branch."); return; }
    setSaving(true); setErr(null);
    try {
      const emp = await employeesApi.create({
        agent_ids: [...selectedBranches],
        name: name.trim(),
        role: role.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        can_receive_bookings: bookable,
      });
      if (grantAccess) {
        await employeesApi.invite(emp.id, {
          role: inviteRole,
          agent_ids: [...selectedBranches],
          email: email.trim() || undefined,
        }).catch(() => { /* invite failure is non-fatal */ });
      }
      onSaved();
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not add employee."));
    } finally { setSaving(false); }
  }

  async function handleExistingSave() {
    if (!selectedCandidate) { setErr("Select an employee."); return; }
    setSaving(true); setErr(null);
    try {
      await employeesApi.assignBranch(selectedCandidate, { agent_id: agentId, can_receive_bookings: candidateBookable });
      onSaved();
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not add employee to branch."));
    } finally { setSaving(false); }
  }

  function toggleBranch(id: number) {
    setSelectedBranches(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Reset on mode switch
  useEffect(() => {
    setErr(null); setSearch(""); setSelectedCandidate(null);
  }, [mode]);

  return (
    <div className="bg-canvas rounded-xl border border-hairline p-5">
      {/* Mode toggle */}
      {showToggle && (
        <div className="inline-flex rounded-md border border-hairline overflow-hidden mb-5">
          {(["new", "existing"] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`px-4 h-8 text-sm font-medium transition-colors ${mode === m ? "bg-primary text-white" : "bg-canvas text-ink hover:bg-surface-soft"}`}>
              {m === "new" ? "New employee" : "From another branch"}
            </button>
          ))}
        </div>
      )}

      {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">{err}</p>}

      {/* ── New mode ── */}
      {mode === "new" && (
        <div className="flex flex-col gap-4">
          {agents.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Branches <span className="text-error">*</span></label>
              <div className="flex flex-col gap-1.5">
                {agents.map(a => (
                  <label key={a.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={selectedBranches.has(a.id)} onChange={() => toggleBranch(a.id)} className="accent-primary" />
                    <span className="text-ink">{a.agent_name}{a.location_name ? ` · ${a.location_name}` : ""}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Name <span className="text-error">*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" className={iCls} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Role</label>
            <input type="text" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Barber, Manager" className={iCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" className={iCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" className={iCls} />
            </div>
          </div>

          {/* Bookable toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div onClick={() => setBookable(b => !b)}
              className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${bookable ? "bg-primary" : "bg-surface-strong"}`}>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${bookable ? "translate-x-4" : ""}`} />
            </div>
            <div>
              <span className="text-sm font-medium text-ink">Can receive bookings</span>
              <p className="text-xs text-muted mt-0.5">Gives this employee a calendar and lets them be assigned services. Turn off for receptionists.</p>
            </div>
          </label>

          {/* Grant access toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div onClick={() => setGrantAccess(b => !b)}
              className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${grantAccess ? "bg-primary" : "bg-surface-strong"}`}>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${grantAccess ? "translate-x-4" : ""}`} />
            </div>
            <div>
              <span className="text-sm font-medium text-ink">Grant dashboard access</span>
              <p className="text-xs text-muted mt-0.5">Sends an email invitation to every selected branch.</p>
            </div>
          </label>

          {grantAccess && (
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Role at every selected branch <span className="text-error">*</span></label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className={iCls}>
                <option value="staff">Staff — own calendar & appointment statuses</option>
                <option value="receptionist">Receptionist — bookings & customer messaging</option>
                <option value="branch_manager">Branch Manager — runs the branch</option>
              </select>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleNewSave} disabled={saving}
              className="flex-1 h-9 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
              {saving ? "Adding…" : "Add employee"}
            </button>
            <button onClick={onCancel} className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Existing mode ── */}
      {mode === "existing" && (
        <div className="flex flex-col gap-4">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or role…"
              className="w-full h-9 pl-8 pr-3 border border-hairline rounded-md text-sm bg-canvas focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>

          {othersLoading && <p className="text-sm text-muted">Loading…</p>}
          {!othersLoading && filteredCandidates.length === 0 && (
            <p className="text-sm text-muted">No employees from other branches to add.</p>
          )}

          <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
            {filteredCandidates.map(cand => (
              <button key={cand.id} type="button"
                onClick={() => setSelectedCandidate(selectedCandidate === cand.id ? null : cand.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${selectedCandidate === cand.id ? "bg-primary/10 border border-primary/30" : "border border-hairline hover:border-primary/30 hover:bg-surface-soft"}`}>
                <div className="w-7 h-7 rounded-full bg-primary/10 grid place-items-center text-xs font-semibold text-primary flex-shrink-0">
                  {cand.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-ink">{cand.name}</div>
                  {cand.role && <div className="text-xs text-muted">{cand.role}</div>}
                </div>
              </button>
            ))}
          </div>

          {selectedCandidate != null && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div onClick={() => setCandidateBookable(b => !b)}
                className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${candidateBookable ? "bg-primary" : "bg-surface-strong"}`}>
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${candidateBookable ? "translate-x-4" : ""}`} />
              </div>
              <span className="text-sm font-medium text-ink">Can receive bookings at this branch</span>
            </label>
          )}

          <div className="flex gap-2">
            <button onClick={handleExistingSave} disabled={saving || selectedCandidate == null}
              className="flex-1 h-9 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
              {saving ? "Adding…" : "Add to branch"}
            </button>
            <button onClick={onCancel} className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
