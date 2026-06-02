/**
 * Appointments list page — port of _initAppointmentsView.
 *
 * Server-side filters: date_from, date_to, status, employee_id (each change refetches).
 * Client-side: search (name/phone/employee/service/note) + sort.
 * Note: NO ±1-day widening here — that's calendar-only. The list passes dates straight to the backend.
 */

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi } from "./api";
import { AppointmentDrawer } from "./AppointmentDrawer";
import { NewAppointmentModal } from "./NewAppointmentModal";
import { fmtDate, fmtTime } from "./utils";
import { STATUS_LABELS, STATUS_COLORS, SOURCE_LABELS } from "./types";
import type { AppointmentDetailResponse, ApptEmployee } from "./types";
import { useAuth } from "../../contexts/AuthContext";
import { useAgent } from "../../contexts/AgentContext";
import { employeesApi } from "../Employees/api";
import { services as servicesApi } from "../../api";

type SortKey = "newest" | "oldest" | "name-asc" | "name-desc";

export default function Appointments() {
  const { me } = useAuth();
  const { activeAgentId, activeAgent } = useAgent();
  const qc = useQueryClient();

  const tz = activeAgent?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isStaff = me ? (!me.is_owner && me.employee_id != null && !me.permissions.includes("view_branch_calendar")) : false;
  const canCreate = me?.is_owner || (me?.permissions ?? []).includes("manage_appointments");
  const canUpdateStatus = me?.is_owner || (me?.permissions ?? []).includes("update_appointment_status") || isStaff;

  // Filters (server-side)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [empFilter, setEmpFilter] = useState("");

  // UI state
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<AppointmentDetailResponse | null>(null);
  const [showNew, setShowNew] = useState(false);

  const params = {
    agent_id: activeAgentId!,
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo   ? { date_to: dateTo }     : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(empFilter    ? { employee_id: empFilter } : {}),
  };

  const { data: appointments = [], isLoading, isError } = useQuery({
    queryKey: ["appointments", params],
    queryFn: () => appointmentsApi.list(params),
    enabled: activeAgentId != null,
    staleTime: 60 * 1000,
  });

  // Employees + catalogue for the new appointment modal
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-bookable", activeAgentId],
    queryFn: async () => {
      const list = await employeesApi.list(activeAgentId!);
      return list
        .filter(e => e.branches.find(b => b.agent_id === activeAgentId)?.can_receive_bookings)
        .map(e => ({ id: e.id, name: e.name })) as ApptEmployee[];
    },
    enabled: activeAgentId != null,
    staleTime: 5 * 60 * 1000,
  });

  const { data: catalogue } = useQuery({
    queryKey: ["services-catalogue", activeAgentId],
    queryFn: () => servicesApi.catalogue(activeAgentId!),
    enabled: activeAgentId != null,
    staleTime: 5 * 60 * 1000,
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? appointments.filter(a =>
          (a.customer_name  ?? "").toLowerCase().includes(q) ||
          (a.customer_phone ?? "").toLowerCase().includes(q) ||
          (a.employee_name  ?? "").toLowerCase().includes(q) ||
          (a.service_name   ?? "").toLowerCase().includes(q) ||
          (a.note           ?? "").toLowerCase().includes(q))
      : [...appointments];

    list.sort((a, b) => {
      const ta = new Date(a.start_time ?? 0).getTime();
      const tb = new Date(b.start_time ?? 0).getTime();
      if (sort === "oldest")    return ta - tb;
      if (sort === "name-asc")  return (a.customer_name ?? "").localeCompare(b.customer_name ?? "");
      if (sort === "name-desc") return (b.customer_name ?? "").localeCompare(a.customer_name ?? "");
      return tb - ta;
    });
    return list;
  }, [appointments, search, sort]);

  if (!activeAgentId) return <p className="text-sm text-muted">No branch selected.</p>;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            <SearchIcon />
          </span>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search appointments…"
            className="w-full h-9 pl-9 pr-3 border border-hairline rounded-md text-sm bg-canvas focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
        </div>

        {/* Date filters */}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          title="From date" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          title="To date" />

        {/* Status filter */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        {/* Employee filter */}
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}
          className="h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
          <option value="">All employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>

        {/* Sort */}
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
          className="h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name-asc">Customer A–Z</option>
          <option value="name-desc">Customer Z–A</option>
        </select>

        {/* Add button */}
        {canCreate && (
          <button onClick={() => setShowNew(true)}
            className="h-9 px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ml-auto">
            <PlusIcon /> New appointment
          </button>
        )}
      </div>

      {/* States */}
      {isLoading && <p className="text-sm text-muted py-8 text-center">Loading appointments…</p>}
      {isError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">Could not load appointments.</div>}

      {!isLoading && !isError && visible.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center max-w-2xl">
          <p className="font-semibold text-ink mb-1">{search ? "No results" : "No appointments found"}</p>
          <p className="text-sm text-muted">
            {search ? `Nothing matches "${search}" — try adjusting your search.` : "Try adjusting your date range or filters."}
          </p>
        </div>
      )}

      {/* Table */}
      {visible.length > 0 && (
        <div className="bg-canvas rounded-xl border border-hairline overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline">
                {["Date & Time", "Customer", "Employee", "Service", "Status", "Source"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3 first:pl-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(appt => {
                const local = appt.start_time_local ?? appt.start_time;
                const src = SOURCE_LABELS[appt.source ?? ""] ?? appt.source ?? "";
                return (
                  <tr key={appt.id} onClick={() => setSelected(appt)}
                    className="border-b border-hairline last:border-0 hover:bg-surface-soft cursor-pointer transition-colors">
                    <td className="px-4 py-3 pl-5">
                      <div className="font-medium text-ink">{fmtDate(local, tz)}</div>
                      <div className="text-xs text-muted">{fmtTime(local, tz)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{appt.customer_name ?? "—"}</div>
                      {appt.customer_phone && <div className="text-xs text-muted">{appt.customer_phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted">{appt.employee_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{appt.service_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-pill ${STATUS_COLORS[appt.status ?? "pending"] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[appt.status ?? "pending"] ?? appt.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {src && <span className="text-xs bg-surface-soft text-muted px-2 py-0.5 rounded">{src}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer */}
      {selected && (
        <AppointmentDrawer appt={selected} tz={tz} isStaff={isStaff}
          canUpdateStatus={canUpdateStatus}
          onClose={() => setSelected(null)}
          onUpdated={updated => {
            qc.setQueryData<AppointmentDetailResponse[]>(["appointments", params], prev =>
              prev?.map(a => a.id === updated.id ? updated : a) ?? prev
            );
            setSelected(updated);
          }}
        />
      )}

      {/* New appointment modal */}
      {showNew && (
        <NewAppointmentModal agentId={activeAgentId} tz={tz} employees={employees}
          catalogue={catalogue}
          onClose={() => setShowNew(false)}
          onCreated={_created => {
            qc.invalidateQueries({ queryKey: ["appointments"] });
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}

function SearchIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function PlusIcon()   { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
