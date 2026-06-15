import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi } from "./api";
import { customers as customersApi } from "../../api";
import { formatApiError } from "../../lib/errors";
import { cn, getInitials, avatarColor } from "../../lib/utils";
import { fmtDate, fmtTime, apptDuration, fmtPhone } from "./utils";
import { STATUS_LABELS, SOURCE_LABELS } from "./types";
import type { AppointmentDetailResponse, ApiError } from "./types";
import { Sheet, SheetContent, SheetClose, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";

const STATUS_OPTIONS = ["pending", "confirmed", "cancelled", "completed", "no_show"];
const STAFF_ALLOWED = new Set(["completed", "no_show", "cancelled"]);

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800 border-transparent hover:bg-yellow-100",
  confirmed: "bg-blue-100 text-blue-800 border-transparent hover:bg-blue-100",
  cancelled: "bg-gray-100 text-gray-500 border-transparent hover:bg-gray-100",
  completed: "bg-green-100 text-green-800 border-transparent hover:bg-green-100",
  no_show:   "bg-red-100 text-red-700 border-transparent hover:bg-red-100",
};


interface Props {
  appt: AppointmentDetailResponse;
  tz: string;
  isStaff: boolean;
  canUpdateStatus: boolean;
  onClose: () => void;
  onUpdated: (updated: AppointmentDetailResponse) => void;
  /** Status-change transport. Defaults to the full-dashboard endpoint; the staff
   *  own-calendar passes the `/staff/*` variant (the only one staff tokens allow). */
  updateStatus?: (id: number, status: string) => Promise<AppointmentDetailResponse>;
}

export function AppointmentDrawer({ appt, tz, isStaff, canUpdateStatus, onClose, onUpdated, updateStatus }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"details" | "history">("details");
  const [status, setStatus] = useState(appt.status ?? "pending");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = status !== appt.status;

  const { data: history, isLoading: histLoading, isError: histError } = useQuery({
    queryKey: ["customer-appointments", appt.customer_id],
    queryFn: () => customersApi.getAppointments(appt.customer_id!),
    enabled: tab === "history" && appt.customer_id != null,
    staleTime: 2 * 60 * 1000,
  });

  const historyOthers = (history ?? [])
    .filter(a => a.id !== appt.id)
    .sort((a, b) => new Date(b.start_time_local ?? b.start_time).getTime() - new Date(a.start_time_local ?? a.start_time).getTime());

  async function handleSave() {
    setSaving(true); setErr(null);
    try {
      const updated = await (updateStatus ?? appointmentsApi.updateStatus)(appt.id, status);
      qc.invalidateQueries({ queryKey: ["appointments"] });
      if (appt.customer_id) qc.invalidateQueries({ queryKey: ["customer-appointments", appt.customer_id] });
      onUpdated(updated);
      setStatus(updated.status ?? "pending");
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not update status."));
    } finally { setSaving(false); }
  }

  const local = appt.start_time_local ?? appt.start_time;
  const custName = appt.customer_name ?? "—";
  const initials = getInitials(custName);
  const color = avatarColor(custName);
  const durMins = apptDuration(appt);
  const phone = appt.customer_phone;
  const svcLabel = [appt.service_name, appt.variation_name].filter(Boolean).join(" — ");

  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" hideClose className="w-96 p-0 flex flex-col">
        <SheetTitle className="sr-only">{custName} — Appointment</SheetTitle>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-hairline flex-shrink-0">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarFallback style={{ background: color }} className="text-white text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-ink truncate">{custName}</div>
            <div className="text-xs text-muted">{fmtDate(local, tz)} · {fmtTime(local, tz)}</div>
            <div className="mt-0.5">
              <Badge className={cn("rounded-full text-[10px] font-medium", STATUS_BADGE[appt.status ?? "pending"] ?? "bg-gray-100 text-gray-600 border-transparent")}>
                {STATUS_LABELS[appt.status ?? "pending"] ?? appt.status}
              </Badge>
            </div>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="text-muted hover:text-ink h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </SheetClose>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-hairline px-5 flex-shrink-0">
          {(isStaff ? (["details"] as const) : (["details", "history"] as const)).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                "pb-3 pt-3 mr-5 text-sm font-medium border-b-2 transition-colors capitalize",
                tab === t ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink",
              )}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Details tab */}
          {tab === "details" && (
            <div className="flex flex-col">

              {/* Customer section */}
              <div className="flex flex-col gap-[11px] px-5 py-[18px]">
                <Row label="Customer" value={custName} />
                {phone && <Row label="Phone" value={fmtPhone(phone)} />}
              </div>

              <div className="h-px bg-hairline flex-shrink-0" />

              {/* Appointment section */}
              <div className="flex flex-col gap-[11px] px-5 py-[18px]">
                {svcLabel && <Row label="Service" value={svcLabel + (durMins ? ` · ${durMins} min` : "")} />}
                <Row label="Employee" value={appt.employee_name ?? "—"} />
                <Row label="Date & time" value={`${fmtDate(local, tz)} · ${fmtTime(local, tz)}`} />
                {appt.source && <Row label="Source" value={SOURCE_LABELS[appt.source] ?? appt.source} />}
              </div>

              {appt.note && (
                <>
                  <div className="h-px bg-hairline flex-shrink-0" />
                  <div className="px-5 py-[18px]">
                    <div className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Note</div>
                    <div className="text-[13px] text-ink italic leading-relaxed">{appt.note}</div>
                  </div>
                </>
              )}

              {canUpdateStatus && (
                <>
                  <div className="h-px bg-hairline flex-shrink-0" />
                  <div className="flex flex-col gap-3 px-5 py-[18px]">
                    <div className="text-xs font-medium text-muted uppercase tracking-wide">Status</div>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className="w-full border border-slate-300 shadow-[0_2px_8px_rgba(0,0,0,0.1)] font-medium text-ink">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                          <SelectItem key={s} value={s} disabled={isStaff && !STAFF_ALLOWED.has(s)}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}
                    {dirty && (
                      <div className="flex gap-2">
                        <Button onClick={handleSave} disabled={saving} className="flex-1">
                          {saving ? "Saving…" : "Save changes"}
                        </Button>
                        <Button variant="outline" onClick={() => { setStatus(appt.status ?? "pending"); setErr(null); }}>
                          Reset
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* History tab */}
          {tab === "history" && !isStaff && (
            <div>
              {histLoading && <p className="text-sm text-muted py-4">Loading…</p>}
              {histError && <p className="text-sm text-error py-4">Could not load history.</p>}
              {!histLoading && !histError && !appt.customer_id && (
                <p className="text-sm text-muted py-4">No customer linked.</p>
              )}
              {!histLoading && !histError && appt.customer_id && historyOthers.length === 0 && (
                <p className="text-sm text-muted py-4">No other appointments on record.</p>
              )}
              {historyOthers.map(a => {
                const local2 = a.start_time_local ?? a.start_time;
                const st = a.status ?? "pending";
                return (
                  <div key={a.id} className="flex items-start justify-between gap-3 py-3 border-b border-hairline last:border-0">
                    <div className="min-w-0">
                      <div className="text-xs text-muted mb-0.5">{fmtDate(local2, tz)}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="font-medium text-ink">{a.service_name ?? "—"}</span>
                        <span className="text-muted">·</span>
                        <span className="text-muted">{a.employee_name ?? "—"}</span>
                        <span className="text-xs text-muted">{fmtTime(local2, tz)}</span>
                      </div>
                    </div>
                    <Badge className={cn("rounded-full text-[10px] font-medium flex-shrink-0", STATUS_BADGE[st] ?? "bg-gray-100 text-gray-600 border-transparent")}>
                      {STATUS_LABELS[st]}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="text-[12.5px] font-medium text-muted flex-shrink-0">{label}</span>
      <span className="text-[13px] font-medium text-ink text-right">{value}</span>
    </div>
  );
}
