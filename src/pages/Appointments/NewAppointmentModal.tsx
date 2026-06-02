/**
 * New appointment modal — port of _populateApptModal + _ensureApptModalWired.
 *
 * Key behaviours:
 * - Customer typeahead (search existing, "＋ Add new customer…" opens the add-customer flow)
 * - Service dropdown grouped by title; variation cascade when service has variations
 * - Employee capabilities lookup for extra-price display
 * - Price preview strip: base + employee extra = total, duration chip
 * - Timezone-aware date/time inputs (shows agent tz label)
 * - PREP_TIME_CONFLICT: amber card with one-click "Book at X:XX PM" rebook
 */

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { appointmentsApi } from "./api";
import { customers as customersApi, services as servicesApi } from "../../api";
import { formatApiError } from "../../lib/errors";
import { localInputToUtc, utcToLocalInput, extractPrepSuggestedTime } from "./utils";
import type { AppointmentDetailResponse, ApptEmployee, ApiError } from "./types";
import type { ServiceCatalogueResponse, CustomerResponse } from "../../api/types";

interface Props {
  agentId: number;
  tz: string;
  employees: ApptEmployee[];
  catalogue: ServiceCatalogueResponse | undefined;
  onClose: () => void;
  onCreated: (appt: AppointmentDetailResponse) => void;
}

export function NewAppointmentModal({ agentId, tz, employees, catalogue, onClose, onCreated }: Props) {
  // Default to next hour in agent tz
  const defaultLocal = utcToLocalInput(
    (() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d.toISOString(); })(),
    tz
  );
  const [datePart, timePart] = defaultLocal.split("T");

  const [customerId, setCustomerId] = useState("");
  const [customerDisplay, setCustomerDisplay] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [variationId, setVariationId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
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

  // Customer search
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list().then(d => d.customers),
    staleTime: 5 * 60 * 1000,
  });

  const filteredCusts = custSearch
    ? customers.filter(c =>
        (c.name ?? "").toLowerCase().includes(custSearch.toLowerCase()) ||
        (c.phone ?? "").toLowerCase().includes(custSearch.toLowerCase()))
    : customers;

  // Employees who can perform the selected service (filters employee dropdown)
  const { data: svcEmployees } = useQuery({
    queryKey: ["service-employees", Number(serviceId), agentId],
    queryFn: () => servicesApi.getEmployees(Number(serviceId), agentId),
    enabled: !!serviceId,
    staleTime: 5 * 60 * 1000,
  });

  // When service changes, if the selected employee can't do it, clear them
  useEffect(() => {
    if (!svcEmployees || !employeeId) return;
    const capable = svcEmployees.some(e => String(e.id) === employeeId);
    if (!capable) setEmployeeId("");
  }, [svcEmployees, employeeId]);

  // Filtered employee list — only those capable of the selected service
  const filteredEmployees = serviceId && svcEmployees
    ? employees.filter(e => svcEmployees.some(se => se.id === e.id))
    : employees;

  // Extra price for selected employee from service employee data
  const empExtraFromSvc = svcEmployees?.find(se => String(se.id) === employeeId);
  const extraPrice = empExtraFromSvc ? parseFloat(empExtraFromSvc.extra_price as string ?? "0") : 0;

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!custPickerRef.current?.contains(e.target as Node)) setCustDropOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // All services flat list
  const allSvcs = [
    ...(catalogue?.uncategorised ?? []),
    ...(catalogue?.titles ?? []).flatMap(t => t.services ?? []),
  ];

  const selectedSvc = allSvcs.find(s => s.id === Number(serviceId));
  const hasVariations = (selectedSvc?.variations?.length ?? 0) > 0;
  const selectedVar = hasVariations
    ? selectedSvc?.variations?.find(v => v.id === Number(variationId))
    : undefined;

  // Price preview
  const basePrice = selectedVar
    ? parseFloat(selectedVar.price as string)
    : selectedSvc && !hasVariations
      ? parseFloat((selectedSvc.price ?? "0") as string)
      : null;
  const durMins = selectedVar?.duration_minutes ?? (selectedSvc && !hasVariations ? selectedSvc.duration_minutes : null);

  const totalPrice = basePrice !== null ? basePrice + extraPrice : null;
  const showPriceStrip = totalPrice !== null && !!serviceId && !!employeeId && (!hasVariations || !!variationId);

  function selectCustomer(c: CustomerResponse) {
    setCustomerId(String(c.id));
    setCustomerDisplay(c.name ?? c.phone ?? `Customer #${c.id}`);
    setCustSearch(c.name ?? "");
    setCustDropOpen(false);
  }

  async function handleSave() {
    setErr(null); setErrType("error"); setPrepSuggested(null);
    if (!customerId)                         { setErr("Please select a customer.");   return; }
    if (!serviceId)                          { setErr("Please select a service.");    return; }
    if (hasVariations && !variationId)       { setErr("Please select a variation.");  return; }
    if (!employeeId)                         { setErr("Please select an employee.");  return; }
    if (!date)                               { setErr("Please set a date.");          return; }
    if (!time)                               { setErr("Please set a time.");          return; }

    const startUtc = localInputToUtc(`${date}T${time}`, tz);
    if (!startUtc)                           { setErr("Invalid date/time.");          return; }

    setSaving(true);
    try {
      const created = await appointmentsApi.create({
        agent_id:    agentId,
        customer_id: Number(customerId),
        service_id:  Number(serviceId),
        employee_id: Number(employeeId),
        start_time:  startUtc,
        source:      "manual",
        ...(variationId ? { variation_id: Number(variationId) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onCreated(created);
      onClose();
    } catch (e: unknown) {
      const data = (e as { data?: ApiError }).data;
      if ((data as { code?: string })?.code === "PREP_TIME_CONFLICT") {
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
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-canvas rounded-xl shadow-lg w-full max-w-md pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-hairline flex-shrink-0">
            <h2 className="font-display text-lg font-semibold text-ink">New appointment</h2>
            <button onClick={onClose} className="text-muted hover:text-ink p-1 rounded hover:bg-surface-soft"><XIcon /></button>
          </div>

          <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4 flex-1">
            {/* Error / prep conflict */}
            {err && (
              <div className={`text-sm rounded-md px-4 py-3 ${errType === "prep_conflict" ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
                <p>{err}</p>
                {prepSuggested && (
                  <button onClick={() => { setTime(prepSuggested.value); setErr(null); setPrepSuggested(null); }}
                    className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Book at {prepSuggested.display}
                  </button>
                )}
              </div>
            )}

            {/* Customer typeahead */}
            <div ref={custPickerRef}>
              <label className="block text-sm font-medium text-ink mb-1.5">Customer <span className="text-error">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
                  <SearchIcon />
                </span>
                <input type="text" value={custSearch}
                  onChange={e => { setCustSearch(e.target.value); setCustomerId(""); setCustomerDisplay(""); setCustDropOpen(true); }}
                  onFocus={() => setCustDropOpen(true)}
                  placeholder="Search customer…"
                  className="w-full h-9 pl-9 pr-8 border border-hairline rounded-md text-sm bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                {customerId && (
                  <button onClick={() => { setCustomerId(""); setCustomerDisplay(""); setCustSearch(""); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink">×</button>
                )}
              </div>
              {custDropOpen && (
                <div className="relative z-10">
                  <div className="absolute top-1 left-0 right-0 bg-canvas border border-hairline rounded-lg shadow-md max-h-48 overflow-y-auto">
                    <button type="button" onMouseDown={() => { /* TODO: open add customer modal */ setCustDropOpen(false); }}
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

            {/* Service */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Service <span className="text-error">*</span></label>
              <select value={serviceId}
                onChange={e => { setServiceId(e.target.value); setVariationId(""); }}
                className={iCls}>
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
            </div>

            {/* Variation */}
            {hasVariations && (
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Variation <span className="text-error">*</span></label>
                <select value={variationId} onChange={e => setVariationId(e.target.value)} className={iCls}>
                  <option value="">Select variation…</option>
                  {selectedSvc?.variations?.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Employee */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Employee <span className="text-error">*</span></label>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className={iCls}
                disabled={!!serviceId && filteredEmployees.length === 0}>
                <option value="">
                  {serviceId && filteredEmployees.length === 0
                    ? "No employees assigned to this service"
                    : "Select employee…"}
                </option>
                {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {serviceId && svcEmployees && filteredEmployees.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  No employees are assigned to this service. Go to the Services tab to assign employees.
                </p>
              )}
            </div>

            {/* Date + time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Date <span className="text-error">*</span></label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className={iCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">
                  Time <span className="text-error">*</span>
                  <span className="text-muted font-normal text-xs ml-1">({tz.split("/").pop()?.replace("_", " ") ?? tz})</span>
                </label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} className={iCls} />
              </div>
            </div>

            {/* Price strip */}
            {showPriceStrip && (
              <div className="bg-surface-soft rounded-md px-4 py-3 flex flex-col gap-1 text-sm">
                {durMins && (
                  <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {durMins} min
                  </div>
                )}
                {extraPrice > 0 && (
                  <>
                    <div className="flex justify-between text-muted text-xs"><span>Base price</span><span>${basePrice!.toFixed(2)}</span></div>
                    <div className="flex justify-between text-muted text-xs"><span>Employee extra</span><span>+${extraPrice.toFixed(2)}</span></div>
                    <div className="border-t border-hairline my-1" />
                  </>
                )}
                <div className="flex justify-between font-semibold text-ink">
                  <span>Total</span>
                  <span>${totalPrice!.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Note */}
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Note (optional)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Any notes for this appointment…"
                className={`${iCls} resize-none`} />
            </div>
          </div>

          <div className="flex gap-3 px-6 pb-5 flex-shrink-0">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 h-9 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
              {saving ? "Creating…" : "Create appointment"}
            </button>
            <button onClick={onClose} className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft">Cancel</button>
          </div>
        </div>
      </div>
    </>
  );
}

const iCls = "w-full h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

function XIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function SearchIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
