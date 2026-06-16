import { apptBg } from "./EventBlock";
import { calApptLocalParts, calApptDuration, calApptShortTime } from "./utils";
import { ROW_H } from "./types";
import type { AppointmentDetailResponse } from "./types";

interface Props {
  /** Contiguous, same-employee appointments of one multi-service visit (start order, no cancelled). */
  appts: AppointmentDetailResponse[];
  pxPerMin: number;
  startHour: number;
  hourCount: number;
  tz?: string;
  onSelect: (appt: AppointmentDetailResponse) => void;
}

/**
 * One multi-service visit rendered as a single rounded block split into a
 * colour band per service. The prep buffers *between* services are hidden
 * (they were deliberately collapsed at booking — the client is in the chair
 * the whole time); only the visit's outer prep is drawn: the first service's
 * before-prep and the last service's after-prep. Each band is independently
 * clickable and carries its own status styling.
 */
export function VisitBlock({ appts, pxPerMin, startHour, hourCount, tz, onSelect }: Props) {
  const first = appts[0];
  const last = appts[appts.length - 1];
  const fp = calApptLocalParts(first, tz);
  const lp = calApptLocalParts(last, tz);
  if (!fp || !lp) return null;

  const blockTop = Math.round((fp.minutes - startHour * 60) * pxPerMin);

  // Each service band is sized to its duration but never shrinks below one
  // readable line (MIN_BAND) — so a short service (e.g. 7 min) is never hidden,
  // the same way a single appointment never shrinks below one line. The block
  // grows to the sum of the band heights, so a visit made of short services is a
  // little taller than its exact end time (the trade-off for keeping every
  // service visible). The block's TOP still aligns with the real start time.
  const MIN_BAND = 24;
  let acc = 0;
  const bands = appts.map(a => {
    const height = Math.max(MIN_BAND, Math.round(calApptDuration(a) * pxPerMin));
    const top = acc;
    acc += height;
    return { appt: a, top, height };
  });
  const blockHeight = acc;
  if (blockTop + blockHeight < 0 || blockTop > hourCount * ROW_H) return null;

  const prepBefore = first.preparation_before_minutes ?? 0;
  const prepAfter = last.preparation_after_minutes ?? 0;
  const firstBg = apptBg(first);
  const lastBg = apptBg(last);

  return (
    <>
      {prepBefore > 0 && (() => {
        const sh = Math.max(3, Math.round(prepBefore * pxPerMin));
        let st = blockTop - sh, vh = sh;
        if (st < 0) { vh += st; st = 0; }
        if (vh < 3) return null;
        return <div className="cal-prep-strip" style={{ top: st, height: vh, borderRadius: "6px 6px 0 0", background: firstBg }} />;
      })()}

      <div className="cal-visit" style={{ top: blockTop, height: blockHeight }}>
        {bands.map(({ appt: a, top, height }, i) => {
          const status = a.status ?? "pending";
          return (
            <div
              key={a.id}
              className={`cal-visit-seg cal-event--${status}`}
              style={{ top, height, background: apptBg(a), borderTop: i > 0 ? "1px solid rgba(255,255,255,0.55)" : "none" }}
              data-appt-id={a.id}
              onClick={(e) => { e.stopPropagation(); onSelect(a); }}
            >
              <div className="cal-ev-inner">
                <span className="cal-ev-time">{calApptShortTime(a, "start", tz)}</span>
                <span className="cal-ev-name">{i === 0 ? (a.customer_name ?? "Customer") : (a.service_name ?? "")}</span>
                {i === 0 && a.service_name && <span className="cal-ev-svc">{a.service_name}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {prepAfter > 0 && (() => {
        const sh = Math.max(3, Math.round(prepAfter * pxPerMin));
        return <div className="cal-prep-strip" style={{ top: blockTop + blockHeight, height: sh, borderRadius: "0 0 6px 6px", background: lastBg }} />;
      })()}
    </>
  );
}
