/**
 * Appointment drawer — Details + History tabs.
 *
 * Details tab: read-only fields + editable status dropdown.
 *   - Status change shows Save/Reset row (dirty-only, same pattern as Customers drawer).
 *   - Staff can only change to completed/no_show/cancelled; pending/confirmed are disabled.
 * History tab: lazy-loads the customer's full appointment history, newest first,
 *   excluding the current appointment.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi } from "./api";
import { customers as customersApi } from "../../api";
import { formatApiError } from "../../lib/errors";
import { fmtDate, fmtTime, apptDuration, fmtPhone } from "./utils";
import { STATUS_LABELS, STATUS_COLORS, SOURCE_LABELS } from "./types";
import type { AppointmentDetailResponse, ApiError } from "./types";
import { getInitials, avatarColor } from "../../lib/utils";

const STATUS_OPTIONS = ["pending", "confirmed", "cancelled", "completed", "no_show"];
const STAFF_ALLOWED = new Set(["completed", "no_show", "cancelled"]);

interface Props {
  appt: AppointmentDetailResponse;
  tz: string;
  isStaff: boolean;
  canUpdateStatus: boolean;
  onClose: () => void;
  onUpdated: (updated: AppointmentDetailResponse) => void;
}

export function AppointmentDrawer({ appt, tz, isStaff, canUpdateStatus, onClose, onUpdated }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"details" | "history">("details");
  const [status, setStatus] = useState(appt.status ?? "pending");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = status !== appt.status;

  // Lazy-load customer history when History tab opens
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
      const updated = await appointmentsApi.updateStatus(appt.id, status);
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
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-96 max-w-full bg-canvas shadow-lg z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-hairline">
          <div className="w-10 h-10 rounded-full grid place-items-center text-sm font-semibold text-white flex-shrink-0"
            style={{ background: color }}>{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-ink truncate">{custName}</div>
            <div className="text-xs text-muted">{fmtDate(local, tz)} · {fmtTime(local, tz)}</div>
            <div className="mt-0.5">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-pill ${STATUS_COLORS[appt.status ?? "pending"] ?? "bg-gray-100 text-gray-600"}`}>
                {STATUS_LABELS[appt.status ?? "pending"] ?? appt.status}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink p-1 rounded hover:bg-surface-soft">
            <XIcon />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-hairline px-5">
          {(["details", "history"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`pb-3 pt-3 mr-5 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"}`}>
              {t === "history" ? (isStaff ? undefined : "History") : "Details"}
              {t === "history" && isStaff ? null : null}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Details tab */}
          {tab === "details" && (
            <div className="flex flex-col gap-4">
              {/* Read-only info rows */}
              <div className="flex flex-col gap-2 text-sm">
                <Row label="Customer" value={custName} />
                {phone && <Row label="Phone" value={fmtPhone(phone)} />}
                {svcLabel && <Row label="Service" value={svcLabel + (durMins ? ` · ${durMins} min` : "")} />}
                <Row label="Employee" value={appt.employee_name ?? "—"} />
                <Row label="Date & time" value={`${fmtDate(local, tz)} · ${fmtTime(local, tz)}`} />
                {appt.source && <Row label="Source" value={SOURCE_LABELS[appt.source] ?? appt.source} />}
                {appt.note && (
                  <div>
                    <div className="text-xs font-medium text-muted uppercase tracking-wide mb-1">Note</div>
                    <div className="text-ink bg-surface-soft rounded px-3 py-2 text-sm">{appt.note}</div>
                  </div>
                )}
              </div>

              {/* Status change */}
              {canUpdateStatus && (
                <div>
                  <div className="text-xs font-medium text-muted uppercase tracking-wide mb-1.5">Status</div>
                  <select value={status} onChange={e => setStatus(e.target.value)}
                    className="w-full h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s} disabled={isStaff && !STAFF_ALLOWED.has(s)}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

              {dirty && canUpdateStatus && (
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving}
                    className="flex-1 h-9 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button onClick={() => { setStatus(appt.status ?? "pending"); setErr(null); }}
                    className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft">
                    Reset
                  </button>
                </div>
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
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-pill flex-shrink-0 ${STATUS_COLORS[a.status ?? "pending"] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[a.status ?? "pending"]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-ink">{value}</div>
    </div>
  );
}

function XIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
