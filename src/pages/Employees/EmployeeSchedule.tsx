/**
 * Schedule panel — Working Hours / Breaks / Days Off tabs.
 * Mounted inside an employee card when the "Schedule" button is clicked.
 *
 * Breaks are stored as one DB row per (employee, agent, day_of_week), but the
 * UI groups rows sharing the same time+reason into a single row with day pills
 * (matching the old _breakRowHtml + _populateBreaksGrid logic).
 * On save: delete ALL existing blocked-times, recreate from current UI state.
 */

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { employeesApi } from "./api";
import { formatApiError } from "../../lib/errors";
import { DAY_NAMES, BREAK_DAY_LABELS, type BreakGroup, type ApiError } from "./types";

const iCls = "h-8 px-2 text-sm border border-hairline rounded-md bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

// ── Working Hours tab ─────────────────────────────────────────────────────────

function HoursTab({ empId, agentId, canEdit }: { empId: number; agentId: number; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: serverHours = [], isLoading } = useQuery({
    queryKey: ["emp-hours", empId, agentId],
    queryFn: () => employeesApi.getHours(empId, agentId),
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
      setRows([...serverHours].sort((a, b) => a.day_of_week - b.day_of_week)
        .map(h => ({ day: h.day_of_week, start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) })));
      setDirty(false);
    }
  }, [serverHours, isLoading]);

  const usedDays = new Set(rows.map(r => r.day));
  const availableDays = [0, 1, 2, 3, 4, 5, 6].filter(d => !usedDays.has(d));

  async function handleSave() {
    setSaving(true); setErr(null);
    try {
      await employeesApi.setHours(empId, agentId, rows.map(r => ({
        day_of_week: r.day, start_time: r.start + ":00", end_time: r.end + ":00",
      })));
      qc.invalidateQueries({ queryKey: ["emp-hours", empId, agentId] });
      setDirty(false);
      setToast("Working hours saved."); setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not save hours."));
    } finally { setSaving(false); }
  }

  if (isLoading) return <p className="text-sm text-muted py-2">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      {toast && <p className="text-xs text-success">{toast}</p>}
      {err && <p className="text-xs text-error bg-red-50 border border-red-200 rounded px-2 py-1">{err}</p>}

      {rows.length === 0 && <p className="text-xs text-muted">No hours set.</p>}
      {rows.map(row => (
        <div key={row.day} className="flex items-center gap-2">
          <span className="text-xs font-medium text-ink w-7">{DAY_NAMES[row.day]}</span>
          <input type="time" value={row.start} disabled={!canEdit} className={iCls}
            onChange={e => { setRows(r => r.map(x => x.day === row.day ? { ...x, start: e.target.value } : x)); setDirty(true); }} />
          <span className="text-xs text-muted">–</span>
          <input type="time" value={row.end} disabled={!canEdit} className={iCls}
            onChange={e => { setRows(r => r.map(x => x.day === row.day ? { ...x, end: e.target.value } : x)); setDirty(true); }} />
          {canEdit && (
            <button onClick={() => { setRows(r => r.filter(x => x.day !== row.day)); setDirty(true); }}
              className="text-muted hover:text-error text-sm leading-none">×</button>
          )}
        </div>
      ))}

      {canEdit && availableDays.length > 0 && (
        <div className="relative">
          <button onClick={() => setShowPicker(p => !p)} className="text-xs text-primary hover:underline">+ Add day</button>
          {showPicker && (
            <div className="absolute top-full left-0 mt-1 flex flex-wrap gap-1 bg-canvas border border-hairline rounded p-2 shadow z-10">
              {availableDays.map(d => (
                <button key={d} onClick={() => { setRows(r => [...r, { day: d, start: "09:00", end: "17:00" }].sort((a, b) => a.day - b.day)); setDirty(true); setShowPicker(false); }}
                  className="px-2 py-0.5 text-xs bg-surface-soft hover:bg-primary/10 hover:text-primary rounded transition-colors">
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
            className="h-7 px-3 bg-primary hover:bg-primary-hover text-white text-xs font-medium rounded disabled:opacity-60 transition-colors">
            {saving ? "Saving…" : "Save hours"}
          </button>
          <button onClick={() => { setRows([...serverHours].sort((a,b)=>a.day_of_week-b.day_of_week).map(h=>({day:h.day_of_week,start:h.start_time.slice(0,5),end:h.end_time.slice(0,5)}))); setDirty(false); setErr(null); }}
            className="h-7 px-3 border border-hairline text-xs text-ink rounded hover:bg-surface-soft">Close</button>
        </div>
      )}
    </div>
  );
}

// ── Breaks tab ────────────────────────────────────────────────────────────────

function BreaksTab({ empId, agentId, canEdit }: { empId: number; agentId: number; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: serverBreaks = [], isLoading } = useQuery({
    queryKey: ["emp-breaks", empId, agentId],
    queryFn: () => employeesApi.getBlockedTimes(empId, agentId),
    staleTime: 5 * 60 * 1000,
  });

  const [groups, setGroups] = useState<BreakGroup[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading) {
      const raw = [...serverBreaks].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
      const gMap = new Map<string, BreakGroup>();
      for (const bt of raw) {
        const key = `${bt.start_time}|${bt.end_time}|${bt.reason || ""}`;
        if (!gMap.has(key)) gMap.set(key, { start: bt.start_time.slice(0, 5), end: bt.end_time.slice(0, 5), reason: bt.reason || "", days: [], ids: [] });
        const g = gMap.get(key)!;
        g.days.push(bt.day_of_week);
        g.ids.push(bt.id);
      }
      setGroups([...gMap.values()]);
      setDirty(false);
    }
  }, [serverBreaks, isLoading]);

  function addGroup() {
    setGroups(g => [...g, { start: "09:00", end: "10:00", reason: "", days: [], ids: [] }]);
    setDirty(true);
  }

  function updateGroup(i: number, patch: Partial<BreakGroup>) {
    setGroups(g => g.map((x, j) => j === i ? { ...x, ...patch } : x));
    setDirty(true);
  }

  function toggleDay(i: number, day: number) {
    setGroups(g => g.map((x, j) => {
      if (j !== i) return x;
      const days = x.days.includes(day) ? x.days.filter(d => d !== day) : [...x.days, day];
      return { ...x, days };
    }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true); setErr(null);
    try {
      const existingIds = serverBreaks.map(b => b.id);
      if (existingIds.length) await Promise.all(existingIds.map(id => employeesApi.deleteBlockedTime(empId, agentId, id)));
      // Expand groups into per-day rows
      const creates: { day_of_week: number; start_time: string; end_time: string; reason?: string }[] = [];
      for (const g of groups) {
        for (const day of g.days) {
          creates.push({ day_of_week: day, start_time: g.start + ":00", end_time: g.end + ":00", reason: g.reason || undefined });
        }
      }
      await Promise.all(creates.map(p => employeesApi.addBlockedTime(empId, agentId, p)));
      qc.invalidateQueries({ queryKey: ["emp-breaks", empId, agentId] });
      setDirty(false);
      setToast("Breaks saved."); setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not save breaks."));
    } finally { setSaving(false); }
  }

  if (isLoading) return <p className="text-sm text-muted py-2">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      {toast && <p className="text-xs text-success">{toast}</p>}
      {err && <p className="text-xs text-error bg-red-50 border border-red-200 rounded px-2 py-1">{err}</p>}
      {groups.length === 0 && <p className="text-xs text-muted">No breaks set.</p>}

      {groups.map((g, i) => (
        <div key={i} className="bg-surface-soft rounded p-3 flex flex-col gap-2">
          {/* Day pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {BREAK_DAY_LABELS.map((lbl, d) => (
              <button key={d} type="button" disabled={!canEdit}
                onClick={() => toggleDay(i, d)}
                className={`px-2 py-0.5 text-xs rounded-pill font-medium transition-colors ${g.days.includes(d) ? "bg-primary text-white" : "bg-surface-strong text-muted hover:bg-primary/10 hover:text-primary"}`}>
                {lbl}
              </button>
            ))}
          </div>
          {/* Time range */}
          <div className="flex items-center gap-2">
            <input type="time" value={g.start} disabled={!canEdit} className={iCls}
              onChange={e => updateGroup(i, { start: e.target.value })} />
            <span className="text-xs text-muted">–</span>
            <input type="time" value={g.end} disabled={!canEdit} className={iCls}
              onChange={e => updateGroup(i, { end: e.target.value })} />
          </div>
          {/* Reason + remove */}
          <div className="flex items-center gap-2">
            <input type="text" value={g.reason} disabled={!canEdit} placeholder="Reason (optional)" className={`${iCls} flex-1`}
              onChange={e => updateGroup(i, { reason: e.target.value })} />
            {canEdit && (
              <button onClick={() => { setGroups(g => g.filter((_, j) => j !== i)); setDirty(true); }}
                className="text-muted hover:text-error text-sm leading-none">×</button>
            )}
          </div>
        </div>
      ))}

      {canEdit && <button onClick={addGroup} className="text-xs text-primary hover:underline">+ Add break</button>}

      {canEdit && dirty && (
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="h-7 px-3 bg-primary hover:bg-primary-hover text-white text-xs font-medium rounded disabled:opacity-60 transition-colors">
            {saving ? "Saving…" : "Save breaks"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Days Off tab ──────────────────────────────────────────────────────────────

function DaysOffTab({ empId, agentId, canEdit }: { empId: number; agentId: number; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: serverDaysOff = [], isLoading } = useQuery({
    queryKey: ["emp-daysoff", empId, agentId],
    queryFn: () => employeesApi.getDaysOff(empId, agentId),
    staleTime: 5 * 60 * 1000,
  });

  const [rows, setRows] = useState<{ id: number | null; name: string; start: string; end: string }[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setRows([...serverDaysOff].sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""))
        .map(d => ({ id: d.id, name: d.name, start: d.start_date, end: d.end_date })));
      setDirty(false);
    }
  }, [serverDaysOff, isLoading]);

  async function handleSave() {
    for (const r of rows) {
      if (!r.name.trim()) { setErr("All entries need a name."); return; }
      if (!r.start || !r.end) { setErr("All entries need start and end dates."); return; }
      if (r.end < r.start) { setErr("End date must be on or after start date."); return; }
    }
    setSaving(true); setErr(null);
    try {
      const existingIds = serverDaysOff.map(d => d.id);
      if (existingIds.length) await Promise.all(existingIds.map(id => employeesApi.deleteDayOff(empId, agentId, id)));
      await Promise.all(rows.map(r => employeesApi.addDayOff(empId, agentId, { name: r.name.trim(), start_date: r.start, end_date: r.end })));
      qc.invalidateQueries({ queryKey: ["emp-daysoff", empId, agentId] });
      setDirty(false);
      setToast("Days off saved."); setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not save days off."));
    } finally { setSaving(false); }
  }

  if (isLoading) return <p className="text-sm text-muted py-2">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      {toast && <p className="text-xs text-success">{toast}</p>}
      {err && <p className="text-xs text-error bg-red-50 border border-red-200 rounded px-2 py-1">{err}</p>}
      {rows.length === 0 && <p className="text-xs text-muted">No days off set.</p>}

      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="text" value={r.name} disabled={!canEdit} placeholder="Name (required)"
            className={`${iCls} flex-1`}
            onChange={e => { setRows(rs => rs.map((x, j) => j === i ? { ...x, name: e.target.value } : x)); setDirty(true); }} />
          <input type="date" value={r.start} disabled={!canEdit} className={iCls}
            onChange={e => { setRows(rs => rs.map((x, j) => j === i ? { ...x, start: e.target.value } : x)); setDirty(true); }} />
          <span className="text-xs text-muted">–</span>
          <input type="date" value={r.end} disabled={!canEdit} className={iCls}
            onChange={e => { setRows(rs => rs.map((x, j) => j === i ? { ...x, end: e.target.value } : x)); setDirty(true); }} />
          {canEdit && (
            <button onClick={() => { setRows(rs => rs.filter((_, j) => j !== i)); setDirty(true); }}
              className="text-muted hover:text-error text-sm leading-none">×</button>
          )}
        </div>
      ))}

      {canEdit && <button onClick={() => { setRows(rs => [...rs, { id: null, name: "", start: "", end: "" }]); setDirty(true); }}
        className="text-xs text-primary hover:underline">+ Add day off</button>}

      {canEdit && dirty && (
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="h-7 px-3 bg-primary hover:bg-primary-hover text-white text-xs font-medium rounded disabled:opacity-60 transition-colors">
            {saving ? "Saving…" : "Save days off"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Outer schedule panel ──────────────────────────────────────────────────────

type SchedTab = "hours" | "breaks" | "daysoff";

export function EmployeeSchedule({ empId, agentId, canEdit }: { empId: number; agentId: number; canEdit: boolean }) {
  const [tab, setTab] = useState<SchedTab>("hours");

  return (
    <div>
      <div className="flex border-b border-hairline mb-4">
        {(["hours", "breaks", "daysoff"] as SchedTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-2 pt-2 mr-4 text-xs font-medium border-b-2 transition-colors capitalize ${tab === t ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"}`}>
            {t === "hours" ? "Working Hours" : t === "breaks" ? "Breaks" : "Days Off"}
          </button>
        ))}
      </div>
      {tab === "hours"   && <HoursTab   empId={empId} agentId={agentId} canEdit={canEdit} />}
      {tab === "breaks"  && <BreaksTab  empId={empId} agentId={agentId} canEdit={canEdit} />}
      {tab === "daysoff" && <DaysOffTab empId={empId} agentId={agentId} canEdit={canEdit} />}
    </div>
  );
}
