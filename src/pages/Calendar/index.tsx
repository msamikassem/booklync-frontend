/**
 * Calendar page — day / week / month views.
 *
 * Data strategy:
 *  - Employees, business hours, branch days-off: staleTime 5min
 *  - Appointments: staleTime 0 (always fresh), date range ±1 day widened in UTC
 *  - Per-employee hours/breaks/days-off: staleTime 5min, loaded in parallel
 *  - Agent clock: fetched once from /availability/time, projected forward (no browser clock)
 *  - Now-line: tick every 60s forces re-render
 *
 * Timezone constraint: all calendar bucketing uses start_time_local, NOT browser time.
 * The ±1-day widening ensures appointments near UTC midnight are captured;
 * client-side p.dateISO === dateISO re-filters by agent-local date.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
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
import { useQueryClient } from "@tanstack/react-query";
import {
  calToISODate, calFromISODate, calAddDays, calWeekStart, calMonthStart, calMonthEnd,
  calAgentNow, calFormatDateLabel,
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
  // month — widen the full Mon-anchored grid
  const ms = calMonthStart(d);
  const me = calMonthEnd(d);
  const gridStart = calWeekStart(ms);
  const lastDow = (me.getDay() + 6) % 7; // Mon=0
  const gridEnd = lastDow === 6 ? me : calAddDays(me, 6 - lastDow);
  return widen(gridStart, gridEnd);
}

export default function Calendar() {
  const { activeAgent } = useAgent();
  const { me } = useAuth();
  const qc = useQueryClient();
  const agentId = activeAgent?.id ?? 0;
  const tz = activeAgent?.timezone ?? "UTC";

  // ── View state ────────────────────────────────────────────────────────────
  const [view, setView] = useState<CalView>("day");
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);

  // ── Agent clock ───────────────────────────────────────────────────────────
  const [agentTimeRef, setAgentTimeRef] = useState<AgentTimeRef | null>(null);
  const [, setTick] = useState(0); // forces re-render every 60s for now-line

  useEffect(() => {
    if (!agentId) return;
    calApi.agentTime(agentId).then(ref => {
      if (ref) setAgentTimeRef(ref);
    });
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
      if (view === "day")   return calAddDays(d, dir);
      if (view === "week")  return calAddDays(d, 7 * dir);
      const nm = new Date(d.getFullYear(), d.getMonth() + dir, 1);
      return nm;
    });
  }, [view]);

  const goToday = useCallback(() => {
    setCurrentDate(calFromISODate(todayISO));
  }, [todayISO]);

  // ── Derived date range for data fetch ─────────────────────────────────────
  const { dateFrom, dateTo } = useMemo(
    () => computeCalRange(view, currentDate),
    [view, currentDate]
  );

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: employees = [] } = useQuery({
    queryKey: ["cal-employees", agentId],
    queryFn: () => calApi.employees(agentId),
    staleTime: 5 * 60_000,
    enabled: !!agentId,
  });

  const { data: businessHours = [] } = useQuery({
    queryKey: ["cal-business-hours", agentId],
    queryFn: () => calApi.businessHours(agentId),
    staleTime: 5 * 60_000,
    enabled: !!agentId,
  });

  const { data: branchDaysOff = [] } = useQuery({
    queryKey: ["cal-branch-daysoff", agentId],
    queryFn: () => calApi.branchDaysOff(agentId),
    staleTime: 5 * 60_000,
    enabled: !!agentId,
  });

  const { data: appointments = [], refetch: refetchAppts } = useQuery({
    queryKey: ["cal-appointments", agentId, dateFrom, dateTo],
    queryFn: () => calApi.appointments(agentId, dateFrom, dateTo),
    staleTime: 0,
    enabled: !!agentId,
  });

  // Per-employee hours (parallel)
  const hoursResults = useQueries({
    queries: employees.map(e => ({
      queryKey: ["cal-emp-hours", e.id, agentId],
      queryFn: () => calApi.hours(e.id, agentId),
      staleTime: 5 * 60_000,
      enabled: !!agentId,
    })),
  });
  const breaksResults = useQueries({
    queries: employees.map(e => ({
      queryKey: ["cal-emp-breaks", e.id, agentId],
      queryFn: () => calApi.breaks(e.id, agentId),
      staleTime: 5 * 60_000,
      enabled: !!agentId,
    })),
  });
  const daysOffResults = useQueries({
    queries: employees.map(e => ({
      queryKey: ["cal-emp-daysoff", e.id, agentId],
      queryFn: () => calApi.daysOff(e.id, agentId),
      staleTime: 5 * 60_000,
      enabled: !!agentId,
    })),
  });

  // Build Maps keyed by employee id
  const hoursMap = useMemo(() => {
    const m = new Map<number, typeof hoursResults[0]["data"]>();
    employees.forEach((e, i) => m.set(e.id, hoursResults[i]?.data ?? []));
    return m;
  }, [employees, hoursResults]);
  const breaksMap = useMemo(() => {
    const m = new Map<number, typeof breaksResults[0]["data"]>();
    employees.forEach((e, i) => m.set(e.id, breaksResults[i]?.data ?? []));
    return m;
  }, [employees, breaksResults]);
  const daysOffMap = useMemo(() => {
    const m = new Map<number, typeof daysOffResults[0]["data"]>();
    employees.forEach((e, i) => m.set(e.id, daysOffResults[i]?.data ?? []));
    return m;
  }, [employees, daysOffResults]);

  // Employee list for views that need arrays (DayView shows all, WeekView shows one)
  const visibleEmployees = useMemo(() => {
    if (view === "day") return employees;
    if (selectedEmpId) return employees.filter(e => e.id === selectedEmpId);
    return employees.slice(0, 1); // default to first employee in week view
  }, [view, employees, selectedEmpId]);

  const selectedEmployee = visibleEmployees[0] ?? null;

  // ── Modal state ───────────────────────────────────────────────────────────
  const [newApptSlot, setNewApptSlot] = useState<{ empId: number; dateISO: string; hour: number } | null>(null);
  const [viewAppt, setViewAppt] = useState<AppointmentDetailResponse | null>(null);

  // Permission check
  const isOwner = me?.is_owner ?? false;
  const agentPermKeys: string[] = useMemo(() => {
    if (isOwner) return ["manage_appointments"];
    if (!me || !agentId) return [];
    const found = me.branches?.find(b => b.agent_id === agentId);
    return found?.permissions ?? [];
  }, [me, agentId, isOwner]);
  const canCreate = isOwner || agentPermKeys.includes("manage_appointments");

  // ── Service catalogue for modal ───────────────────────────────────────────
  const { data: catalogue } = useQuery({
    queryKey: ["services-catalogue", agentId],
    queryFn: () => servicesApi.catalogue(agentId),
    staleTime: 5 * 60_000,
    enabled: !!agentId && !!newApptSlot,
  });
  const { data: bookableEmployees = [] } = useQuery({
    queryKey: ["employees-bookable", agentId],
    queryFn: () => employeesApi.list(agentId),
    staleTime: 5 * 60_000,
    enabled: !!agentId && !!newApptSlot,
  });

  const handleSlotClick = useCallback((empId: number, dateISO: string, hour: number) => {
    setNewApptSlot({ empId, dateISO, hour });
  }, []);

  const handleApptCreated = useCallback(() => {
    setNewApptSlot(null);
    refetchAppts();
    // also bust the appointments list query so the list view stays in sync
    qc.invalidateQueries({ queryKey: ["appointments"] });
  }, [refetchAppts, qc]);

  // ── Date input handler ────────────────────────────────────────────────────
  const handleDateInput = (v: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setCurrentDate(calFromISODate(v));
  };

  const dateLabel = calFormatDateLabel(currentDate, view, todayISO);
  const dateInputVal = calToISODate(view === "week" ? calWeekStart(currentDate) : currentDate);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline bg-canvas flex-shrink-0 flex-wrap">
        {/* Prev / Today / Next */}
        <button onClick={() => navigate(-1)} className="w-7 h-7 rounded hover:bg-surface flex items-center justify-center text-ink/60">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button onClick={goToday} className="px-2.5 py-1 text-xs font-medium rounded border border-hairline hover:bg-surface text-ink/70">Today</button>
        <button onClick={() => navigate(1)} className="w-7 h-7 rounded hover:bg-surface flex items-center justify-center text-ink/60">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        {/* Date label */}
        <span className="text-sm font-semibold text-ink flex-1 min-w-0 truncate">{dateLabel}</span>

        {/* Date jump input */}
        <input
          type="date"
          value={dateInputVal}
          onChange={e => handleDateInput(e.target.value)}
          className="text-xs border border-hairline rounded px-2 py-1 text-ink bg-canvas focus:outline-none focus:ring-1 focus:ring-primary/30"
        />

        {/* Employee filter (week + month) */}
        {(view === "week" || view === "month") && employees.length > 1 && (
          <select
            value={selectedEmpId ?? ""}
            onChange={e => setSelectedEmpId(e.target.value ? Number(e.target.value) : null)}
            className="text-xs border border-hairline rounded px-2 py-1 text-ink bg-canvas focus:outline-none focus:ring-1 focus:ring-primary/30 max-w-[140px]"
          >
            <option value="">All employees</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        )}

        {/* View switcher */}
        <div className="flex rounded border border-hairline overflow-hidden">
          {(["day","week","month"] as CalView[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs font-medium capitalize border-r border-hairline last:border-r-0
                ${view === v ? "bg-primary text-white" : "bg-canvas text-ink/60 hover:bg-surface"}`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* New appointment */}
        {canCreate && (
          <button
            onClick={() => setNewApptSlot({ empId: employees[0]?.id ?? 0, dateISO: calToISODate(currentDate), hour: 9 })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New
          </button>
        )}
      </div>

      {/* View body */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {view === "day" && (
          <DayView
            dateISO={calToISODate(currentDate)}
            dateObj={currentDate}
            employees={visibleEmployees}
            appointments={appointments}
            hoursMap={hoursMap as Map<number, import("./api").CalWorkingHour[]>}
            breaksMap={breaksMap as Map<number, import("./api").CalBreak[]>}
            daysOffMap={daysOffMap as Map<number, import("./api").CalDayOff[]>}
            businessHours={businessHours}
            branchDaysOff={branchDaysOff}
            agentTimeRef={agentTimeRef}
            tz={tz}
            canCreate={canCreate}
            onSelectAppt={setViewAppt}
            onSlotClick={handleSlotClick}
          />
        )}

        {view === "week" && selectedEmployee && (
          <WeekView
            currentDate={currentDate}
            todayISO={todayISO}
            employee={selectedEmployee}
            appointments={appointments}
            hours={hoursMap.get(selectedEmployee.id) ?? []}
            breaks={breaksMap.get(selectedEmployee.id) ?? []}
            daysOff={daysOffMap.get(selectedEmployee.id) ?? []}
            businessHours={businessHours}
            branchDaysOff={branchDaysOff}
            agentTimeRef={agentTimeRef}
            tz={tz}
            canCreate={canCreate}
            onSelectAppt={setViewAppt}
            onSlotClick={handleSlotClick}
          />
        )}

        {view === "week" && !selectedEmployee && (
          <div className="flex-1 flex items-center justify-center text-sm text-muted">
            No employees found for this branch.
          </div>
        )}

        {view === "month" && (
          <MonthView
            currentDate={currentDate}
            todayISO={todayISO}
            employees={visibleEmployees}
            appointments={appointments}
            breaksMap={breaksMap as Map<number, import("./api").CalBreak[]>}
            daysOffMap={daysOffMap as Map<number, import("./api").CalDayOff[]>}
            businessHours={businessHours}
            branchDaysOff={branchDaysOff}
            tz={tz}
            selectedEmpId={selectedEmpId}
            onDayClick={iso => { setCurrentDate(calFromISODate(iso)); setView("day"); }}
            onSelectAppt={setViewAppt}
          />
        )}
      </div>

      {/* New appointment modal */}
      {newApptSlot && (
        <NewAppointmentModal
          agentId={agentId}
          tz={tz}
          employees={bookableEmployees}
          catalogue={catalogue}
          prefillEmpId={newApptSlot.empId}
          prefillDate={newApptSlot.dateISO}
          prefillHour={newApptSlot.hour}
          onClose={() => setNewApptSlot(null)}
          onCreated={handleApptCreated}
        />
      )}

      {/* Appointment detail drawer */}
      {viewAppt && (
        <AppointmentDrawer
          appt={viewAppt}
          tz={tz}
          isStaff={false}
          canUpdateStatus={canCreate}
          onClose={() => setViewAppt(null)}
          onUpdated={(updated) => {
            setViewAppt(updated);
            refetchAppts();
            qc.invalidateQueries({ queryKey: ["appointments"] });
          }}
        />
      )}
    </div>
  );
}
