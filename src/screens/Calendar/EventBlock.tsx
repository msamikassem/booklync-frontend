import { calApptLocalParts, calApptDuration, calApptShortTime, calSvcColorStyle, calServiceColorClass } from "./utils";
import { ROW_H } from "./types";
import type { AppointmentDetailResponse } from "./types";
import type { CalBreak } from "./api";

// Fresha-style pastel palette — applied via inline style so CSS load order can never override them
const PALETTE = [
  "#a3d9e8", // sky
  "#a3e8c8", // mint
  "#ffc6dc", // light pink
  "#ff9ec0", // hot pink
  "#ffd699", // peach
  "#ffb380", // orange
  "#d4c1f0", // lavender
  "#c5e8a3", // lime
];

function paletteColor(cls: string): string {
  const idx = parseInt(cls.replace("c", ""), 10);
  return PALETTE[isNaN(idx) ? 0 : idx % PALETTE.length];
}

/** Resolve an appointment's block background: explicit service colour, else palette. */
export function apptBg(appt: AppointmentDetailResponse): string {
  return calSvcColorStyle(appt.service_color ?? null) || paletteColor(calServiceColorClass(appt));
}

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
  const p = calApptLocalParts(appt, tz);
  if (!p) return null;

  const dur    = Math.max(15, calApptDuration(appt));
  const top    = Math.round((p.minutes - startHour * 60) * pxPerMin);
  const height = Math.max(20, Math.round(dur * pxPerMin) - 2);
  if (top + height < 0 || top > hourCount * ROW_H) return null;

  const status   = appt.status ?? "pending";
  const bg       = apptBg(appt);

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

  const evStyle: React.CSSProperties = {
    top, height,
    background: bg,
    ...(evRadius ? { borderRadius: evRadius } : {}),
  };

  return (
    <>
      {prepBefore > 0 && (() => {
        const sh = Math.max(3, Math.round(prepBefore * pxPerMin));
        let st = top - sh, vh = sh;
        if (st < 0) { vh += st; st = 0; }
        if (vh < 3) return null;
        return <div className="cal-prep-strip" style={{ top: st, height: vh, borderRadius: "6px 6px 0 0", background: bg }} />;
      })()}

      <div
        className={`cal-event cal-event--${status}${hasBreakConflict ? " cal-event--conflict" : ""}`}
        style={evStyle}
        data-appt-id={appt.id}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <div className="cal-ev-inner">
          <span className="cal-ev-time">{timeStr}</span>
          <span className="cal-ev-name">{appt.customer_name ?? "Customer"}</span>
          {appt.service_name && <span className="cal-ev-svc">{appt.service_name}</span>}
        </div>
      </div>

      {prepAfter > 0 && (() => {
        const sh = Math.max(3, Math.round(prepAfter * pxPerMin));
        return <div className="cal-prep-strip" style={{ top: top + height, height: sh, borderRadius: "0 0 6px 6px", background: bg }} />;
      })()}
    </>
  );
}
