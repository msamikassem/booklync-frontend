/**
 * Week view — 7 day columns for a single selected employee.
 * Shares the same rendering logic as DayView (working bands, breaks, day-off, events).
 * ±1-day fetch widening is handled by the parent; this component only receives
 * appointments filtered by employee and re-filters by dateISO client-side.
 */

import { EventBlock } from "./EventBlock";
import {
  calDow, calApptLocalParts, calAgentNow, calWeekStart, calAddDays,
  calToISODate, calRangeFromBH, calComputeTimeRange, calFmtTimeLabel, DOW_SHORT,
} from "./utils";
import { ROW_H } from "./types";
import type { AgentTimeRef } from "./utils";
import type { AppointmentDetailResponse } from "./types";
import type { CalEmployee, CalWorkingHour, CalBreak, CalDayOff } from "./api";
import type { BusinessHourResponse } from "../../api/types";

interface Props {
  currentDate: Date;
  todayISO: string;
  employee: CalEmployee;
  appointments: AppointmentDetailResponse[];
  hours: CalWorkingHour[];
  breaks: CalBreak[];
  daysOff: CalDayOff[];
  businessHours: BusinessHourResponse[];
  branchDaysOff: CalDayOff[];
  agentTimeRef: AgentTimeRef | null;
  tz: string;
  canCreate: boolean;
  onSelectAppt: (appt: AppointmentDetailResponse) => void;
  onSlotClick: (empId: number, dateISO: string, hour: number) => void;
}

export function WeekView({
  currentDate, todayISO, employee, appointments, hours, breaks, daysOff,
  businessHours, branchDaysOff, agentTimeRef, tz, canCreate, onSelectAppt, onSlotClick,
}: Props) {
  const weekStart = calWeekStart(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => calAddDays(weekStart, i));

  // Widest range across all 7 days
  const bhWeekRange = days.reduce<{ startHour: number; endHour: number } | null>((acc, d) => {
    const r = calRangeFromBH(businessHours, calDow(d));
    if (!r) return acc;
    if (!acc) return r;
    return { startHour: Math.min(acc.startHour, r.startHour), endHour: Math.max(acc.endHour, r.endHour) };
  }, null);
  const range = bhWeekRange ?? calComputeTimeRange([hours]);
  const { startHour, endHour } = range;
  const hourCount = endHour - startHour;
  const pxPerMin  = ROW_H / 60;

  const agentNow = calAgentNow(agentTimeRef);
  const weekStartISO = calToISODate(weekStart);
  const weekEndISO   = calToISODate(calAddDays(weekStart, 6));
  const todayInWeek  = agentNow && agentNow.dateISO >= weekStartISO && agentNow.dateISO <= weekEndISO;

  const AXIS_W   = 64;
  const COL_W    = 120;

  return (
    <div className="overflow-auto flex-1">
      <div style={{ minWidth: AXIS_W + 7 * COL_W }}>
        {/* Day headers */}
        <div className="sticky top-0 z-20 bg-canvas border-b border-hairline flex" style={{ paddingLeft: AXIS_W }}>
          {days.map(d => {
            const dISO    = calToISODate(d);
            const isToday = dISO === todayISO;
            return (
              <div key={dISO} className={`flex flex-col items-center justify-center py-2 border-l border-hairline flex-1 ${isToday ? "bg-primary/5" : ""}`}
                style={{ minWidth: COL_W }}>
                <span className="text-[10px] font-medium text-muted uppercase">{DOW_SHORT[calDow(d)]}</span>
                <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-ink"}`}>{d.getDate()}</span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex">
          {/* Time axis */}
          <div className="flex-shrink-0 border-r border-hairline" style={{ width: AXIS_W }}>
            {Array.from({ length: hourCount }, (_, i) => startHour + i).map(h => (
              <div key={h} className="border-b border-hairline/50 flex items-start justify-end px-1.5" style={{ height: ROW_H }}>
                <span className="text-[10px] text-muted -translate-y-2">{calFmtTimeLabel(h)}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(d => {
            const dow     = calDow(d);
            const dateISO = calToISODate(d);
            const isToday = dateISO === todayISO;

            const todayHoursArr = hours.filter(h => h.day_of_week === dow);
            const todayBreaks   = breaks.filter(b => b.day_of_week === dow);
            const branchDayOff  = branchDaysOff.find(o => o.start_date <= dateISO && o.end_date >= dateISO);
            const empDayOff     = daysOff.find(o => o.start_date <= dateISO && o.end_date >= dateISO);
            const dayOff        = branchDayOff ?? empDayOff;
            const isInactive    = !employee.active;
            const conflict      = isInactive || !!dayOff;

            const colAppts = appointments.filter(a => {
              if (Number(a.employee_id) !== employee.id) return false;
              const p = calApptLocalParts(a, tz);
              return p?.dateISO === dateISO;
            });

            const nowTop = (todayInWeek && agentNow && agentNow.dateISO === dateISO)
              ? Math.round((agentNow.minutes - startHour*60) * pxPerMin)
              : -1;

            return (
              <div key={dateISO} className={`relative border-l border-hairline flex-1 ${isToday ? "bg-primary/[0.02]" : ""}`}
                style={{ minWidth: COL_W }}>
                {/* Hour cells */}
                {Array.from({ length: hourCount }, (_, i) => startHour + i).map(h => (
                  <div key={h} className={`border-b border-hairline/50 group ${canCreate && !dayOff && !isInactive ? "cursor-pointer hover:bg-primary/5" : ""}`}
                    style={{ height: ROW_H }}
                    onClick={() => { if (canCreate && !dayOff && !isInactive) onSlotClick(employee.id, dateISO, h); }}>
                    {canCreate && !dayOff && !isInactive && (
                      <span className="hidden group-hover:flex items-center gap-0.5 text-[9px] text-primary/70 px-1 pt-0.5">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        New
                      </span>
                    )}
                  </div>
                ))}

                {/* Working bands */}
                {todayHoursArr.map((wh, i) => {
                  const [sH,sM] = wh.start_time.split(":").map(Number);
                  const [eH,eM] = wh.end_time.split(":").map(Number);
                  const s = (sH*60+sM) - startHour*60;
                  const e = (eH*60+eM) - startHour*60;
                  if (e<=0||s>=hourCount*60) return null;
                  return <div key={i} className="absolute left-0 right-0 bg-green-500/5 pointer-events-none"
                    style={{ top: Math.round(Math.max(0,s)*pxPerMin), height: Math.round(Math.min(hourCount*60,e)*pxPerMin)-Math.round(Math.max(0,s)*pxPerMin) }} />;
                })}

                {/* Breaks */}
                {todayBreaks.map((br, i) => {
                  const [sH,sM] = br.start_time.split(":").map(Number);
                  const [eH,eM] = br.end_time.split(":").map(Number);
                  const s = (sH*60+sM) - startHour*60;
                  const e = (eH*60+eM) - startHour*60;
                  if (e<=0||s>=hourCount*60) return null;
                  const top = Math.round(Math.max(0,s)*pxPerMin);
                  const height = Math.max(16, Math.round(Math.min(hourCount*60,e)*pxPerMin)-top);
                  return <div key={i} className="absolute left-0 right-0 bg-orange-100/70 border-l border-orange-300 pointer-events-none"
                    style={{ top, height }}>
                    <span className="text-[8px] text-orange-700 px-0.5 truncate block">{br.reason ?? "Break"}</span>
                  </div>;
                })}

                {/* Events */}
                <div className="absolute inset-0 pointer-events-none">
                  {colAppts.map(a => {
                    if ((a.status ?? "pending") === "cancelled") return null;
                    return (
                      <div key={a.id} className="pointer-events-auto">
                        <EventBlock appt={a} pxPerMin={pxPerMin} startHour={startHour} hourCount={hourCount}
                          todayBreaks={todayBreaks} conflict={conflict} tz={tz}
                          onClick={() => onSelectAppt(a)} />
                      </div>
                    );
                  })}
                </div>

                {/* Now line */}
                {nowTop >= 0 && nowTop <= hourCount*ROW_H && (
                  <div className="absolute left-0 right-0 h-px bg-red-500 pointer-events-none z-10" style={{ top: nowTop }} />
                )}

                {/* Day-off overlay */}
                {dayOff && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center"
                    style={{ background: branchDayOff ? "rgba(239,246,255,0.85)" : "rgba(249,250,251,0.85)" }}>
                    <span className="text-[10px] text-muted bg-white px-2 py-0.5 rounded-full shadow-sm">
                      {dayOff.name || (branchDayOff ? "Closed" : "Day off")}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
