import { calApptLocalParts, calApptDuration, calApptShortTime, calSvcColorStyle, calServiceColorClass } from "./utils";
import type { AppointmentDetailResponse } from "./types";
import type { CalBreak } from "./api";

interface Props {
  appt: AppointmentDetailResponse;
  pxPerMin: number;
  startHour: number;
  hourCount: number;
  todayBreaks: CalBreak[];
  conflict?: boolean;
  tz?: string;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function EventBlock({ appt, pxPerMin, startHour, hourCount, todayBreaks, conflict, tz, onClick, onMouseEnter, onMouseLeave }: Props) {
  const p = calApptLocalParts(appt, tz);
  if (!p) return null;

  const dur    = Math.max(15, calApptDuration(appt));
  const top    = Math.round((p.minutes - startHour * 60) * pxPerMin);
  const height = Math.max(20, Math.round(dur * pxPerMin) - 2);
  if (top + height < 0 || top > hourCount * 64) return null;

  const status   = appt.status ?? "pending";
  const colorCls = calServiceColorClass(appt);
  const svcStyle = calSvcColorStyle(appt.service_color ?? null);
  const startStr = calApptShortTime(appt, "start", tz);
  const endStr   = calApptShortTime(appt, "end", tz);
  const timeStr  = endStr ? `${startStr} – ${endStr}` : startStr;

  const apptEnd = p.minutes + dur;
  const hasBreakConflict = conflict || todayBreaks.some(br => {
    const [sH, sM] = br.start_time.split(":").map(Number);
    const [eH, eM] = br.end_time.split(":").map(Number);
    return apptEnd > (sH * 60 + sM) && p.minutes < (eH * 60 + eM);
  });

  const prepBefore = appt.preparation_before_minutes ?? 0;
  const prepAfter  = appt.preparation_after_minutes  ?? 0;

  const evRadius = prepBefore > 0 && prepAfter > 0 ? "0"
    : prepBefore > 0 ? "0 0 6px 6px"
    : prepAfter  > 0 ? "6px 6px 0 0"
    : "";

  const evColorClass  = svcStyle ? "" : `cal-event--${colorCls}`;
  const evStyle: React.CSSProperties = {
    top, height,
    ...(evRadius ? { borderRadius: evRadius } : {}),
    ...(svcStyle ? { background: svcStyle } : {}),
  };

  return (
    <>
      {prepBefore > 0 && (() => {
        const sh = Math.max(3, Math.round(prepBefore * pxPerMin));
        let st = top - sh, vh = sh;
        if (st < 0) { vh += st; st = 0; }
        if (vh < 3) return null;
        const stripClass = svcStyle ? "" : `cal-event--${colorCls}`;
        const stripStyle: React.CSSProperties = {
          top: st, height: vh, borderRadius: "6px 6px 0 0",
          ...(svcStyle ? { background: svcStyle } : {}),
        };
        return <div className={`cal-prep-strip ${stripClass}`} style={stripStyle} />;
      })()}

      <div
        className={`cal-event ${evColorClass} cal-event--${status}${hasBreakConflict ? " cal-event--conflict" : ""}`}
        style={evStyle}
        data-appt-id={appt.id}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="cal-ev-inner">
          <span className="cal-ev-time">{timeStr}</span>
          <span className="cal-ev-name">{appt.customer_name ?? "Customer"}</span>
          {appt.service_name && <span className="cal-ev-svc">{appt.service_name}</span>}
        </div>
      </div>

      {prepAfter > 0 && (() => {
        const sh = Math.max(3, Math.round(prepAfter * pxPerMin));
        const stripClass = svcStyle ? "" : `cal-event--${colorCls}`;
        const stripStyle: React.CSSProperties = {
          top: top + height, height: sh, borderRadius: "0 0 6px 6px",
          ...(svcStyle ? { background: svcStyle } : {}),
        };
        return <div className={`cal-prep-strip ${stripClass}`} style={stripStyle} />;
      })()}
    </>
  );
}
