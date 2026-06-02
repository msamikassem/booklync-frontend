import "./Calendar.css";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { useAgent } from "../../contexts/AgentContext";
import { useAuth } from "../../contexts/AuthContext";
import { services as servicesApi } from "../../api";
import { employeesApi } from "../Employees/api";
import { calApi } from "./api";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import { NewAppointmentModal } from "../Appointments/NewAppointmentModal";
import { AppointmentDrawer } from "../Appointments/AppointmentDrawer";
import {
  calToISODate, calFromISODate, calAddDays, calWeekStart,
  calMonthStart, calMonthEnd, calAgentNow, calFormatDateLabel,
} from "./utils";
import type { AgentTimeRef } from "./utils";
import type { AppointmentDetailResponse } from "./types";

type CalView = "day" | "week" | "month";

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

export default function Calendar() {
  const { activeAgent } = useAgent();
  const { me } = useAuth();
  const qc = useQueryClient();
  const agentId = activeAgent?.id ?? 0;
  const tz      = activeAgent?.timezone ?? "UTC";

  // ── View state ────────────────────────────────────────────────────────────
  const [view, setView] = useState<CalView>("day");
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);

  // ── Pill-slider ───────────────────────────────────────────────────────────
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
  }, [view]);
  useEffect(() => {
    const onResize = () => {
      const group = pillGroupRef.current;
      if (!group) return;
      const active = group.querySelector(".cal-pill--active") as HTMLElement | null;
      if (!active) return;
      const gr = group.getBoundingClientRect();
      const ar = active.getBoundingClientRect();
      setSliderStyle({ left: ar.left - gr.left, width: ar.width });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Agent clock ───────────────────────────────────────────────────────────
  const [agentTimeRef, setAgentTimeRef] = useState<AgentTimeRef | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!agentId) return;
    calApi.agentTime(agentId).then(ref => { if (ref) setAgentTimeRef(ref); });
  }, [agentId]);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const agentNow = calAgentNow(agentTimeRef);
  const todayISO = agentNow?.dateISO ?? calToISODate(new Date());

  // ── Branch clock (ticks every second) ────────────────────────────────────
  const [clockDisplay, setClockDisplay] = useState<string>("");
  useEffect(() => {
    const update = () => {
      const ref = agentTimeRef;
      if (!ref) { setClockDisplay(""); return; }
      const elapsed = Math.floor((Date.now() - ref.fetchedAt) / 1000);
      const totalSec = ref.hours * 3600 + ref.mins * 60 + ref.secs + elapsed;
      const daySec = ((totalSec % 86400) + 86400) % 86400;
      const h = Math.floor(daySec / 3600);
      const m = Math.floor((daySec % 3600) / 60);
      const s = daySec % 60;
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = ((h + 11) % 12) + 1;
      setClockDisplay(`${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} ${ampm}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [agentTimeRef]);

  const tzShort = useMemo(() => {
    if (!tz) return "";
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
        .formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value ?? tz;
    } catch { return tz; }
  }, [tz]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = useCallback((dir: 1 | -1) => {
    setCurrentDate(d => {
      if (view === "day")  return calAddDays(d, dir);
      if (view === "week") return calAddDays(d, 7 * dir);
      const x = new Date(d.getFullYear(), d.getMonth() + dir, 1);
      return x;
    });
  }, [view]);

  const goToday = useCallback(async () => {
    if (agentId) {
      const ref = await calApi.agentTime(agentId);
      if (ref) setAgentTimeRef(ref);
    }
    setCurrentDate(calFromISODate(todayISO));
  }, [agentId, todayISO]);

  // ── Date range ────────────────────────────────────────────────────────────
  const { dateFrom, dateTo } = useMemo(
    () => computeCalRange(view, currentDate),
    [view, currentDate]
  );

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: employees = [] } = useQuery({
    queryKey: ["cal-employees", agentId],
    queryFn: () => calApi.employees(agentId),
    staleTime: 5 * 60_000, enabled: !!agentId,
  });
  const { data: businessHours = [] } = useQuery({
    queryKey: ["cal-business-hours", agentId],
    queryFn: () => calApi.businessHours(agentId),
    staleTime: 5 * 60_000, enabled: !!agentId,
  });
  const { data: branchDaysOff = [] } = useQuery({
    queryKey: ["cal-branch-daysoff", agentId],
    queryFn: () => calApi.branchDaysOff(agentId),
    staleTime: 5 * 60_000, enabled: !!agentId,
  });
  const { data: appointments = [], refetch: refetchAppts } = useQuery({
    queryKey: ["cal-appointments", agentId, dateFrom, dateTo],
    queryFn: () => calApi.appointments(agentId, dateFrom, dateTo),
    staleTime: 0, enabled: !!agentId,
  });

  const hoursResults  = useQueries({ queries: employees.map(e => ({ queryKey: ["cal-emp-hours",   e.id, agentId], queryFn: () => calApi.hours(e.id, agentId),  staleTime: 5*60_000, enabled: !!agentId })) });
  const breaksResults = useQueries({ queries: employees.map(e => ({ queryKey: ["cal-emp-breaks",  e.id, agentId], queryFn: () => calApi.breaks(e.id, agentId), staleTime: 5*60_000, enabled: !!agentId })) });
  const daysOffResults = useQueries({ queries: employees.map(e => ({ queryKey: ["cal-emp-daysoff", e.id, agentId], queryFn: () => calApi.daysOff(e.id, agentId),  staleTime: 5*60_000, enabled: !!agentId })) });

  const hoursMap  = useMemo(() => { const m = new Map<number, import("./api").CalWorkingHour[]>(); employees.forEach((e, i) => m.set(e.id, hoursResults[i]?.data  ?? [])); return m; }, [employees, hoursResults]);
  const breaksMap = useMemo(() => { const m = new Map<number, import("./api").CalBreak[]>();        employees.forEach((e, i) => m.set(e.id, breaksResults[i]?.data ?? [])); return m; }, [employees, breaksResults]);
  const daysOffMap = useMemo(() => { const m = new Map<number, import("./api").CalDayOff[]>();      employees.forEach((e, i) => m.set(e.id, daysOffResults[i]?.data ?? [])); return m; }, [employees, daysOffResults]);

  // ── Visible employees for each view ──────────────────────────────────────
  const visibleEmployees = useMemo(() => {
    if (view === "day") return employees;
    if (selectedEmpId) return employees.filter(e => e.id === selectedEmpId);
    return employees.slice(0, 1);
  }, [view, employees, selectedEmpId]);
  const selectedEmployee = visibleEmployees[0] ?? null;

  // ── Modal state ───────────────────────────────────────────────────────────
  const [newApptSlot, setNewApptSlot] = useState<{ empId: number; dateISO: string; hour: number } | null>(null);
  const [viewAppt, setViewAppt] = useState<AppointmentDetailResponse | null>(null);

  const isOwner = me?.is_owner ?? false;
  const agentPermKeys = useMemo(() => {
    if (isOwner) return ["manage_appointments"];
    if (!me || !agentId) return [];
    return me.branches?.find(b => b.agent_id === agentId)?.permissions ?? [];
  }, [me, agentId, isOwner]);
  const canCreate = isOwner || agentPermKeys.includes("manage_appointments");

  const { data: catalogue } = useQuery({
    queryKey: ["services-catalogue", agentId],
    queryFn: () => servicesApi.catalogue(agentId),
    staleTime: 5 * 60_000, enabled: !!agentId && !!newApptSlot,
  });
  const { data: bookableEmployees = [] } = useQuery({
    queryKey: ["employees-bookable", agentId],
    queryFn: () => employeesApi.list(agentId),
    staleTime: 5 * 60_000, enabled: !!agentId && !!newApptSlot,
  });

  const handleSlotClick = useCallback((empId: number, dateISO: string, hour: number) => {
    setNewApptSlot({ empId, dateISO, hour });
  }, []);
  const handleApptCreated = useCallback(() => {
    setNewApptSlot(null);
    refetchAppts();
    qc.invalidateQueries({ queryKey: ["appointments"] });
  }, [refetchAppts, qc]);

  const dateLabel   = calFormatDateLabel(currentDate, view, todayISO);
  const dateInputVal = calToISODate(view === "week" ? calWeekStart(currentDate) : currentDate);

  const handleViewSwitch = (v: CalView) => {
    setView(v);
    // week/month default to first employee when switching in
    if ((v === "week" || v === "month") && !selectedEmpId && employees.length) {
      setSelectedEmpId(employees[0].id);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "0 24px 24px", height: "100%", boxSizing: "border-box" }}>
      {/* Toolbar */}
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

          {/* Branch clock */}
          {clockDisplay && (
            <div className="cal-branch-clock">
              <span className="cal-clock-time">{clockDisplay}</span>
              {tzShort && <span className="cal-clock-tz">{tzShort}</span>}
            </div>
          )}
        </div>

        <div className="cal-toolbar-right">
          {/* Employee filter (week/month) */}
          {(view === "week" || view === "month") && employees.length > 1 && (
            <select className="cal-emp-filter"
              value={selectedEmpId ?? (employees[0]?.id ?? "")}
              onChange={e => setSelectedEmpId(Number(e.target.value))}>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name}{!e.active ? " (Inactive)" : ""}</option>
              ))}
            </select>
          )}

          {/* View pill switcher */}
          <div className="cal-pillgroup" ref={pillGroupRef} role="tablist">
            {(["day", "week", "month"] as CalView[]).map(v => (
              <button key={v} className={`cal-pill${view === v ? " cal-pill--active" : ""}`}
                data-cal-view={v} role="tab"
                onClick={() => handleViewSwitch(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
            <span className="cal-pill-slider" style={sliderStyle} />
          </div>

          {/* New appointment */}
          {canCreate && (
            <button className="cal-add-btn"
              onClick={() => setNewApptSlot({ empId: employees[0]?.id ?? 0, dateISO: calToISODate(currentDate), hour: 9 })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New appointment
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="cal-legend">
        <span className="cal-legend-item"><span className="cal-legend-swatch cal-legend-swatch--appt" />Appointment</span>
        <span className="cal-legend-item"><span className="cal-legend-swatch cal-legend-swatch--break" />Break</span>
        <span className="cal-legend-item"><span className="cal-legend-swatch cal-legend-swatch--off" />Day off</span>
      </div>

      {/* Body */}
      <div className="cal-body">
        {view === "day" && (
          <DayView dateISO={calToISODate(currentDate)} dateObj={currentDate}
            employees={visibleEmployees} appointments={appointments}
            hoursMap={hoursMap} breaksMap={breaksMap} daysOffMap={daysOffMap}
            businessHours={businessHours} branchDaysOff={branchDaysOff}
            agentTimeRef={agentTimeRef} tz={tz} canCreate={canCreate}
            onSelectAppt={setViewAppt} onSlotClick={handleSlotClick} />
        )}

        {view === "week" && selectedEmployee && (
          <WeekView currentDate={currentDate} todayISO={todayISO} employee={selectedEmployee}
            appointments={appointments}
            hours={hoursMap.get(selectedEmployee.id) ?? []}
            breaks={breaksMap.get(selectedEmployee.id) ?? []}
            daysOff={daysOffMap.get(selectedEmployee.id) ?? []}
            businessHours={businessHours} branchDaysOff={branchDaysOff}
            agentTimeRef={agentTimeRef} tz={tz} canCreate={canCreate}
            onSelectAppt={setViewAppt} onSlotClick={handleSlotClick} />
        )}

        {view === "week" && !selectedEmployee && (
          <p className="cal-loading-state">No employees found for this branch.</p>
        )}

        {view === "month" && (
          <MonthView currentDate={currentDate} todayISO={todayISO}
            employees={visibleEmployees} appointments={appointments}
            breaksMap={breaksMap} daysOffMap={daysOffMap}
            businessHours={businessHours} branchDaysOff={branchDaysOff}
            tz={tz} selectedEmpId={selectedEmpId}
            onDayClick={iso => { setCurrentDate(calFromISODate(iso)); setView("day"); }}
            onSelectAppt={setViewAppt} />
        )}
      </div>

      {/* New appointment modal */}
      {newApptSlot && (
        <NewAppointmentModal agentId={agentId} tz={tz}
          employees={bookableEmployees} catalogue={catalogue}
          prefillEmpId={newApptSlot.empId} prefillDate={newApptSlot.dateISO} prefillHour={newApptSlot.hour}
          onClose={() => setNewApptSlot(null)} onCreated={handleApptCreated} />
      )}

      {/* Appointment drawer */}
      {viewAppt && (
        <AppointmentDrawer appt={viewAppt} tz={tz}
          isStaff={false} canUpdateStatus={canCreate}
          onClose={() => setViewAppt(null)}
          onUpdated={updated => {
            setViewAppt(updated);
            refetchAppts();
            qc.invalidateQueries({ queryKey: ["appointments"] });
          }} />
      )}
    </div>
  );
}
