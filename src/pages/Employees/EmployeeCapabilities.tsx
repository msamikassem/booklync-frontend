/**
 * Capabilities panel — shows what services/titles/variations the employee
 * can perform. Assign via a searchable catalogue picker.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { employeesApi } from "./api";
import { services as servicesApi } from "../../api";
import type { CapabilityResponse } from "./types";

export function EmployeeCapabilities({ empId, agentId, canEdit }: { empId: number; agentId: number; canEdit: boolean }) {
  const qc = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const { data: caps = [], isLoading: capsLoading } = useQuery({
    queryKey: ["emp-caps", empId, agentId],
    queryFn: () => employeesApi.getCapabilities(empId, agentId),
    staleTime: 5 * 60 * 1000,
  });

  const { data: catalogue } = useQuery({
    queryKey: ["services-catalogue", agentId],
    queryFn: () => servicesApi.catalogue(agentId),
    staleTime: 5 * 60 * 1000,
    enabled: showPicker,
  });

  function invalidate() { qc.invalidateQueries({ queryKey: ["emp-caps", empId, agentId] }); }
  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3000); }

  async function assignService(serviceId: number) {
    try {
      await employeesApi.addCapability(empId, agentId, { service_id: serviceId });
      invalidate(); showToast("Service assigned.");
    } catch { showToast("Could not assign service."); }
  }

  async function removeCapability(cap: CapabilityResponse) {
    try {
      await employeesApi.removeCapability(empId, agentId, cap.id);
      invalidate(); showToast("Removed.");
    } catch { showToast("Could not remove capability."); }
  }

  // Flat list of all services across all titles + uncategorised
  const allServices = [
    ...(catalogue?.titles?.flatMap(t => t.services ?? []) ?? []),
    ...(catalogue?.uncategorised ?? []),
  ];

  const assignedServiceIds = new Set(caps.filter(c => c.service_id != null).map(c => c.service_id!));

  const filtered = search
    ? allServices.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : allServices;

  function capLabel(cap: CapabilityResponse): string {
    if (cap.service_id) {
      const svc = allServices.find(s => s.id === cap.service_id);
      return svc?.name ?? `Service #${cap.service_id}`;
    }
    if (cap.title_id) return `Category #${cap.title_id} (all services)`;
    if (cap.variation_id) return `Variation #${cap.variation_id}`;
    return "Unknown capability";
  }

  if (capsLoading) return <p className="text-sm text-muted py-2">Loading…</p>;

  return (
    <div>
      {toast && <p className="text-xs text-success mb-2">{toast}</p>}

      {caps.length === 0 && !showPicker && (
        <p className="text-xs text-muted mb-3">No services assigned.</p>
      )}

      <div className="flex flex-col gap-1.5 mb-3">
        {caps.map(cap => (
          <div key={cap.id} className="flex items-center justify-between py-1.5 px-2 bg-surface-soft rounded text-sm">
            <span className="text-ink">{capLabel(cap)}</span>
            {canEdit && (
              <button onClick={() => removeCapability(cap)} className="text-xs text-muted hover:text-error transition-colors">Remove</button>
            )}
          </div>
        ))}
      </div>

      {canEdit && !showPicker && (
        <button onClick={() => setShowPicker(true)} className="text-xs text-primary hover:underline">+ Add service</button>
      )}

      {canEdit && showPicker && (
        <div className="border border-hairline rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-surface-soft border-b border-hairline">
            <span className="text-xs font-semibold text-ink">Select services</span>
            <button onClick={() => { setShowPicker(false); setSearch(""); }} className="text-muted hover:text-ink text-sm leading-none">×</button>
          </div>
          <div className="p-2 border-b border-hairline">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search services…"
              className="w-full h-7 px-2 text-xs border border-hairline rounded bg-canvas focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-hairline">
            {filtered.length === 0 && <p className="text-xs text-muted px-3 py-2">No results.</p>}
            {filtered.map(svc => {
              const assigned = assignedServiceIds.has(svc.id);
              return (
                <button key={svc.id} type="button" disabled={assigned}
                  onClick={() => assignService(svc.id)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${assigned ? "text-muted bg-surface-soft/50 cursor-default" : "text-ink hover:bg-primary/5 hover:text-primary"}`}>
                  {svc.name}
                  {assigned && <span className="ml-2 text-success">✓ Assigned</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
