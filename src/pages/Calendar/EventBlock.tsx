/**
 * CalendarEvent — positioned appointment block with optional prep-time strips.
 *
 * Prep strips are rendered flush above/below the event (border-radius squared
 * on the touching corners so strip + event form one connected shape).
 * Hovering the event lifts both strips via a CSS class.
 */

import { useState } from "react";
import { calApptLocalParts, calApptDuration, calApptShortTime, calSvcColorStyle, calServiceColorClass } from "./utils";
import type { AppointmentDetailResponse } from "./types";
import type { CalBreak } from "./api";

const STATUS_HUE: Record<string, string> = {
  pending:   "border-yellow-400",
  confirmed: "border-blue-400",
  cancelled: "border-gray-300 opacity-40",
  completed: "border-green-400",
  no_show:   "border-red-400 opacity-60",
};

interface Props {
  appt: AppointmentDetailResponse;
  pxPerMin: number;
  startHour: number;
  hourCount: number;
  todayBreaks: CalBreak[];
  conflict?: boolean;
  tz?: string;
  onClick: () => void;
}

export function EventBlock({ appt, pxPerMin, startHour, hourCount, todayBreaks, conflict, tz, onClick }: Props) {
  const [hovered, setHovered] = useState(false);
  const p = calApptLocalParts(appt, tz);
  if (!p) return null;

  const dur    = Math.max(15, calApptDuration(appt));
  const top    = Math.round((p.minutes - startHour*60) * pxPerMin);
  const height = Math.max(20, Math.round(dur * pxPerMin) - 2);
  if (top + height < 0 || top > hourCount * 64) return null;

  const status   = appt.status ?? "pending";
  const colorCls = calServiceColorClass(appt);
  const bgColor  = calSvcColorStyle(appt.service_color ?? null);
  const startStr = calApptShortTime(appt, "start", tz);
  const endStr   = calApptShortTime(appt, "end", tz);
  const timeStr  = endStr ? `${startStr} – ${endStr}` : startStr;

  const apptEnd = p.minutes + dur;
  const hasBreakConflict = conflict || todayBreaks.some(br => {
    const [sH,sM] = br.start_time.split(":").map(Number);
    const [eH,eM] = br.end_time.split(":").map(Number);
    return apptEnd > (sH*60+sM) && p.minutes < (eH*60+eM);
  });

  const prepBefore = appt.preparation_before_minutes ?? 0;
  const prepAfter  = appt.preparation_after_minutes  ?? 0;

  // Square touching corners
  const borderRadius = prepBefore>0 && prepAfter>0 ? "0"
    : prepBefore>0 ? "0 0 6px 6px"
    : prepAfter>0  ? "6px 6px 0 0"
    : "6px";

  const liftStyle = hovered ? "translateY(-1px)" : undefined;
  const shadow    = hovered ? "0 4px 12px rgba(15,23,42,0.15)" : undefined;

  return (
    <>
      {/* Prep-before strip */}
      {prepBefore > 0 && (() => {
        const sh = Math.max(3, Math.round(prepBefore * pxPerMin));
        let st = top - sh;
        let vh = sh;
        if (st < 0) { vh += st; st = 0; }
        if (vh < 3) return null;
        return (
          <div className="absolute left-0.5 right-0.5 pointer-events-none"
            style={{ top: st, height: vh, borderRadius: "6px 6px 0 0", opacity: 0.35,
              transform: liftStyle, transition: "transform 0.1s, box-shadow 0.1s",
              background: bgColor || undefined, ...(bgColor ? {} : { backgroundColor: `var(--cal-color-${colorCls})` }) }} />
        );
      })()}

      {/* Main event block */}
      <div className={`absolute left-0.5 right-0.5 cursor-pointer overflow-hidden select-none
        ${STATUS_HUE[status] ?? "border-gray-300"} border-l-2
        ${hasBreakConflict ? "ring-1 ring-red-400" : ""}
        ${hovered ? "z-10" : "z-0"}`}
        style={{ top, height, borderRadius,
          background: bgColor || undefined,
          transform: liftStyle,
          boxShadow: shadow,
          transition: "transform 0.1s, box-shadow 0.1s",
          ...(bgColor ? {} : {}) }}
        data-appt-id={appt.id}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Color fill when no service color */}
        {!bgColor && (
          <div className={`absolute inset-0 cal-ev-bg-${colorCls}`}
            style={{ background: `var(--cal-event-${colorCls}, rgba(37,99,235,0.15))` }} />
        )}
        <div className="relative px-1.5 py-0.5">
          <div className="text-[10px] font-medium text-ink/70 leading-tight truncate">{timeStr}</div>
          <div className="text-xs font-semibold text-ink leading-tight truncate">{appt.customer_name ?? "Customer"}</div>
          {appt.service_name && height > 36 && (
            <div className="text-[10px] text-ink/60 leading-tight truncate">{appt.service_name}</div>
          )}
        </div>
      </div>

      {/* Prep-after strip */}
      {prepAfter > 0 && (() => {
        const sh = Math.max(3, Math.round(prepAfter * pxPerMin));
        return (
          <div className="absolute left-0.5 right-0.5 pointer-events-none"
            style={{ top: top+height, height: sh, borderRadius: "0 0 6px 6px", opacity: 0.35,
              transform: liftStyle, transition: "transform 0.1s, box-shadow 0.1s",
              background: bgColor || undefined }} />
        );
      })()}
    </>
  );
}
