import { useRef, useEffect, useState } from "react";
import { EventBlock } from "./EventBlock";
import {
  calDow, calApptLocalParts, calAgentNow, calRangeFromBH, calComputeTimeRange, calEmpColor,
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

function CalTimeLabel({ hour }: { hour: number }) {
  const h = ((hour % 24) + 24) % 24;
  let num: string, suf: string;
  if (h === 0)      { num = "12:00"; suf = "am"; }
  else if (h === 12){ num = "12:00"; suf = "pm"; }
  else if (h < 12)  { num = `${h}:00`; suf = "am"; }
  else              { num = `${h-12}:00`; suf = "pm"; }
  return <><span className="cal-time-cell-num">{num}</span><span className="cal-time-cell-suf">{suf}</span></>;
}

export function DayView({
  dateISO, dateObj, employees, appointments, hoursMap, breaksMap, daysOffMap,
  businessHours, branchDaysOff, agentTimeRef, tz, canCreate, onSelectAppt, onSlotClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, setHoveredPrepAppt] = useState<number | null>(null);

  const dow = calDow(dateObj);
  const bRange = calRangeFromBH(businessHours, dow);
  const empHoursArr = employees.map(e => hoursMap.get(e.id) ?? []);
  const range = bRange ?? calComputeTimeRange(empHoursArr);
  const { startHour, endHour } = range;
  const hourCount = endHour - startHour;
  const pxPerMin  = ROW_H / 60;

  const branchDayOff = branchDaysOff.find(d => d.start_date <= dateISO && d.end_date >= dateISO);
  const agentNow = calAgentNow(agentTimeRef);
  const showNow  = agentNow && agentNow.dateISO === dateISO;
  const nowTop   = showNow ? Math.round((agentNow.minutes - startHour * 60) * pxPerMin) : -1;

  useEffect(() => {
    if (!showNow || !scrollRef.current || nowTop < 0) return;
    const el = scrollRef.current;
    const target = Math.max(0, nowTop - el.clientHeight / 3 + 40);
    setTimeout(() => el.scrollTo({ top: target, behavior: "smooth" }), 100);
  }, [dateISO]); // eslint-disable-line react-hooks/exhaustive-deps

  const EMP_MIN_W = 160;
  const AXIS_W    = 72;
  const minWrapW  = AXIS_W + employees.length * EMP_MIN_W;

  return (
    <div ref={scrollRef} className="cal-day-scroll">
      <div className="cal-day-wrap" style={{ minWidth: minWrapW }}>
        {/* Time axis */}
        <div className="cal-time-axis" style={{ gridTemplateRows: `110px repeat(${hourCount}, ${ROW_H}px)` }}>
          <div className="cal-axis-corner" />
          {Array.from({ length: hourCount }, (_, i) => startHour + i).map(h => (
            <div key={h} className="cal-time-cell">
              <CalTimeLabel hour={h} />
            </div>
          ))}
          {/* Now dot on axis right edge */}
          {showNow && nowTop >= 0 && nowTop <= hourCount * ROW_H && (
            <div className="cal-now-dot" style={{ top: 110 + nowTop }} />
          )}
        </div>

        {/* Right side: header + columns */}
        <div>
          <div className="cal-emp-headerstrip"
            style={{ gridTemplateColumns: `repeat(${employees.length}, minmax(${EMP_MIN_W}px, 1fr))` }}>
            {employees.map(emp => {
              const color    = calEmpColor(emp.id);
              const initials = emp.name.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
              const inactive = !emp.active;
              return (
                <div key={emp.id} className={`cal-emp-col-header${inactive ? " cal-emp-col-header--inactive" : ""}`}>
                  <div className="cal-emp-avatar" style={emp.profile_picture_url ? undefined : { background: color }}>
                    {emp.profile_picture_url
                      ? <img src={emp.profile_picture_url} alt="" />
                      : initials}
                  </div>
                  <div className="cal-emp-meta">
                    <span className="cal-emp-name">{emp.name || "—"}</span>
                    {inactive && <span className="cal-emp-inactive-badge">Inactive</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="cal-emp-cols"
            style={{ gridTemplateColumns: `repeat(${employees.length}, minmax(${EMP_MIN_W}px, 1fr))` }}>
            {employees.map(emp => {
              const todayBreaks = (breaksMap.get(emp.id) ?? []).filter(b => b.day_of_week === dow);
              const empDayOff   = (daysOffMap.get(emp.id) ?? []).find(d => d.start_date <= dateISO && d.end_date >= dateISO);
              const dayOff      = branchDayOff ?? empDayOff;
              const isBranchOff = !!branchDayOff;
              const isInactive  = !emp.active;
              const conflict    = isInactive || !!dayOff;

              const empAppts = appointments.filter(a => {
                if (Number(a.employee_id) !== emp.id) return false;
                const p = calApptLocalParts(a, tz);
                return p?.dateISO === dateISO;
              });

              return (
                <div key={emp.id} className={`cal-emp-body${isInactive ? " cal-emp-body--inactive" : ""}`}>
                  {/* Hour cells */}
                  {Array.from({ length: hourCount }, (_, i) => startHour + i).map(h => (
                    <div key={h} className="cal-hour-cell"
                      onClick={() => { if (canCreate && !dayOff && !isInactive) onSlotClick(emp.id, dateISO, h); }}>
                      {canCreate && !dayOff && !isInactive && (
                        <span className="cal-hour-add-hint">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          New
                        </span>
                      )}
                    </div>
                  ))}

                  {/* Break overlays */}
                  {todayBreaks.map((br, i) => {
                    const [sH, sM] = br.start_time.split(":").map(Number);
                    const [eH, eM] = br.end_time.split(":").map(Number);
                    const startMin = (sH * 60 + sM) - startHour * 60;
                    const endMin   = (eH * 60 + eM) - startHour * 60;
                    if (endMin <= 0 || startMin >= hourCount * 60) return null;
                    const top    = Math.round(Math.max(0, startMin) * pxPerMin);
                    const height = Math.max(20, Math.round(Math.min(hourCount * 60, endMin) * pxPerMin) - top);
                    return (
                      <div key={i} className="cal-break-overlay" style={{ top, height }}>
                        <span className="cal-break-overlay-label">{br.reason || "Break"}</span>
                      </div>
                    );
                  })}

                  {/* Events */}
                  {empAppts.map(a => {
                    if ((a.status ?? "pending") === "cancelled") return null;
                    const breaks = (breaksMap.get(emp.id) ?? []).filter(b => b.day_of_week === dow);
                    return (
                      <EventBlock key={a.id} appt={a} pxPerMin={pxPerMin} startHour={startHour}
                        hourCount={hourCount} todayBreaks={breaks} conflict={conflict} tz={tz}
                        onClick={() => onSelectAppt(a)}
                        onMouseEnter={() => setHoveredPrepAppt(a.id)}
                        onMouseLeave={() => setHoveredPrepAppt(null)}
                      />
                    );
                  })}

                  {/* Now line */}
                  {showNow && nowTop >= 0 && nowTop <= hourCount * ROW_H && (
                    <div className="cal-now-line" style={{ top: nowTop }} />
                  )}

                  {/* Inactive overlay */}
                  {isInactive && (
                    <div className="cal-inactive-overlay">
                      <span className="cal-inactive-overlay-label">Inactive</span>
                    </div>
                  )}

                  {/* Day-off overlay */}
                  {dayOff && (
                    <div className={`cal-dayoff-overlay${isBranchOff ? " cal-dayoff-overlay--branch" : ""}`}>
                      <span className="cal-dayoff-overlay-label">
                        {isBranchOff ? (dayOff.name || "Branch closed") : (dayOff.name || "Day off")}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
