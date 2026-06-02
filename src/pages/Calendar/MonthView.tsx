import {
  calToISODate, calWeekStart, calAddDays, calDow,
  calApptLocalParts, calApptShortTime, calSvcColorStyle, calServiceColorClass,
} from "./utils";
import type { AppointmentDetailResponse } from "./types";
import type { CalEmployee, CalBreak, CalDayOff } from "./api";
import type { BusinessHourResponse } from "../../api/types";

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

export function MonthView({
  currentDate, todayISO, employees, appointments, breaksMap, daysOffMap,
  branchDaysOff, tz, selectedEmpId, onDayClick, onSelectAppt,
}: Props) {
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd   = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const gridStart  = calWeekStart(monthStart);
  const gridEnd    = calAddDays(calWeekStart(monthEnd), 6);
  const monthISO   = calToISODate(monthStart).slice(0, 7);

  // Single-employee filter (like old app — week/month default to first)
  const activeEmpId = selectedEmpId ?? (employees[0]?.id ?? null);
  const activeEmp   = employees.find(e => e.id === activeEmpId) ?? null;
  const isEmpInactive = activeEmp ? !activeEmp.active : false;

  // Group appointments by date for the active employee
  const byDate = new Map<string, AppointmentDetailResponse[]>();
  for (const a of appointments) {
    if (activeEmpId != null && Number(a.employee_id) !== activeEmpId) continue;
    const p = calApptLocalParts(a, tz);
    if (!p) continue;
    const list = byDate.get(p.dateISO) ?? [];
    list.push(a);
    byDate.set(p.dateISO, list);
  }

  // Build cells
  const cells: React.ReactElement[] = [];
  let cursor = new Date(gridStart);
  while (calToISODate(cursor) <= calToISODate(gridEnd)) {
    const dateISO  = calToISODate(cursor);
    const dow      = calDow(cursor);
    const inMonth  = dateISO.slice(0, 7) === monthISO;
    const isToday  = dateISO === todayISO;

    const dayAppts = (byDate.get(dateISO) ?? [])
      .slice().sort((a, b) => (a.start_time ?? "") < (b.start_time ?? "") ? -1 : 1);

    const breaks   = activeEmpId != null ? (breaksMap.get(activeEmpId) ?? []) : [];
    const hasBreak = breaks.some(b => b.day_of_week === dow);

    const branchDayOff = branchDaysOff.find(o => o.start_date <= dateISO && o.end_date >= dateISO);
    const empDayOff = activeEmpId != null
      ? (daysOffMap.get(activeEmpId) ?? []).find(o => o.start_date <= dateISO && o.end_date >= dateISO)
      : undefined;
    const dayOff = branchDayOff ?? empDayOff;
    const cellConflict = isEmpInactive || !!dayOff || hasBreak;

    const visible  = dayAppts.slice(0, 3);
    const overflow = dayAppts.length - visible.length;

    cells.push(
      <div key={dateISO}
        className={[
          "cal-month-cell",
          !inMonth ? "is-outside" : "",
          isToday  ? "is-today"  : "",
          dayOff   ? "has-dayoff" : "",
          isEmpInactive ? "is-inactive" : "",
        ].filter(Boolean).join(" ")}
        data-iso={dateISO}
        onClick={() => onDayClick(dateISO)}>

        <div className="cal-month-day-row">
          <span className="cal-month-day">{cursor.getDate()}</span>
        </div>

        {hasBreak && <span className="cal-month-break-tick" title="Has scheduled breaks" />}

        <div className="cal-month-pills">
          {visible.map(a => {
            const status    = a.status ?? "pending";
            const colorCls  = calServiceColorClass(a);
            const svcStyle  = calSvcColorStyle(a.service_color ?? null);
            const pillClass = [
              "cal-month-pill",
              svcStyle ? "" : `cal-month-pill--${colorCls}`,
              `cal-month-pill--${status}`,
              cellConflict ? "cal-month-pill--conflict" : "",
            ].filter(Boolean).join(" ");
            const inlineStyle = svcStyle
              ? { background: svcStyle }
              : undefined;
            return (
              <span key={a.id} className={pillClass} style={inlineStyle}
                onClick={e => { e.stopPropagation(); onSelectAppt(a); }}>
                <span className="cal-month-pill-time">{calApptShortTime(a, "start", tz)}</span>
                <span className="cal-month-pill-name">{a.customer_name ?? "Customer"}</span>
              </span>
            );
          })}
          {overflow > 0 && (
            <span className="cal-month-more">+{overflow} more</span>
          )}
          {dayOff && (
            <span className="cal-month-more" style={{ color: "#475569" }}>
              {dayOff.name || (branchDayOff ? "Branch closed" : "Day off")}
            </span>
          )}
        </div>
      </div>
    );

    cursor = calAddDays(cursor, 1);
  }

  return (
    <div className="cal-month-wrap">
      {isEmpInactive && activeEmp && (
        <div className="cal-inactive-notice">
          {activeEmp.name} is inactive at this branch
        </div>
      )}
      <div className="cal-month-header">
        {DOW_LABELS.map(d => (
          <div key={d} className="cal-month-dow">{d}</div>
        ))}
      </div>
      <div className="cal-month-grid">
        {cells}
      </div>
    </div>
  );
}
