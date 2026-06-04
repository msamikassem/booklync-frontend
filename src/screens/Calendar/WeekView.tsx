import { EventBlock } from "./EventBlock";
import {
  calDow, calApptLocalParts, calAgentNow, calWeekStart, calAddDays,
  calToISODate, calRangeFromBH, calComputeTimeRange,
} from "./utils";
import { ROW_H } from "./types";
import type { AgentTimeRef } from "./utils";
import type { AppointmentDetailResponse } from "./types";
import type { CalEmployee, CalWorkingHour, CalBreak, CalDayOff } from "./api";
import type { BusinessHourResponse } from "../../api/types";

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CalTimeLabel({ hour }: { hour: number }) {
  const h = ((hour % 24) + 24) % 24;
  let num: string, suf: string;
  if (h === 0)      { num = "12:00"; suf = "am"; }
  else if (h === 12){ num = "12:00"; suf = "pm"; }
  else if (h < 12)  { num = `${h}:00`; suf = "am"; }
  else              { num = `${h-12}:00`; suf = "pm"; }
  return <><span className="cal-time-cell-num">{num}</span><span className="cal-time-cell-suf">{suf}</span></>;
}

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

  // Widest BH range across all 7 days
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

  const agentNow      = calAgentNow(agentTimeRef);
  const weekStartISO  = calToISODate(weekStart);
  const weekEndISO    = calToISODate(calAddDays(weekStart, 6));
  const todayInWeek   = agentNow && agentNow.dateISO >= weekStartISO && agentNow.dateISO <= weekEndISO;

  const isEmpInactive = !employee.active;

  return (
    <>
      {isEmpInactive && (
        <div className="cal-inactive-notice">
          {employee.name} is inactive at this branch
        </div>
      )}
      <div className="cal-day-scroll">
        <div className="cal-week-wrap">
          {/* Time axis */}
          <div className="cal-time-axis" style={{ gridTemplateRows: `110px repeat(${hourCount}, ${ROW_H}px)` }}>
            <div className="cal-axis-corner" />
            {Array.from({ length: hourCount }, (_, i) => startHour + i).map(h => (
              <div key={h} className="cal-time-cell">
                <CalTimeLabel hour={h} />
              </div>
            ))}
          </div>

          {/* Right: header + columns */}
          <div>
            <div className="cal-week-headerstrip">
              {days.map(d => {
                const dISO    = calToISODate(d);
                const isToday = dISO === todayISO;
                return (
                  <div key={dISO} className={`cal-week-day-header${isToday ? " is-today" : ""}`}>
                    <span className="cal-week-day-name">{DOW_LABELS[calDow(d)]}</span>
                    <span className="cal-week-day-num">{d.getDate()}</span>
                  </div>
                );
              })}
            </div>

            <div className="cal-week-cols">
              {days.map(d => {
                const dow     = calDow(d);
                const dateISO = calToISODate(d);
                const isToday = dateISO === todayISO;

                const todayBreaks = breaks.filter(b => b.day_of_week === dow);
                const branchDayOff  = branchDaysOff.find(o => o.start_date <= dateISO && o.end_date >= dateISO);
                const empDayOff     = daysOff.find(o => o.start_date <= dateISO && o.end_date >= dateISO);
                const dayOff        = branchDayOff ?? empDayOff;
                const isBranchOff   = !!branchDayOff;
                const conflict      = isEmpInactive || !!dayOff;

                const nowTop = (todayInWeek && agentNow && agentNow.dateISO === dateISO)
                  ? Math.round((agentNow.minutes - startHour * 60) * pxPerMin)
                  : -1;

                const colAppts = appointments.filter(a => {
                  if (Number(a.employee_id) !== employee.id) return false;
                  const p = calApptLocalParts(a, tz);
                  return p?.dateISO === dateISO;
                });

                return (
                  <div key={dateISO}
                    className={`cal-week-col${isToday ? " is-today" : ""}${isEmpInactive ? " cal-week-col--inactive" : ""}`}
                    style={{ gridTemplateRows: `repeat(${hourCount}, ${ROW_H}px)` }}>

                    {/* Hour cells */}
                    {Array.from({ length: hourCount }, (_, i) => startHour + i).map(h => (
                      <div key={h} className="cal-hour-cell"
                        onClick={() => { if (canCreate && !dayOff && !isEmpInactive) onSlotClick(employee.id, dateISO, h); }} />
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
                    {colAppts.map(a => {
                      if ((a.status ?? "pending") === "cancelled") return null;
                      return (
                        <EventBlock key={a.id} appt={a} pxPerMin={pxPerMin} startHour={startHour}
                          hourCount={hourCount} todayBreaks={todayBreaks} conflict={conflict} tz={tz}
                          onClick={() => onSelectAppt(a)} />
                      );
                    })}

                    {/* Now line + dot */}
                    {isToday && nowTop >= 0 && nowTop <= hourCount * ROW_H && (
                      <>
                        <div className="cal-now-line" style={{ top: nowTop }} />
                        <div className="cal-now-dot cal-now-dot--col" style={{ top: nowTop }} />
                      </>
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
    </>
  );
}
