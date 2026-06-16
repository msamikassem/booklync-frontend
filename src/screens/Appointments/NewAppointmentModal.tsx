import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { appointmentsApi } from "./api";
import { customers as customersApi, services as servicesApi } from "../../api";
import { employeesApi } from "../Employees/api";
import { formatApiError } from "../../lib/errors";
import { localInputToUtc, utcToLocalInput, extractPrepSuggestedTime } from "./utils";
import type { AppointmentDetailResponse, ApptEmployee, ApiError } from "./types";
import type { ServiceCatalogueResponse, ServiceResponse, CustomerResponse } from "../../api/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Clock, Plus, X } from "lucide-react";

interface Props {
  agentId: number;
  tz: string;
  employees: ApptEmployee[];
  catalogue: ServiceCatalogueResponse | undefined;
  prefillEmpId?: number;
  prefillDate?: string;
  prefillTime?: string;
  onClose: () => void;
  onCreated: (appt: AppointmentDetailResponse) => void;
}

/** One service line being booked in the visit. */
interface ServiceRow {
  key: string;
  serviceId: string;
  variationId: string;
  employeeId: string;
}

const newRow = (employeeId = ""): ServiceRow => ({
  key: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()),
  serviceId: "",
  variationId: "",
  employeeId,
});

/** Add `offset` minutes to a local "HH:MM" base and format as e.g. "2:05 PM". */
function fmtClock(baseTime: string, offsetMin: number): string {
  const [h, m] = baseTime.split(":").map(Number);
  let total = h * 60 + m + offsetMin;
  total = ((total % 1440) + 1440) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

export function NewAppointmentModal({ agentId, tz, employees, catalogue, prefillEmpId, prefillDate, prefillTime, onClose, onCreated }: Props) {
  const defaultLocal = (prefillDate && prefillTime)
    ? `${prefillDate}T${prefillTime}`
    : utcToLocalInput(
        (() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d.toISOString(); })(),
        tz
      );
  const [datePart, timePart] = defaultLocal.split("T");

  const [customerId, setCustomerId] = useState("");
  const [customerDisplay, setCustomerDisplay] = useState("");
  const [rows, setRows] = useState<ServiceRow[]>([newRow(prefillEmpId ? String(prefillEmpId) : "")]);
  // Employee surcharge per row (reported up by each ServiceRowFields child), keyed by row.key.
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [date, setDate] = useState(datePart);
  const [time, setTime] = useState(timePart);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errType, setErrType] = useState<"error" | "prep_conflict">("error");
  const [prepSuggested, setPrepSuggested] = useState<{ display: string; value: string } | null>(null);
  const [custSearch, setCustSearch] = useState("");
  const [custDropOpen, setCustDropOpen] = useState(false);
  const custPickerRef = useRef<HTMLDivElement>(null);

  // ['customers'] cache holds the full { customers, total } object (owned by the
  // Customers screen) — read .customers, never assume a bare array.
  const { data: custData } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list(),
    staleTime: 5 * 60 * 1000,
  });
  const customers = custData?.customers ?? [];

  const filteredCusts = custSearch
    ? customers.filter(c =>
        (c.name ?? "").toLowerCase().includes(custSearch.toLowerCase()) ||
        (c.phone ?? "").toLowerCase().includes(custSearch.toLowerCase()))
    : customers;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!custPickerRef.current?.contains(e.target as Node)) setCustDropOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allSvcs = [
    ...(catalogue?.uncategorised ?? []),
    ...(catalogue?.titles ?? []).flatMap(t => t.services ?? []),
  ];

  function svcFor(r: ServiceRow): ServiceResponse | undefined {
    return allSvcs.find(s => s.id === Number(r.serviceId));
  }
  function hasVariations(svc: ServiceResponse | undefined): boolean {
    return (svc?.variations?.length ?? 0) > 0;
  }
  function rowDuration(r: ServiceRow): number | null {
    const svc = svcFor(r);
    if (!svc) return null;
    if (hasVariations(svc)) {
      const v = svc.variations?.find(v => v.id === Number(r.variationId));
      return v?.duration_minutes ?? null;
    }
    return svc.duration_minutes ?? null;
  }
  function rowBasePrice(r: ServiceRow): number | null {
    const svc = svcFor(r);
    if (!svc) return null;
    if (hasVariations(svc)) {
      const v = svc.variations?.find(v => v.id === Number(r.variationId));
      return v ? parseFloat(v.price as string) : null;
    }
    return parseFloat((svc.price ?? "0") as string);
  }

  // Sequential schedule: each row begins where the previous ends.
  let offsetAcc = 0;
  const schedule = rows.map(r => {
    const dur = rowDuration(r);
    const start = offsetAcc;
    const end = offsetAcc + (dur ?? 0);
    if (dur != null) offsetAcc = end;
    return { startOffset: start, endOffset: end, dur };
  });
  const totalDuration = offsetAcc;
  const allRowsPriced = rows.every(r => rowBasePrice(r) != null && rowDuration(r) != null
    && (!hasVariations(svcFor(r)) || !!r.variationId) && !!r.employeeId);
  const grandTotal = rows.reduce((sum, r) => sum + (rowBasePrice(r) ?? 0) + (extras[r.key] ?? 0), 0);

  function updateRow(key: string, patch: Partial<ServiceRow>) {
    setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    // default the new row's staff to the first row's staff (common case: one stylist)
    setRows(rs => [...rs, newRow(rs[0]?.employeeId ?? "")]);
  }
  function removeRow(key: string) {
    setRows(rs => (rs.length > 1 ? rs.filter(r => r.key !== key) : rs));
    setExtras(e => { const n = { ...e }; delete n[key]; return n; });
  }

  function selectCustomer(c: CustomerResponse) {
    setCustomerId(String(c.id));
    setCustomerDisplay(c.name ?? c.phone ?? `Customer #${c.id}`);
    setCustSearch(c.name ?? "");
    setCustDropOpen(false);
  }

  async function handleSave() {
    setErr(null); setErrType("error"); setPrepSuggested(null);
    if (!customerId) { setErr("Please select a customer."); return; }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const label = rows.length > 1 ? `Service ${i + 1}: ` : "";
      if (!r.serviceId) { setErr(`${label}please select a service.`); return; }
      if (hasVariations(svcFor(r)) && !r.variationId) { setErr(`${label}please select a variation.`); return; }
      if (!r.employeeId) { setErr(`${label}please select an employee.`); return; }
    }
    if (!date) { setErr("Please set a date."); return; }
    if (!time) { setErr("Please set a time."); return; }

    const startUtc = localInputToUtc(`${date}T${time}`, tz);
    if (!startUtc) { setErr("Invalid date/time."); return; }

    setSaving(true);
    try {
      if (rows.length === 1) {
        // Single service — keep the existing endpoint (and its prep-conflict
        // "Book at …" one-click suggestion) untouched.
        const r = rows[0];
        const created = await appointmentsApi.create({
          agent_id: agentId,
          customer_id: Number(customerId),
          service_id: Number(r.serviceId),
          employee_id: Number(r.employeeId),
          start_time: startUtc,
          source: "manual",
          ...(r.variationId ? { variation_id: Number(r.variationId) } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        });
        onCreated(created);
      } else {
        const created = await appointmentsApi.createBatch({
          agent_id: agentId,
          customer_id: Number(customerId),
          start_time: startUtc,
          source: "manual",
          ...(note.trim() ? { note: note.trim() } : {}),
          items: rows.map(r => ({
            service_id: Number(r.serviceId),
            employee_id: Number(r.employeeId),
            ...(r.variationId ? { variation_id: Number(r.variationId) } : {}),
          })),
        });
        if (created.length) onCreated(created[0]);
      }
      onClose();
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      if ((data as { code?: string })?.code === "PREP_TIME_CONFLICT" && rows.length === 1) {
        const suggested = extractPrepSuggestedTime(data?.detail ?? "");
        setErrType("prep_conflict");
        setErr(formatApiError(data ?? {}, "Scheduling conflict — preparation time overlap."));
        setPrepSuggested(suggested);
      } else {
        setErrType("error");
        setErr(formatApiError(data ?? {}, "Could not create appointment."));
      }
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 max-h-[90vh] flex flex-col gap-0">
        <DialogHeader className="px-6 py-4 border-b border-hairline flex-shrink-0">
          <DialogTitle className="font-display text-lg font-semibold text-ink">New appointment</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4 flex-1">
          {/* Error / prep conflict */}
          {err && (
            <div className={`text-sm rounded-md px-4 py-3 ${errType === "prep_conflict" ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
              <p>{err}</p>
              {prepSuggested && (
                <button onClick={() => { setTime(prepSuggested.value); setErr(null); setPrepSuggested(null); }}
                  className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  <Clock className="h-3.5 w-3.5" />
                  Book at {prepSuggested.display}
                </button>
              )}
            </div>
          )}

          {/* Customer typeahead */}
          <div ref={custPickerRef}>
            <FormField label="Customer" required>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none h-3.5 w-3.5" />
                <Input
                  value={custSearch}
                  onChange={e => { setCustSearch(e.target.value); setCustomerId(""); setCustomerDisplay(""); setCustDropOpen(true); }}
                  onFocus={() => setCustDropOpen(true)}
                  placeholder="Search customer…"
                  className="pl-9 pr-8"
                />
                {customerId && (
                  <button onClick={() => { setCustomerId(""); setCustomerDisplay(""); setCustSearch(""); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-lg leading-none">×</button>
                )}
              </div>
            </FormField>
            {custDropOpen && (
              <div className="relative z-10">
                <div className="absolute top-1 left-0 right-0 bg-canvas border border-hairline rounded-lg shadow-md max-h-48 overflow-y-auto">
                  <button type="button" onMouseDown={() => setCustDropOpen(false)}
                    className="w-full text-left px-3 py-2.5 text-sm text-primary hover:bg-surface-soft font-medium">
                    ＋ Add new customer…
                  </button>
                  {filteredCusts.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted">{custSearch ? `No results for "${custSearch}"` : "No customers yet"}</p>
                  )}
                  {filteredCusts.map(c => (
                    <button key={c.id} type="button" onMouseDown={() => selectCustomer(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-soft transition-colors">
                      <div className="font-medium text-ink">{c.name}</div>
                      {c.phone && <div className="text-xs text-muted">{c.phone}</div>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {customerId && <p className="text-xs text-success mt-1">Selected: {customerDisplay}</p>}
          </div>

          {/* Service rows */}
          <div className="flex flex-col gap-3">
            {rows.map((row, i) => (
              <ServiceRowFields
                key={row.key}
                index={i}
                total={rows.length}
                agentId={agentId}
                catalogue={catalogue}
                employees={employees}
                row={row}
                scheduleLabel={
                  time && schedule[i].dur != null
                    ? `${fmtClock(time, schedule[i].startOffset)} – ${fmtClock(time, schedule[i].endOffset)}`
                    : null
                }
                onChange={patch => updateRow(row.key, patch)}
                onExtraPrice={extra => setExtras(e => (e[row.key] === extra ? e : { ...e, [row.key]: extra }))}
                onRemove={() => removeRow(row.key)}
                canRemove={rows.length > 1}
              />
            ))}
            <button type="button" onClick={addRow}
              className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:bg-surface-soft border border-dashed border-hairline rounded-md py-2 transition-colors">
              <Plus className="h-3.5 w-3.5" />
              Add another service
            </button>
          </div>

          {/* Date + time */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date" required>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </FormField>
            <FormField label={<>{rows.length > 1 ? "Start time" : "Time"} <span className="text-error">*</span> <span className="text-muted font-normal text-xs">({tz.split("/").pop()?.replace("_", " ") ?? tz})</span></>}>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </FormField>
          </div>

          {/* Summary strip */}
          {allRowsPriced && (
            <div className="bg-surface-soft rounded-md px-4 py-3 flex flex-col gap-1.5 text-sm">
              <div className="flex items-center gap-1.5 text-muted text-xs">
                <Clock className="h-3 w-3" />
                {totalDuration} min total{rows.length > 1 ? ` · ${rows.length} services` : ""}
              </div>
              {rows.map((r, i) => {
                const svc = svcFor(r);
                const base = rowBasePrice(r) ?? 0;
                const extra = extras[r.key] ?? 0;
                return (
                  <div key={r.key} className="flex justify-between text-xs text-muted">
                    <span className="truncate pr-2">
                      {time && schedule[i].dur != null ? `${fmtClock(time, schedule[i].startOffset)}  ` : ""}
                      {svc?.name}{extra > 0 ? " (+extra)" : ""}
                    </span>
                    <span className="flex-shrink-0">${(base + extra).toFixed(2)}</span>
                  </div>
                );
              })}
              <div className="border-t border-hairline my-0.5" />
              <div className="flex justify-between font-semibold text-ink">
                <span>Total</span><span>${grandTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Note */}
          <FormField label="Note (optional)">
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="Any notes for this appointment…"
              className="w-full px-3 py-2 border border-input rounded-md text-sm bg-transparent text-ink placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
          </FormField>
        </div>

        <div className="flex gap-3 px-6 pb-5 flex-shrink-0 border-t border-hairline pt-4">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? "Creating…" : rows.length > 1 ? `Book ${rows.length} services` : "Create appointment"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// One service line (service + variation + employee), with capability filtering.
// ─────────────────────────────────────────────────────────────────────────────

interface RowProps {
  index: number;
  total: number;
  agentId: number;
  catalogue: ServiceCatalogueResponse | undefined;
  employees: ApptEmployee[];
  row: ServiceRow;
  scheduleLabel: string | null;
  onChange: (patch: Partial<ServiceRow>) => void;
  onExtraPrice: (extra: number) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function ServiceRowFields({ index, total, agentId, catalogue, employees, row, scheduleLabel, onChange, onExtraPrice, onRemove, canRemove }: RowProps) {
  const allSvcs = [
    ...(catalogue?.uncategorised ?? []),
    ...(catalogue?.titles ?? []).flatMap(t => t.services ?? []),
  ];
  const selectedSvc = allSvcs.find(s => s.id === Number(row.serviceId));
  const hasVariations = (selectedSvc?.variations?.length ?? 0) > 0;

  // Employees capable of this row's service (granted at variation/service/title).
  const { data: svcEmployees } = useQuery({
    queryKey: ["service-employees", Number(row.serviceId), agentId],
    queryFn: () => servicesApi.getEmployees(Number(row.serviceId), agentId),
    enabled: !!row.serviceId,
    staleTime: 5 * 60 * 1000,
  });

  // If the chosen employee can't perform the newly chosen service, clear it.
  useEffect(() => {
    if (!svcEmployees || !row.employeeId) return;
    if (!svcEmployees.some(e => String(e.id) === row.employeeId)) onChange({ employeeId: "" });
  }, [svcEmployees, row.employeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredEmployees = row.serviceId && svcEmployees
    ? employees.filter(e => svcEmployees.some(se => se.id === e.id))
    : employees;

  // Employee surcharge (extra_price) for the chosen service/variation, reported up.
  const { data: empCaps = [] } = useQuery({
    queryKey: ["emp-caps", Number(row.employeeId), agentId],
    queryFn: () => employeesApi.getCapabilities(Number(row.employeeId), agentId),
    enabled: !!row.employeeId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    let extra = 0;
    if (empCaps.length && row.serviceId) {
      let cap = row.variationId ? empCaps.find(c => c.variation_id === Number(row.variationId)) : null;
      if (!cap) cap = empCaps.find(c => c.service_id === Number(row.serviceId));
      if (!cap && selectedSvc?.title_id) cap = empCaps.find(c => c.title_id === selectedSvc.title_id);
      if (cap) extra = parseFloat((cap.extra_price as string) ?? "0");
    }
    onExtraPrice(extra);
  }, [empCaps, row.serviceId, row.variationId, selectedSvc?.title_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={total > 1 ? "rounded-lg border border-hairline p-3 flex flex-col gap-3 relative" : "flex flex-col gap-4"}>
      {total > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Service {index + 1}</span>
          <div className="flex items-center gap-2">
            {scheduleLabel && <span className="text-xs text-muted">{scheduleLabel}</span>}
            {canRemove && (
              <button type="button" onClick={onRemove} aria-label="Remove service"
                className="text-muted hover:text-error transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Service — native select kept for optgroup support */}
      <FormField label="Service" required={total === 1}>
        <select value={row.serviceId}
          onChange={e => onChange({ serviceId: e.target.value, variationId: "" })}
          className={sCls}>
          <option value="">Select service…</option>
          {catalogue?.uncategorised?.length ? (
            <optgroup label="Uncategorised">
              {catalogue.uncategorised.map(s => (
                <option key={s.id} value={s.id}>{s.name}{(s.variations?.length ?? 0) > 0 ? ` — ${s.variations!.length} variation${s.variations!.length !== 1 ? "s" : ""}` : ""}</option>
              ))}
            </optgroup>
          ) : null}
          {catalogue?.titles?.map(t => (t.services?.length ?? 0) > 0 ? (
            <optgroup key={t.id} label={t.name}>
              {t.services!.map(s => (
                <option key={s.id} value={s.id}>{s.name}{(s.variations?.length ?? 0) > 0 ? ` — ${s.variations!.length} variation${s.variations!.length !== 1 ? "s" : ""}` : ""}</option>
              ))}
            </optgroup>
          ) : null)}
        </select>
      </FormField>

      {/* Variation */}
      {hasVariations && (
        <FormField label="Variation" required={total === 1}>
          <select value={row.variationId} onChange={e => onChange({ variationId: e.target.value })} className={sCls}>
            <option value="">Select variation…</option>
            {selectedSvc?.variations?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </FormField>
      )}

      {/* Employee */}
      <FormField label="Employee" required={total === 1}>
        <select value={row.employeeId} onChange={e => onChange({ employeeId: e.target.value })} className={sCls}
          disabled={!!row.serviceId && filteredEmployees.length === 0}>
          <option value="">
            {row.serviceId && filteredEmployees.length === 0 ? "No employees assigned to this service" : "Select employee…"}
          </option>
          {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {row.serviceId && svcEmployees && filteredEmployees.length === 0 && (
          <p className="text-xs text-amber-700 mt-1">
            No employees are assigned to this service. Go to the Services tab to assign employees.
          </p>
        )}
      </FormField>
    </div>
  );
}

const sCls = "w-full h-9 px-3 border border-input rounded-md text-sm bg-transparent text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors disabled:cursor-not-allowed disabled:opacity-50";

function FormField({ label, required, children }: { label: React.ReactNode; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium text-ink">
        {typeof label === "string"
          ? <>{label}{required && <span className="text-error ml-0.5">*</span>}</>
          : label}
      </Label>
      {children}
    </div>
  );
}
