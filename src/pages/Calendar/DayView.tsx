/**
 * Day view — employee columns, time axis, working-hour bands, break overlays,
 * day-off overlay, now-line, events with prep-time strips.
 *
 * Receives pre-loaded data from the parent (index.tsx) so this component is
 * pure-render (no data fetching). Timezone constraint: all appointment
 * bucketing uses start_time_local, NOT browser time.
 */

import { useRef, useEffect } from "react";
import { EventBlock } from "./EventBlock";
import {
  calDow, calApptLocalParts, calAgentNow, calRangeFromBH, calComputeTimeRange,
  calEmpColor, calFmtTimeLabel,
} from "./utils";
import { ROW_H } from "./types";
import type { AgentTimeRef } from "./utils";
import type { AppointmentDetailResponse } from "./types";
import type { CalEmployee, CalWorkingHour, CalBreak, CalDayOff } from "./api";
import type { BusinessHourResponse } from "../../api/types";

interface Props {
  dateISO: string;
  dateObj: Date;
  employees: CalEmployee[];
  appointments: AppointmentDetailResponse[];
  hoursMap: Map<number, CalWorkingHour[]>;
  breaksMap: Map<number, CalBreak[]>;
  daysOffMap: Map<number, CalDayOff[]>;
  businessHours: BusinessHourResponse[];
  branchDaysOff: CalDayOff[];
  agentTimeRef: AgentTimeRef | null;
  tz: string;
  canCreate: boolean;
  onSelectAppt: (appt: AppointmentDetailResponse) => void;
  onSlotClick: (empId: number, dateISO: string, hour: number) => void;
}

export function DayView({
  dateISO, dateObj, employees, appointments, hoursMap, breaksMap, daysOffMap,
  businessHours, branchDaysOff, agentTimeRef, tz, canCreate, onSelectAppt, onSlotClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dow = calDow(dateObj);

  // Time range
  const bRange = calRangeFromBH(businessHours, dow);
  const empHoursArr = employees.map(e => hoursMap.get(e.id) ?? []);
  const range = bRange ?? calComputeTimeRange(empHoursArr);
  const { startHour, endHour } = range;
  const hourCount = endHour - startHour;
  const pxPerMin  = ROW_H / 60;

  // Branch day off for today
  const branchDayOff = branchDaysOff.find(d => d.start_date <= dateISO && d.end_date >= dateISO);

  // Scroll now-line into view on mount
  useEffect(() => {
    const now = calAgentNow(agentTimeRef);
    if (!now || now.dateISO !== dateISO || !scrollRef.current) return;
    const top = Math.round((now.minutes - startHour*60) * pxPerMin);
    const el  = scrollRef.current;
    const target = Math.max(0, top - el.clientHeight / 3 + 40);
    setTimeout(() => el.scrollTo({ top: target, behavior: "smooth" }), 100);
  }, [dateISO]); // eslint-disable-line react-hooks/exhaustive-deps

  const agentNow = calAgentNow(agentTimeRef);
  const showNow  = agentNow && agentNow.dateISO === dateISO;
  const nowTop   = showNow ? Math.round((agentNow.minutes - startHour*60) * pxPerMin) : -1;

  const EMP_MIN_W = 160;
  const AXIS_W    = 64;

  return (
    <div ref={scrollRef} className="overflow-auto flex-1" style={{ position: "relative" }}>
      <div style={{ minWidth: AXIS_W + employees.length * EMP_MIN_W }}>
        {/* Employee headers */}
        <div className="sticky top-0 z-20 bg-canvas border-b border-hairline flex"
          style={{ paddingLeft: AXIS_W }}>
          {employees.map(emp => {
            const color   = calEmpColor(emp.id);
            const initials = emp.name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
            return (
              <div key={emp.id} className="flex items-center gap-2 px-3 py-2 border-l border-hairline"
                style={{ minWidth: EMP_MIN_W, flex: 1 }}>
                {emp.profile_picture_url
                  ? <img src={emp.profile_picture_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-7 h-7 rounded-full grid place-items-center text-xs font-semibold text-white flex-shrink-0"
                      style={{ background: color }}>{initials}</div>
                }
                <div className="min-w-0">
                  <div className={`text-xs font-semibold truncate ${emp.active ? "text-ink" : "text-muted line-through"}`}>{emp.name}</div>
                  {!emp.active && <div className="text-[10px] text-amber-600">Inactive</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex">
          {/* Time axis */}
          <div className="flex-shrink-0 border-r border-hairline relative" style={{ width: AXIS_W }}>
            {/* Now dot */}
            {showNow && nowTop >= 0 && nowTop <= hourCount*ROW_H && (
              <div className="absolute right-0 w-2.5 h-2.5 rounded-full bg-red-500 z-10 -translate-y-1/2 -translate-x-1/2"
                style={{ top: nowTop + 40 }} />
            )}
            {Array.from({ length: hourCount }, (_, i) => startHour + i).map(h => (
              <div key={h} className="border-b border-hairline flex items-start justify-end px-1.5"
                style={{ height: ROW_H }}>
                <span className="text-[10px] text-muted -translate-y-2">{calFmtTimeLabel(h)}</span>
              </div>
            ))}
          </div>

          {/* Employee columns */}
          {employees.map(emp => {
            const todayHours  = (hoursMap.get(emp.id) ?? []).filter(h => h.day_of_week === dow);
            const todayBreaks = (breaksMap.get(emp.id) ?? []).filter(b => b.day_of_week === dow);
            const empDayOff   = (daysOffMap.get(emp.id) ?? []).find(d => d.start_date <= dateISO && d.end_date >= dateISO);
            const dayOff      = branchDayOff ?? empDayOff;
            const isInactive  = !emp.active;
            const conflict    = isInactive || !!dayOff;

            const empAppts = appointments.filter(a => {
              if (Number(a.employee_id) !== emp.id) return false;
              const p = calApptLocalParts(a, tz);
              return p?.dateISO === dateISO;
            });

            return (
              <div key={emp.id} className="relative border-l border-hairline"
                style={{ minWidth: EMP_MIN_W, flex: 1 }}>
                {/* Hour cells */}
                {Array.from({ length: hourCount }, (_, i) => startHour + i).map(h => (
                  <div key={h} className={`border-b border-hairline/50 group ${canCreate && !dayOff ? "cursor-pointer hover:bg-primary/5" : ""}`}
                    style={{ height: ROW_H }}
                    onClick={() => { if (canCreate && !dayOff && !isInactive) onSlotClick(emp.id, dateISO, h); }}>
                    {canCreate && !dayOff && !isInactive && (
                      <span className="hidden group-hover:flex items-center gap-1 text-[10px] text-primary/70 px-2 pt-1">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        New
                      </span>
                    )}
                  </div>
                ))}

                {/* Working-hour bands */}
                {todayHours.map((wh, i) => {
                  const [sH,sM] = wh.start_time.split(":").map(Number);
                  const [eH,eM] = wh.end_time.split(":").map(Number);
                  const startMin = (sH*60+sM) - startHour*60;
                  const endMin   = (eH*60+eM) - startHour*60;
                  if (endMin<=0 || startMin>=hourCount*60) return null;
                  const top    = Math.round(Math.max(0,startMin) * pxPerMin);
                  const height = Math.round(Math.min(hourCount*60, endMin) * pxPerMin) - top;
                  return <div key={i} className="absolute left-0 right-0 bg-green-500/5 pointer-events-none" style={{ top, height }} />;
                })}

                {/* Break overlays */}
                {todayBreaks.map((br, i) => {
                  const [sH,sM] = br.start_time.split(":").map(Number);
                  const [eH,eM] = br.end_time.split(":").map(Number);
                  const startMin = (sH*60+sM) - startHour*60;
                  const endMin   = (eH*60+eM) - startHour*60;
                  if (endMin<=0 || startMin>=hourCount*60) return null;
                  const top    = Math.round(Math.max(0,startMin) * pxPerMin);
                  const height = Math.max(20, Math.round(Math.min(hourCount*60, endMin) * pxPerMin) - top);
                  return (
                    <div key={i} className="absolute left-0 right-0 bg-orange-100/70 border-l-2 border-orange-300 pointer-events-none"
                      style={{ top, height }}>
                      <span className="text-[9px] text-orange-700 px-1 truncate block">{br.reason ?? "Break"}</span>
                    </div>
                  );
                })}

                {/* Events */}
                <div className="absolute inset-0 pointer-events-none">
                  {empAppts.map(a => {
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
                {showNow && nowTop >= 0 && nowTop <= hourCount*ROW_H && (
                  <div className="absolute left-0 right-0 h-px bg-red-500 pointer-events-none z-10" style={{ top: nowTop }} />
                )}

                {/* Inactive overlay */}
                {isInactive && (
                  <div className="absolute inset-0 bg-gray-100/50 pointer-events-none flex items-start justify-center pt-4">
                    <span className="text-[10px] text-gray-400 bg-white px-2 py-0.5 rounded shadow-sm">Inactive</span>
                  </div>
                )}

                {/* Day-off overlay */}
                {dayOff && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center"
                    style={{ background: branchDayOff ? "rgba(239,246,255,0.85)" : "rgba(249,250,251,0.85)" }}>
                    <span className="text-xs text-muted bg-white px-3 py-1 rounded-full shadow-sm">
                      {branchDayOff ? (dayOff.name || "Branch closed") : (dayOff.name || "Day off")}
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
