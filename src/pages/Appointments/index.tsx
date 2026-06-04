import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi } from "./api";
import { AppointmentDrawer } from "./AppointmentDrawer";
import { NewAppointmentModal } from "./NewAppointmentModal";
import { fmtDate, fmtTime } from "./utils";
import { STATUS_LABELS, SOURCE_LABELS } from "./types";
import type { AppointmentDetailResponse, ApptEmployee } from "./types";
import { useAuth } from "../../contexts/AuthContext";
import { useAgent } from "../../contexts/AgentContext";
import { employeesApi } from "../Employees/api";
import { services as servicesApi } from "../../api";
import { cn } from "../../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus } from "lucide-react";

type SortKey = "newest" | "oldest" | "name-asc" | "name-desc";

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800 border-transparent hover:bg-yellow-100",
  confirmed: "bg-blue-100 text-blue-800 border-transparent hover:bg-blue-100",
  cancelled: "bg-gray-100 text-gray-500 border-transparent hover:bg-gray-100",
  completed: "bg-green-100 text-green-800 border-transparent hover:bg-green-100",
  no_show:   "bg-red-100 text-red-700 border-transparent hover:bg-red-100",
};

export default function Appointments() {
  const { me } = useAuth();
  const { activeAgentId, activeAgent } = useAgent();
  const qc = useQueryClient();

  const tz = activeAgent?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isStaff = me ? (!me.is_owner && me.employee_id != null && !me.permissions.includes("view_branch_calendar")) : false;
  const canCreate = me?.is_owner || (me?.permissions ?? []).includes("manage_appointments");
  const canUpdateStatus = me?.is_owner || (me?.permissions ?? []).includes("update_appointment_status") || isStaff;

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [empFilter, setEmpFilter] = useState("all");

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<AppointmentDetailResponse | null>(null);
  const [showNew, setShowNew] = useState(false);

  const params = {
    agent_id: activeAgentId!,
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo   ? { date_to: dateTo }     : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(empFilter !== "all"    ? { employee_id: empFilter } : {}),
  };

  const { data: appointments = [], isLoading, isError } = useQuery({
    queryKey: ["appointments", params],
    queryFn: () => appointmentsApi.list(params),
    enabled: activeAgentId != null,
    staleTime: 60 * 1000,
  });

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
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none h-3.5 w-3.5" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search appointments…" className="pl-9" />
        </div>

        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="h-9 w-auto" title="From date" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="h-9 w-auto" title="To date" />

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All employees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={v => setSort(v as SortKey)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name-asc">Customer A–Z</SelectItem>
            <SelectItem value="name-desc">Customer Z–A</SelectItem>
          </SelectContent>
        </Select>

        {canCreate && (
          <Button onClick={() => setShowNew(true)} className="gap-1.5 ml-auto">
            <Plus className="h-3.5 w-3.5" /> New appointment
          </Button>
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
          <Table>
            <TableHeader>
              <TableRow className="border-b border-hairline hover:bg-transparent">
                {["Date & Time", "Customer", "Employee", "Service", "Status", "Source"].map(h => (
                  <TableHead key={h} className="text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3 first:pl-5 h-auto">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(appt => {
                const local = appt.start_time_local ?? appt.start_time;
                const src = SOURCE_LABELS[appt.source ?? ""] ?? appt.source ?? "";
                const st = appt.status ?? "pending";
                return (
                  <TableRow key={appt.id} onClick={() => setSelected(appt)}
                    className="border-b border-hairline last:border-0 hover:bg-surface-soft cursor-pointer transition-colors">
                    <TableCell className="px-4 py-3 pl-5">
                      <div className="font-medium text-ink">{fmtDate(local, tz)}</div>
                      <div className="text-xs text-muted">{fmtTime(local, tz)}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="font-medium text-ink">{appt.customer_name ?? "—"}</div>
                      {appt.customer_phone && <div className="text-xs text-muted">{appt.customer_phone}</div>}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted">{appt.employee_name ?? "—"}</TableCell>
                    <TableCell className="px-4 py-3 text-muted">{appt.service_name ?? "—"}</TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge className={cn("rounded-full text-[10px] font-medium", STATUS_BADGE[st] ?? "bg-gray-100 text-gray-600 border-transparent")}>
                        {STATUS_LABELS[st] ?? st}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {src && <span className="text-xs bg-surface-soft text-muted px-2 py-0.5 rounded">{src}</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
