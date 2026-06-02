/**
 * Month view — 6-row Monday-anchored grid.
 * Shows appointment pills (max 3 per cell, "+N more" overflow),
 * break tick marks, and day-off shading.
 * Clicking a date cell navigates to day view.
 * No time axis; appointment positions are by order only.
 */

import {
  calToISODate, calWeekStart, calAddDays, calDow,
  calApptLocalParts, calApptShortTime, calSvcColorStyle, calServiceColorClass,
  MONTH_LONG, DOW_SHORT,
} from "./utils";
import type { AppointmentDetailResponse } from "./types";
import type { CalEmployee, CalBreak, CalDayOff } from "./api";
import type { BusinessHourResponse } from "../../api/types";

interface Props {
  currentDate: Date;
  todayISO: string;
  employees: CalEmployee[];
  appointments: AppointmentDetailResponse[];
  breaksMap: Map<number, CalBreak[]>;
  daysOffMap: Map<number, CalDayOff[]>;
  businessHours: BusinessHourResponse[];
  branchDaysOff: CalDayOff[];
  tz: string;
  selectedEmpId: number | null;
  onDayClick: (dateISO: string) => void;
  onSelectAppt: (appt: AppointmentDetailResponse) => void;
}

const STATUS_DOT: Record<string, string> = {
  pending:   "bg-yellow-400",
  confirmed: "bg-blue-400",
  completed: "bg-green-400",
  no_show:   "bg-red-400",
  cancelled: "bg-gray-300",
};

export function MonthView({
  currentDate, todayISO, employees, appointments, breaksMap, daysOffMap,
  businessHours, branchDaysOff, tz, selectedEmpId, onDayClick, onSelectAppt,
}: Props) {
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const gridStart  = calWeekStart(monthStart);
  // Always 6 rows (42 days) to keep grid height stable
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => calAddDays(gridStart, i));
  const monthISO = calToISODate(monthStart).slice(0, 7); // "YYYY-MM"

  // Filter employees for display
  const visibleEmps = selectedEmpId
    ? employees.filter(e => e.id === selectedEmpId)
    : employees;

  // Build a quick lookup: dateISO → appointments[]
  const apptsByDate = new Map<string, AppointmentDetailResponse[]>();
  for (const a of appointments) {
    if ((a.status ?? "pending") === "cancelled") continue;
    if (selectedEmpId && Number(a.employee_id) !== selectedEmpId) continue;
    const p = calApptLocalParts(a, tz);
    if (!p) continue;
    const list = apptsByDate.get(p.dateISO) ?? [];
    list.push(a);
    apptsByDate.set(p.dateISO, list);
  }

  // Check if any employee has a break on a given day-of-week
  function hasBreakOnDow(dow: number): boolean {
    if (!visibleEmps.length) return false;
    for (const e of visibleEmps) {
      const empBreaks = breaksMap.get(e.id) ?? [];
      if (empBreaks.some(b => b.day_of_week === dow)) return true;
    }
    return false;
  }

  // Is the branch open on this day?
  function isBranchOpen(dow: number): boolean {
    return businessHours.some(bh => bh.day_of_week === dow);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < 42; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Month/year header */}
      <div className="px-4 py-2 border-b border-hairline">
        <span className="text-sm font-semibold text-ink">
          {MONTH_LONG[currentDate.getMonth()]} {currentDate.getFullYear()}
        </span>
      </div>

      {/* Day-of-week column headers */}
      <div className="grid grid-cols-7 border-b border-hairline bg-canvas">
        {DOW_SHORT.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted uppercase py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-hairline" style={{ minHeight: 96 }}>
            {week.map(d => {
              const dateISO = calToISODate(d);
              const isToday = dateISO === todayISO;
              const inMonth = dateISO.slice(0, 7) === monthISO;
              const dow     = calDow(d);

              const branchDayOff = branchDaysOff.find(o => o.start_date <= dateISO && o.end_date >= dateISO);
              const empDayOff    = (() => {
                if (!visibleEmps.length) return undefined;
                for (const e of visibleEmps) {
                  const found = (daysOffMap.get(e.id) ?? []).find(o => o.start_date <= dateISO && o.end_date >= dateISO);
                  if (found) return found;
                }
              })();
              const dayOff   = branchDayOff ?? empDayOff;
              const closed   = !isBranchOpen(dow);
              const hasBreak = hasBreakOnDow(dow);

              const cellAppts = apptsByDate.get(dateISO) ?? [];
              // Sort by start time
              const sorted = [...cellAppts].sort((a, b) => (a.start_time ?? "") < (b.start_time ?? "") ? -1 : 1);
              const shown  = sorted.slice(0, 3);
              const extra  = sorted.length - 3;

              return (
                <div
                  key={dateISO}
                  className={`relative border-r border-hairline last:border-r-0 p-1 cursor-pointer
                    ${isToday ? "bg-primary/5" : ""}
                    ${!inMonth ? "bg-gray-50/60" : ""}
                    ${dayOff || closed ? "bg-gray-50/80" : ""}
                    hover:bg-primary/[0.03] transition-colors`}
                  onClick={() => onDayClick(dateISO)}
                >
                  {/* Date number */}
                  <div className={`text-[11px] font-semibold w-5 h-5 rounded-full flex items-center justify-center mb-0.5
                    ${isToday ? "bg-primary text-white" : inMonth ? "text-ink" : "text-muted"}`}>
                    {d.getDate()}
                  </div>

                  {/* Closed / day-off tag */}
                  {(dayOff || closed) && (
                    <div className="text-[8px] text-muted bg-white px-1 py-px rounded-full shadow-sm inline-block mb-0.5">
                      {dayOff ? (dayOff.name || (branchDayOff ? "Closed" : "Day off")) : "Closed"}
                    </div>
                  )}

                  {/* Break tick */}
                  {hasBreak && !dayOff && (
                    <div className="w-full h-0.5 bg-orange-200 rounded mb-0.5" />
                  )}

                  {/* Appointment pills */}
                  <div className="flex flex-col gap-px">
                    {shown.map(a => {
                      const status   = a.status ?? "pending";
                      const colorCls = calServiceColorClass(a);
                      const bgColor  = calSvcColorStyle(a.service_color ?? null);
                      const timeStr  = calApptShortTime(a, "start", tz);
                      const dotCls   = STATUS_DOT[status] ?? "bg-gray-300";
                      return (
                        <div
                          key={a.id}
                          className="flex items-center gap-0.5 px-1 py-px rounded text-[9px] truncate cursor-pointer"
                          style={{
                            background: bgColor || `var(--cal-event-${colorCls}, rgba(37,99,235,0.12))`,
                          }}
                          onClick={e => { e.stopPropagation(); onSelectAppt(a); }}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`} />
                          <span className="text-ink/80 font-medium truncate">{timeStr} {a.customer_name ?? ""}</span>
                        </div>
                      );
                    })}
                    {extra > 0 && (
                      <div className="text-[9px] text-primary px-1 font-medium">+{extra} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
