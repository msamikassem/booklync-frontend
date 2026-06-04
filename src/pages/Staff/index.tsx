import "../Calendar/Calendar.css";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { staffCalApi } from "./api";
import { DayView } from "../Calendar/DayView";
import { WeekView } from "../Calendar/WeekView";
import { MonthView } from "../Calendar/MonthView";
import { AppointmentDrawer } from "../Appointments/AppointmentDrawer";
import {
  calToISODate, calFromISODate, calAddDays, calWeekStart,
  calMonthStart, calMonthEnd, calAgentNow, calFormatDateLabel,
} from "../Calendar/utils";
import type { AgentTimeRef } from "../Calendar/utils";
import type { CalEmployee, CalWorkingHour, CalBreak, CalDayOff } from "../Calendar/api";
import type { AppointmentDetailResponse } from "../Calendar/types";

type CalView = "day" | "week" | "month";

const STAFF_BRANCH_KEY = "staff_active_agent_id";

/** Range to fetch — widened ±1 day so the timezone re-bucket can't drop edge events. */
function computeCalRange(view: CalView, d: Date): { dateFrom: string; dateTo: string } {
  const widen = (start: Date, end: Date) => ({
    dateFrom: calToISODate(calAddDays(start, -1)),
    dateTo:   calToISODate(calAddDays(end, 1)),
  });
  if (view === "day") return widen(d, d);
  if (view === "week") {
    const ws = calWeekStart(d);
    return widen(ws, calAddDays(ws, 6));
  }
  const ms = calMonthStart(d);
  const me = calMonthEnd(d);
  const gridStart = calWeekStart(ms);
  const lastDow   = (me.getDay() + 6) % 7;
  const gridEnd   = lastDow === 6 ? me : calAddDays(me, 6 - lastDow);
  return widen(gridStart, gridEnd);
}

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("") || "—";
}

export default function StaffDashboard() {
  const { logout } = useAuth();
  const [view, setView] = useState<CalView>("day");
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  // The branch the picker has chosen (null = let the server pick the primary).
  const [pickedAgentId, setPickedAgentId] = useState<number | null>(() => {
    const s = localStorage.getItem(STAFF_BRANCH_KEY);
    return s ? Number(s) : null;
  });

  // Profile drives the employee identity, branch list, and timezone.
  // A persisted branch override can be stale for this user (reassigned, shared
  // terminal); /staff/me 403s on a branch they can't reach — fall back to the
  // server-picked primary instead of locking them out (mirrors AuthContext).
  const { data: me, isLoading: meLoading, isError: meError } = useQuery({
    queryKey: ["staff-me", pickedAgentId],
    queryFn: async () => {
      try {
        return await staffCalApi.me(pickedAgentId);
      } catch (e) {
        if ((e as { status?: number }).status === 403 && pickedAgentId != null) {
          return staffCalApi.me(null);
        }
        throw e;
      }
    },
    staleTime: 0,
  });

  // Persist whatever branch the server actually resolved (not the requested
  // override), so a stale/invalid localStorage value self-heals on the next load.
  // The picker + every other query already read `me.agent_id`, so no state sync
  // is needed here — localStorage only.
  useEffect(() => {
    if (me) localStorage.setItem(STAFF_BRANCH_KEY, String(me.agent_id));
  }, [me]);

  // The server resolves the effective branch (validates the override / picks primary).
  const agentId = me?.agent_id ?? null;
  const tz = me?.timezone ?? "UTC";
  const empId = me?.employee_id ?? 0;

  const employee = useMemo<CalEmployee | null>(() => me ? {
    id: me.employee_id, name: me.employee_name,
    profile_picture_url: me.profile_picture_url, active: true,
  } : null, [me]);
  const employees = useMemo(() => employee ? [employee] : [], [employee]);

  // ── Pill-slider (view switcher) ───────────────────────────────────────────
  const pillGroupRef = useRef<HTMLDivElement>(null);
  const [sliderStyle, setSliderStyle] = useState<React.CSSProperties>({ left: 0, width: 0 });
  useEffect(() => {
    const group = pillGroupRef.current;
    if (!group) return;
    const active = group.querySelector(".cal-pill--active") as HTMLElement | null;
    if (!active) return;
    const gr = group.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    setSliderStyle({ left: ar.left - gr.left, width: ar.width });
  }, [view, me]);

  // ── Agent clock ───────────────────────────────────────────────────────────
  const [agentTimeRef, setAgentTimeRef] = useState<AgentTimeRef | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!agentId) return;
    staffCalApi.agentTime(agentId).then(ref => { if (ref) setAgentTimeRef(ref); });
  }, [agentId]);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const agentNow = calAgentNow(agentTimeRef);
  const todayISO = agentNow?.dateISO ?? calToISODate(new Date());

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = useCallback((dir: 1 | -1) => {
    setCurrentDate(d => {
      if (view === "day")  return calAddDays(d, dir);
      if (view === "week") return calAddDays(d, 7 * dir);
      return new Date(d.getFullYear(), d.getMonth() + dir, 1);
    });
  }, [view]);
  const goToday = useCallback(async () => {
    if (agentId) {
      const ref = await staffCalApi.agentTime(agentId);
      if (ref) setAgentTimeRef(ref);
    }
    setCurrentDate(calFromISODate(todayISO));
  }, [agentId, todayISO]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { dateFrom, dateTo } = useMemo(() => computeCalRange(view, currentDate), [view, currentDate]);

  const { data: appointments = [], refetch: refetchAppts } = useQuery({
    queryKey: ["staff-appts", agentId, dateFrom, dateTo],
    queryFn: () => staffCalApi.appointments(agentId as number, dateFrom, dateTo),
    enabled: !!agentId, staleTime: 0,
  });
  const { data: workingHours = [] } = useQuery({
    queryKey: ["staff-hours", agentId], queryFn: () => staffCalApi.workingHours(agentId as number),
    enabled: !!agentId, staleTime: 5 * 60_000,
  });
  const { data: blockedTimes = [] } = useQuery({
    queryKey: ["staff-breaks", agentId], queryFn: () => staffCalApi.blockedTimes(agentId as number),
    enabled: !!agentId, staleTime: 5 * 60_000,
  });
  const { data: daysOffAll = [] } = useQuery({
    queryKey: ["staff-daysoff", agentId], queryFn: () => staffCalApi.daysOff(agentId as number),
    enabled: !!agentId, staleTime: 5 * 60_000,
  });
  const { data: businessHours = [] } = useQuery({
    queryKey: ["staff-bh", agentId], queryFn: () => staffCalApi.businessHours(agentId as number),
    enabled: !!agentId, staleTime: 5 * 60_000,
  });

  // Split the combined days-off feed: branch-wide closures vs the user's own.
  const branchDaysOff = useMemo(() => daysOffAll.filter(d => d.employee_id == null), [daysOffAll]);
  const personalDaysOff = useMemo(() => daysOffAll.filter(d => d.employee_id != null), [daysOffAll]);

  const hoursMap   = useMemo(() => new Map<number, CalWorkingHour[]>([[empId, workingHours]]), [empId, workingHours]);
  const breaksMap  = useMemo(() => new Map<number, CalBreak[]>([[empId, blockedTimes]]), [empId, blockedTimes]);
  const daysOffMap = useMemo(() => new Map<number, CalDayOff[]>([[empId, personalDaysOff]]), [empId, personalDaysOff]);

  const [viewAppt, setViewAppt] = useState<AppointmentDetailResponse | null>(null);

  const dateLabel = calFormatDateLabel(currentDate, view, todayISO);
  const dateInputVal = calToISODate(view === "week" ? calWeekStart(currentDate) : currentDate);

  const changeBranch = (id: number) => {
    setPickedAgentId(id);
    localStorage.setItem(STAFF_BRANCH_KEY, String(id));
  };

  const noop = useCallback(() => {}, []);

  return (
    <div className="flex flex-col h-screen bg-surface-soft">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-5 h-14 bg-canvas border-b border-hairline flex-shrink-0">
        <span className="font-semibold text-ink">Booklync</span>
        <span className="text-hairline">·</span>
        {me && me.branches.length > 1 ? (
          <select
            className="h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
            value={agentId ?? ""}
            onChange={e => changeBranch(Number(e.target.value))}
            aria-label="Switch branch">
            {me.branches.map(b => (
              <option key={b.agent_id} value={b.agent_id}>{b.agent_name}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-muted">{me?.agent_name ?? "…"}</span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {me && (
            <div className="flex items-center gap-2">
              <span className="grid place-items-center h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                {initialsOf(me.employee_name)}
              </span>
              <span className="text-sm text-ink hidden sm:inline">{me.employee_name}</span>
            </div>
          )}
          <button onClick={logout}
            className="text-sm text-muted hover:text-ink px-2 py-1 rounded-md hover:bg-surface-soft transition-colors">
            Log out
          </button>
        </div>
      </header>

      {/* Calendar */}
      <div className="flex-1 min-h-0 flex flex-col gap-3.5 px-6 pb-6 pt-3.5 box-border">
        {meLoading && <p className="cal-loading-state">Loading your schedule…</p>}
        {meError && <p className="cal-loading-state">Couldn’t load your schedule. Please try again.</p>}

        {me && (
          <>
            <div className="cal-toolbar">
              <div className="cal-toolbar-left">
                <div className="cal-datenav">
                  <button className="cal-datenav-btn" onClick={() => navigate(-1)} aria-label="Previous">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <div className="cal-datenav-label">
                    <span>{dateLabel}</span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}><polyline points="6 9 12 15 18 9"/></svg>
                    <input type="date" className="cal-datenav-input" value={dateInputVal}
                      onChange={e => { if (e.target.value) setCurrentDate(calFromISODate(e.target.value)); }} />
                  </div>
                  <button className="cal-datenav-btn" onClick={() => navigate(1)} aria-label="Next">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                  <button className="cal-today-btn" onClick={goToday}>Today</button>
                </div>
              </div>

              <div className="cal-toolbar-right">
                <div className="cal-pillgroup" ref={pillGroupRef} role="tablist">
                  {(["day", "week", "month"] as CalView[]).map(v => (
                    <button key={v} className={`cal-pill${view === v ? " cal-pill--active" : ""}`}
                      data-cal-view={v} role="tab" onClick={() => setView(v)}>
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                  <span className="cal-pill-slider" style={sliderStyle} />
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="cal-legend">
              <span className="cal-legend-item"><span className="cal-legend-swatch cal-legend-swatch--appt" />Appointment</span>
              <span className="cal-legend-item"><span className="cal-legend-swatch cal-legend-swatch--break" />Break</span>
              <span className="cal-legend-item"><span className="cal-legend-swatch cal-legend-swatch--off" />Day off</span>
            </div>

            <div className="cal-body">
              {view === "day" && (
                <DayView dateISO={calToISODate(currentDate)} dateObj={currentDate}
                  employees={employees} appointments={appointments}
                  hoursMap={hoursMap} breaksMap={breaksMap} daysOffMap={daysOffMap}
                  businessHours={businessHours} branchDaysOff={branchDaysOff}
                  agentTimeRef={agentTimeRef} tz={tz} canCreate={false}
                  onSelectAppt={setViewAppt} onSlotClick={noop} />
              )}
              {view === "week" && employee && (
                <WeekView currentDate={currentDate} todayISO={todayISO} employee={employee}
                  appointments={appointments}
                  hours={hoursMap.get(empId) ?? []} breaks={breaksMap.get(empId) ?? []} daysOff={daysOffMap.get(empId) ?? []}
                  businessHours={businessHours} branchDaysOff={branchDaysOff}
                  agentTimeRef={agentTimeRef} tz={tz} canCreate={false}
                  onSelectAppt={setViewAppt} onSlotClick={noop} />
              )}
              {view === "month" && (
                <MonthView currentDate={currentDate} todayISO={todayISO}
                  employees={employees} appointments={appointments}
                  breaksMap={breaksMap} daysOffMap={daysOffMap}
                  businessHours={businessHours} branchDaysOff={branchDaysOff}
                  tz={tz} selectedEmpId={empId}
                  onDayClick={iso => { setCurrentDate(calFromISODate(iso)); setView("day"); }}
                  onSelectAppt={setViewAppt} />
              )}
            </div>
          </>
        )}
      </div>

      {viewAppt && (
        <AppointmentDrawer appt={viewAppt} tz={tz}
          isStaff canUpdateStatus updateStatus={staffCalApi.updateStatus}
          onClose={() => setViewAppt(null)}
          onUpdated={updated => { setViewAppt(updated); refetchAppts(); }} />
      )}
    </div>
  );
}
