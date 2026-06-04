/**
 * Branches screen — port of dashboard-branches.js + dashboard-branch-hours.js.
 *
 * Layout: branch cards grid → click card → detail panel with:
 *   - Basics (name, phone, timezone) — read-only with Edit button, confirm dialog on save
 *   - Working Hours — day-of-week grid, add/remove days, save replaces whole week
 *   - Branch Closures (days off) — inline add form, delete per row
 *   - Danger zone — delete branch
 *
 * RBAC:
 *   - manage_branches: create branch, edit basics, delete branch, add/remove custom domain
 *   - manage_schedules: working hours + days off
 */

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agents as agentsApi, businessHours as bhApi, daysOff as daysOffApi } from "../api";
import type { DayOff } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useAgent } from "../contexts/AgentContext";
import { formatApiError } from "../lib/errors";
import { stripE164, buildPhone, validatePhone } from "../lib/utils";
import { CITY_TIMEZONE, TIMEZONE_CITY, CITIES, isBranchOpen } from "../lib/timezones";
import type { AgentResponse, BusinessHourResponse, ApiError } from "../api/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── City combobox ─────────────────────────────────────────────────────────────

function CityCombobox({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const matches = query.trim()
    ? CITIES.filter((c) => c.toLowerCase().includes(query.toLowerCase()))
    : CITIES;

  return (
    <div ref={ref} className="relative">
      <input
        type="text" value={query} disabled={disabled}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Type or select a city…"
        className={iCls(disabled)}
      />
      {open && !disabled && matches.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-canvas border border-hairline rounded-md shadow-md max-h-48 overflow-y-auto">
          {matches.map((city) => (
            <button key={city} type="button" onMouseDown={(e) => { e.preventDefault(); onChange(city); setQuery(city); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-soft transition-colors">
              {city}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── New branch modal ──────────────────────────────────────────────────────────

function NewBranchModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) { setErr("Branch name is required."); return; }
    const phoneErr = validatePhone(phone); if (phoneErr) { setErr(phoneErr); return; }
    if (!CITY_TIMEZONE[city]) { setErr("Please select a valid city from the list."); return; }
    setSaving(true); setErr(null);
    try {
      await agentsApi.create({
        agent_name: name.trim(), location_name: name.trim(),
        phone_number: buildPhone(phone) ?? "", timezone: CITY_TIMEZONE[city],
        model: "claude-sonnet-4-6",
      });
      onCreated(); onClose();
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not create branch."));
    } finally { setSaving(false); }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-canvas rounded-xl shadow-lg w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
            <h2 className="font-display text-lg font-semibold text-ink">New branch</h2>
            <button onClick={onClose} className="text-muted hover:text-ink p-1 rounded hover:bg-surface-soft"><XIcon /></button>
          </div>
          <div className="px-6 py-5 flex flex-col gap-4">
            {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}
            <div><label className="block text-sm font-medium text-ink mb-1.5">Branch name <span className="text-error">*</span></label>
              <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Downtown" className={iCls(false)} /></div>
            <div><label className="block text-sm font-medium text-ink mb-1.5">Phone number <span className="text-error">*</span></label>
              <div className="flex items-center border border-hairline rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary">
                <span className="px-3 text-sm text-muted bg-surface-soft border-r border-hairline">+1</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" maxLength={14}
                  className="flex-1 h-9 px-3 text-sm bg-canvas text-ink focus:outline-none" />
              </div>
            </div>
            <div><label className="block text-sm font-medium text-ink mb-1.5">City / Timezone <span className="text-error">*</span></label>
              <CityCombobox value={city} onChange={setCity} disabled={false} /></div>
          </div>
          <div className="flex gap-3 px-6 pb-5">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 h-9 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
              {saving ? "Creating…" : "Create branch"}
            </button>
            <button onClick={onClose} className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft">Cancel</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Working hours editor ──────────────────────────────────────────────────────

function HoursEditor({ agentId, canEdit }: { agentId: number; canEdit: boolean }) {
  const qc = useQueryClient();

  const { data: hours = [], isLoading } = useQuery({
    queryKey: ["business-hours", agentId],
    queryFn: () => bhApi.list(agentId),
    staleTime: 5 * 60 * 1000,
  });

  const [rows, setRows] = useState<{ day: number; start: string; end: string }[]>([]);
  const [dirty, setDirty] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setRows(
        [...hours]
          .sort((a, b) => a.day_of_week - b.day_of_week)
          .map((h) => ({ day: h.day_of_week, start: h.open_time.slice(0, 5), end: h.closed_time.slice(0, 5) }))
      );
      setDirty(false);
    }
  }, [hours, isLoading]);

  const usedDays = new Set(rows.map((r) => r.day));
  const availableDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !usedDays.has(d));

  function addDay(day: number) {
    const newRows = [...rows, { day, start: "09:00", end: "17:00" }].sort((a, b) => a.day - b.day);
    setRows(newRows); setDirty(true); setShowPicker(false);
  }

  function removeDay(day: number) { setRows((r) => r.filter((x) => x.day !== day)); setDirty(true); }

  function updateRow(day: number, field: "start" | "end", value: string) {
    setRows((r) => r.map((x) => x.day === day ? { ...x, [field]: value } : x));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true); setErr(null);
    try {
      await bhApi.set(agentId, rows.map((r) => ({ day_of_week: r.day, open_time: r.start + ":00", closed_time: r.end + ":00" })));
      await qc.invalidateQueries({ queryKey: ["business-hours", agentId] });
      setDirty(false);
      setToast("Working hours saved.");
      setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not save hours."));
    } finally { setSaving(false); }
  }

  function handleCancel() {
    setRows(
      [...hours].sort((a, b) => a.day_of_week - b.day_of_week)
        .map((h) => ({ day: h.day_of_week, start: h.open_time.slice(0, 5), end: h.closed_time.slice(0, 5) }))
    );
    setDirty(false); setErr(null);
  }

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div>
      {toast && <p className="text-sm text-success mb-3">{toast}</p>}
      {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">{err}</p>}

      <div className="flex flex-col gap-2 mb-3">
        {rows.length === 0 && <p className="text-sm text-muted">No hours set — branch is always closed.</p>}
        {rows.map((row) => (
          <div key={row.day} className="flex items-center gap-3">
            <span className="w-8 text-sm font-medium text-ink">{DAY_NAMES[row.day]}</span>
            <input type="time" value={row.start} onChange={(e) => updateRow(row.day, "start", e.target.value)}
              disabled={!canEdit} className={`h-8 px-2 text-sm border border-hairline rounded-md bg-canvas ${!canEdit ? "opacity-60" : "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"}`} />
            <span className="text-muted text-sm">–</span>
            <input type="time" value={row.end} onChange={(e) => updateRow(row.day, "end", e.target.value)}
              disabled={!canEdit} className={`h-8 px-2 text-sm border border-hairline rounded-md bg-canvas ${!canEdit ? "opacity-60" : "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"}`} />
            {canEdit && (
              <button onClick={() => removeDay(row.day)} className="text-muted hover:text-error transition-colors"><XIcon size={14} /></button>
            )}
          </div>
        ))}
      </div>

      {canEdit && availableDays.length > 0 && (
        <div className="relative mb-4">
          <button onClick={() => setShowPicker((p) => !p)}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline">
            <PlusIcon size={12} /> Add day
          </button>
          {showPicker && (
            <div className="absolute top-full left-0 mt-1 flex flex-wrap gap-1 bg-canvas border border-hairline rounded-md p-2 shadow-md z-10">
              {availableDays.map((d) => (
                <button key={d} onClick={() => addDay(d)}
                  className="px-2 py-1 text-xs font-medium bg-surface-soft hover:bg-primary/10 hover:text-primary rounded transition-colors">
                  {DAY_NAMES[d]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {canEdit && dirty && (
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="h-8 px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
            {saving ? "Saving…" : "Save hours"}
          </button>
          <button onClick={handleCancel} className="h-8 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft">Cancel</button>
        </div>
      )}
    </div>
  );
}

// ── Branch closures (days off) editor ─────────────────────────────────────────

function ClosuresEditor({ agentId, canEdit }: { agentId: number; canEdit: boolean }) {
  const qc = useQueryClient();

  const { data: closures = [], isLoading } = useQuery({
    queryKey: ["days-off", agentId],
    queryFn: () => daysOffApi.list(agentId),
    staleTime: 5 * 60 * 1000,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: number) => daysOffApi.delete(id, agentId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["days-off", agentId] }); setToast("Closure removed."); setTimeout(() => setToast(null), 3000); },
  });

  const createMut = useMutation({
    mutationFn: () => daysOffApi.create(agentId, { name, start_date: start, end_date: end }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["days-off", agentId] });
      setShowAdd(false); setName(""); setStart(""); setEnd(""); setErr(null);
      setToast("Closure added."); setTimeout(() => setToast(null), 3000);
    },
    onError: (e: unknown) => {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not add closure."));
    },
  });

  function handleSave() {
    if (!name.trim()) { setErr("Please enter a name for this closure."); return; }
    if (!start) { setErr("Please select a start date."); return; }
    if (!end) { setErr("Please select an end date."); return; }
    if (end < start) { setErr("End date must be on or after the start date."); return; }
    setErr(null); createMut.mutate();
  }

  function fmtDate(d: string) {
    if (!d) return "";
    const [y, m, dy] = d.split("-").map(Number);
    return new Date(y, m - 1, dy).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div>
      {toast && <p className="text-sm text-success mb-3">{toast}</p>}
      {closures.length === 0 && !showAdd && <p className="text-sm text-muted mb-3">No closures scheduled.</p>}

      <div className="flex flex-col gap-2 mb-3">
        {(closures as DayOff[]).map((c) => {
          const same = c.start_date === c.end_date;
          const dateStr = same ? fmtDate(c.start_date) : `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`;
          return (
            <div key={c.id} className="flex items-center justify-between py-2 border-b border-hairline last:border-0">
              <div>
                <span className="text-sm font-medium text-ink">{c.name}</span>
                <span className="text-xs text-muted ml-2">{dateStr}</span>
              </div>
              {canEdit && (
                <button onClick={() => deleteMut.mutate(c.id)} className="text-muted hover:text-error transition-colors p-1">
                  <XIcon size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && showAdd && (
        <div className="bg-surface-soft rounded-md p-4 mb-3 flex flex-col gap-3">
          {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}
          <div><label className="block text-xs font-medium text-ink mb-1">Name <span className="text-error">*</span></label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Holiday closure" className={iCls(false)} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-ink mb-1">Start date <span className="text-error">*</span></label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={iCls(false)} /></div>
            <div><label className="block text-xs font-medium text-ink mb-1">End date <span className="text-error">*</span></label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={iCls(false)} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={createMut.isPending}
              className="h-8 px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
              {createMut.isPending ? "Adding…" : "Add closure"}
            </button>
            <button onClick={() => { setShowAdd(false); setName(""); setStart(""); setEnd(""); setErr(null); }}
              className="h-8 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft">Cancel</button>
          </div>
        </div>
      )}

      {canEdit && !showAdd && (
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
          <PlusIcon size={12} /> Add closure
        </button>
      )}
    </div>
  );
}

// ── Branch detail panel ───────────────────────────────────────────────────────

function BranchDetail({ agent, canManageBranches, canManageSchedules, onBack, onUpdated, onDeleted }:
  { agent: AgentResponse; canManageBranches: boolean; canManageSchedules: boolean;
    onBack: () => void; onUpdated: (a: AgentResponse) => void; onDeleted: (id: number) => void }) {
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState(agent.location_name || "");
  const [phone, setPhone] = useState(stripE164(agent.phone_number));
  const [city, setCity] = useState(TIMEZONE_CITY[agent.timezone] || agent.timezone || "");
  const [err, setErr] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const orig = { name: agent.location_name || "", phone: stripE164(agent.phone_number), city: TIMEZONE_CITY[agent.timezone] || agent.timezone || "" };

  function handleCancel() { setName(orig.name); setPhone(orig.phone); setCity(orig.city); setEditMode(false); setErr(null); }

  function handleSaveClick() {
    if (!name.trim()) { setErr("Branch name cannot be empty."); return; }
    const pe = validatePhone(phone); if (pe) { setErr(pe); return; }
    if (!CITY_TIMEZONE[city]) { setErr("Please select a valid city from the suggestions."); return; }
    setErr(null); setShowConfirm(true);
  }

  async function handleConfirmSave() {
    setShowConfirm(false); setSaving(true);
    try {
      const updated = await agentsApi.update(agent.id, {
        agent_name: name.trim(), location_name: name.trim(),
        phone_number: buildPhone(phone) ?? "",
        timezone: CITY_TIMEZONE[city],
        model: agent.model,
        sms_welcome_message: agent.sms_welcome_message ?? "",
        sms_post_welcome_behavior: agent.sms_post_welcome_behavior ?? "ai",
      });
      onUpdated(updated); setEditMode(false);
      setToast("Branch settings saved."); setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not save changes."));
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${agent.location_name || agent.agent_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try { await agentsApi.delete(agent.id); onDeleted(agent.id); }
    catch { setToast("Could not delete branch."); }
    finally { setDeleting(false); }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 relative">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">{toast}</div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-muted hover:text-ink transition-colors"><ChevronLeftIcon /></button>
        <h2 className="font-display text-xl font-semibold text-ink">{agent.location_name || agent.agent_name}</h2>
      </div>

      <div className="max-w-2xl flex flex-col gap-6">
        {/* Basics card */}
        <div className="bg-canvas rounded-xl border border-hairline p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-ink">Branch details</h3>
            {canManageBranches && !editMode && (
              <button onClick={() => setEditMode(true)}
                className="flex items-center gap-1.5 text-sm text-primary hover:underline"><EditIcon size={13} /> Edit</button>
            )}
          </div>
          {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">{err}</p>}
          <div className="flex flex-col gap-4">
            <div><label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Branch name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!editMode} className={iCls(!editMode)} /></div>
            <div><label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Phone number</label>
              <div className={`flex items-center border rounded-md overflow-hidden ${editMode ? "border-hairline focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary" : "border-hairline opacity-60"}`}>
                <span className="px-3 text-sm text-muted bg-surface-soft border-r border-hairline">+1</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!editMode} placeholder="(555) 000-0000" maxLength={14}
                  className="flex-1 h-9 px-3 text-sm bg-canvas text-ink focus:outline-none" />
              </div>
            </div>
            <div><label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Location / Timezone</label>
              <CityCombobox value={city} onChange={setCity} disabled={!editMode} /></div>
          </div>
          {editMode && (
            <div className="flex gap-2 mt-4">
              <button onClick={handleSaveClick} disabled={saving}
                className="h-9 px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button onClick={handleCancel} className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft">Cancel</button>
            </div>
          )}
        </div>

        {/* Working hours */}
        <div className="bg-canvas rounded-xl border border-hairline p-5">
          <h3 className="font-semibold text-ink mb-1">Working hours</h3>
          <p className="text-xs text-muted mb-4">Set which days and hours this branch accepts appointments.</p>
          <HoursEditor agentId={agent.id} canEdit={canManageSchedules} />
        </div>

        {/* Branch closures */}
        <div className="bg-canvas rounded-xl border border-hairline p-5">
          <h3 className="font-semibold text-ink mb-1">Branch closures</h3>
          <p className="text-xs text-muted mb-4">Add branch-wide days off — no appointments during these periods.</p>
          <ClosuresEditor agentId={agent.id} canEdit={canManageSchedules} />
        </div>

        {/* Danger zone */}
        {canManageBranches && (
          <div className="border border-red-200 rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-ink mb-0.5">Delete this branch</p>
              <p className="text-sm text-muted">Permanently removes this branch and all its data. Cannot be undone.</p>
            </div>
            <button onClick={handleDelete} disabled={deleting}
              className="h-9 px-4 bg-error hover:bg-red-700 text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors flex-shrink-0 ml-4">
              {deleting ? "Deleting…" : "Delete branch"}
            </button>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <>
          <div className="fixed inset-0 bg-black/20 z-50" onClick={() => setShowConfirm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-canvas rounded-xl shadow-lg w-full max-w-sm pointer-events-auto p-6">
              <h3 className="font-display font-semibold text-ink mb-2">Save changes?</h3>
              <p className="text-sm text-muted mb-5">
                You're about to update the settings for <strong>{agent.location_name || agent.agent_name}</strong>. Changes take effect immediately.
              </p>
              <div className="flex gap-3">
                <button onClick={handleConfirmSave}
                  className="flex-1 h-9 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md transition-colors">Save changes</button>
                <button onClick={() => setShowConfirm(false)}
                  className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft">Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Branch card ───────────────────────────────────────────────────────────────

function BranchCard({ agent, hours, canManage, onSelect, onDelete }:
  { agent: AgentResponse; hours: BusinessHourResponse[]; canManage: boolean;
    onSelect: () => void; onDelete: () => void }) {
  const isOpen = isBranchOpen(agent.timezone, hours);
  const initials = (agent.location_name || agent.agent_name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div onClick={onSelect}
      className="bg-canvas rounded-xl border border-hairline p-5 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center text-sm font-semibold text-primary flex-shrink-0">
            {initials}
          </div>
          <div>
            <div className="font-semibold text-ink">{agent.location_name || agent.agent_name}</div>
            <div className={`text-xs font-medium flex items-center gap-1 mt-0.5 ${isOpen ? "text-success" : "text-muted"}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOpen ? "bg-success" : "bg-muted"}`} />
              {isOpen ? "Open now" : "Closed"}
            </div>
          </div>
        </div>
        {canManage && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 text-muted hover:text-error p-1 rounded transition-all">
            <TrashIcon size={14} />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1.5 text-sm text-muted">
        {agent.location_name && <div className="flex items-center gap-2"><LocationIcon />{agent.location_name}</div>}
        {agent.phone_number && <div className="flex items-center gap-2"><PhoneIcon />{agent.phone_number}</div>}
        {agent.timezone && <div className="flex items-center gap-2"><ClockIcon />{TIMEZONE_CITY[agent.timezone] || agent.timezone}</div>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Branches() {
  const { me, agents, refetchAgents } = useAuth();
  const { setActiveAgent } = useAgent();
  const qc = useQueryClient();

  const canManageBranches = me?.is_owner || (me?.permissions ?? []).includes("manage_branches");
  const canManageSchedules = me?.is_owner || (me?.permissions ?? []).includes("manage_schedules");

  const [selected, setSelected] = useState<AgentResponse | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<AgentResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load business hours for all branches (for open/closed status on cards)
  const hoursQueries = useQuery({
    queryKey: ["all-branch-hours", agents.map((a) => a.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        agents.map((a) => bhApi.list(a.id).catch(() => [] as BusinessHourResponse[]))
      );
      return Object.fromEntries(agents.map((a, i) => [a.id, results[i]])) as Record<number, BusinessHourResponse[]>;
    },
    enabled: agents.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  async function handleDelete(agent: AgentResponse) {
    setDeleting(true);
    try {
      await agentsApi.delete(agent.id);
      refetchAgents();
      qc.invalidateQueries({ queryKey: ["agents"] });
      if (selected?.id === agent.id) setSelected(null);
      setDeleteConfirm(null);
    } catch { /* handled below */ }
    finally { setDeleting(false); }
  }

  if (selected) {
    return (
      <BranchDetail
        agent={selected}
        canManageBranches={canManageBranches}
        canManageSchedules={canManageSchedules}
        onBack={() => setSelected(null)}
        onUpdated={(updated) => {
          refetchAgents();
          setSelected(updated);
          if (updated.id === selected.id) setActiveAgent(updated);
        }}
        onDeleted={() => { refetchAgents(); setSelected(null); }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-muted">{agents.length} {agents.length === 1 ? "branch" : "branches"}</p>
        {canManageBranches && (
          <button onClick={() => setShowNew(true)}
            className="h-9 px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md transition-colors flex items-center gap-1.5">
            <PlusIcon size={13} /> New branch
          </button>
        )}
      </div>

      {agents.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center">
          <p className="font-semibold text-ink mb-1">No branches yet</p>
          <p className="text-sm text-muted">Add your first branch to get started.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <BranchCard key={agent.id} agent={agent}
            hours={hoursQueries.data?.[agent.id] ?? []}
            canManage={canManageBranches}
            onSelect={() => setSelected(agent)}
            onDelete={() => setDeleteConfirm(agent)}
          />
        ))}
      </div>

      {/* Modals */}
      {showNew && (
        <NewBranchModal onClose={() => setShowNew(false)} onCreated={() => { refetchAgents(); setShowNew(false); }} />
      )}

      {deleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => !deleting && setDeleteConfirm(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-canvas rounded-xl shadow-lg w-full max-w-sm pointer-events-auto p-6">
              <h3 className="font-display font-semibold text-ink mb-2">Delete branch?</h3>
              <p className="text-sm text-muted mb-5">
                Permanently delete <strong>{deleteConfirm.location_name || deleteConfirm.agent_name}</strong> and all its employees, services, and appointments?
              </p>
              <div className="flex gap-3">
                <button onClick={() => handleDelete(deleteConfirm)} disabled={deleting}
                  className="flex-1 h-9 bg-error hover:bg-red-700 text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
                  {deleting ? "Deleting…" : "Delete"}
                </button>
                <button onClick={() => setDeleteConfirm(null)} disabled={deleting}
                  className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft">Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Icons + helpers ───────────────────────────────────────────────────────────

const iCls = (disabled: boolean) =>
  `w-full h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink placeholder:text-muted transition-colors ${disabled ? "opacity-60 cursor-not-allowed" : "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"}`;

function XIcon({ size = 16 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function PlusIcon({ size = 14 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function TrashIcon({ size = 14 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function EditIcon({ size = 14 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function ChevronLeftIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>; }
function LocationIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>; }
function PhoneIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>; }
function ClockIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>; }
