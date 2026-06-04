/**
 * Inline edit form — profile fields + bookable toggle + branch checkboxes.
 *
 * Branch diff rules (mirrors old save handler):
 *   - additions → assignBranch
 *   - removals → unassignBranch
 *   - removing the CURRENT branch → confirm first, then unassign + call onCurrentBranchRemoved
 *   - removing all branches is rejected client-side (backend also rejects with 409 LAST_BRANCH)
 */

import { useState, useEffect } from "react";
import { employeesApi } from "./api";
import { formatApiError } from "../../lib/errors";
import type { EmployeeResponse, ApiError } from "./types";
import type { AgentResponse } from "../../api/types";

const iCls = "w-full h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

interface Props {
  emp: EmployeeResponse;
  agentId: number;           // current branch
  agents: AgentResponse[];
  canManageEmployees: boolean;
  onSaved: (updated: EmployeeResponse) => void;
  onCurrentBranchRemoved: () => void;
  onCancel: () => void;
}

export function EmployeeEditForm({ emp, agentId, agents, canManageEmployees, onSaved, onCurrentBranchRemoved, onCancel }: Props) {
  const [name, setName] = useState(emp.name);
  const [role, setRole] = useState(emp.role ?? "");
  const [phone, setPhone] = useState(emp.phone ?? "");
  const [email, setEmail] = useState(emp.email ?? "");

  // bookable: read from the current branch's EmployeeBranchSummary
  const currentBranch = emp.branches.find(b => b.agent_id === agentId);
  const [bookable, setBookable] = useState(currentBranch?.can_receive_bookings ?? true);

  // Branch checkboxes
  const initBranches = new Set(emp.branches.map(b => b.agent_id));
  const [selectedBranches, setSelectedBranches] = useState<Set<number>>(new Set(initBranches));

  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bookableWarn, setBookableWarn] = useState(false);

  // Dirty detection
  const origBranches = [...initBranches].sort().join(",");
  const currBranches = [...selectedBranches].sort().join(",");
  const dirty = name !== emp.name || role !== (emp.role ?? "") || phone !== (emp.phone ?? "") ||
    email !== (emp.email ?? "") || bookable !== (currentBranch?.can_receive_bookings ?? true) ||
    currBranches !== origBranches;

  // Bookable-off warning: check if employee has upcoming appointments
  useEffect(() => {
    if (!bookable && (currentBranch?.can_receive_bookings ?? true)) {
      setBookableWarn(true);
    } else {
      setBookableWarn(false);
    }
  }, [bookable, currentBranch]);

  async function handleSave() {
    if (!name.trim()) { setErr("Name cannot be empty."); return; }
    if (selectedBranches.size === 0) { setErr("Employee must be in at least one branch."); return; }

    const added   = [...selectedBranches].filter(id => !initBranches.has(id));
    const removed = [...initBranches].filter(id => !selectedBranches.has(id));
    const removingCurrent = removed.includes(agentId);

    if (removingCurrent && !window.confirm(
      `Removing ${emp.name} from this branch will delete their schedule, breaks, and service assignments here (history is kept). Continue?`
    )) return;

    setSaving(true); setErr(null);

    try {
      // Profile update (only if current branch still in list, or we're doing it before unassign)
      if (!removingCurrent) {
        const updated = await employeesApi.update(emp.id, agentId, {
          name: name.trim(),
          role: role.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          can_receive_bookings: bookable,
        });
        onSaved(updated);
      }

      // Branch adds
      await Promise.all(added.map(id => employeesApi.assignBranch(emp.id, { agent_id: id })));

      // Branch removes
      for (const id of removed) {
        await employeesApi.unassignBranch(emp.id, id);
      }

      if (removingCurrent) {
        onCurrentBranchRemoved();
        return;
      }

      // If branches changed, get fresh data
      if (added.length || removed.length) {
        const fresh = await employeesApi.update(emp.id, agentId, {
          name: name.trim(), role: role.trim() || null,
          phone: phone.trim() || null, email: email.trim() || null,
          can_receive_bookings: bookable,
        });
        onSaved(fresh);
      }
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not save changes."));
    } finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Name <span className="text-error">*</span></label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" className={iCls} />
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
      <div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <div onClick={() => setBookable(b => !b)}
            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${bookable ? "bg-primary" : "bg-surface-strong"}`}>
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${bookable ? "translate-x-4" : ""}`} />
          </div>
          <div>
            <span className="text-sm font-medium text-ink">Can receive bookings at this branch</span>
            <p className="text-xs text-muted mt-0.5">When off: no calendar, can't be assigned services or booked here. Other branches unaffected.</p>
          </div>
        </label>
        {bookableWarn && (
          <div className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2">
            <strong>Heads up:</strong> upcoming appointments will stay on {emp.name}'s calendar, but they won't be offered for new bookings once you save.
          </div>
        )}
      </div>

      {/* Branch checkboxes — only when canManageEmployees */}
      {canManageEmployees && agents.length > 1 && (
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Branches</label>
          <div className="flex flex-col gap-1.5">
            {agents.map(a => (
              <label key={a.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input type="checkbox" checked={selectedBranches.has(a.id)}
                  onChange={() => {
                    setSelectedBranches(prev => {
                      const next = new Set(prev);
                      next.has(a.id) ? next.delete(a.id) : next.add(a.id);
                      return next;
                    });
                  }}
                  className="accent-primary" />
                <span className="text-ink">{a.agent_name}{a.location_name ? ` · ${a.location_name}` : ""}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted mt-1.5">Removing a branch deletes their schedule and capabilities there (history is kept).</p>
        </div>
      )}

      {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

      <div className={`flex gap-2 ${dirty ? "" : "opacity-50 pointer-events-none"}`}>
        <button onClick={handleSave} disabled={saving || !dirty}
          className="h-9 px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button onClick={onCancel}
          className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
