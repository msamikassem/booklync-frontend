import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customers as customersApi } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../lib/errors";
import { cn, getInitials, avatarColor, stripE164, buildPhone, validatePhone, fmtDate } from "../lib/utils";
import type { CustomerResponse, AppointmentDetailResponse, ApiError } from "../api/types";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus, Search } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", cancelled: "Cancelled",
  completed: "Completed", no_show: "No-show",
};
const SOURCE_LABEL: Record<string, string> = {
  ai: "AI", sms: "SMS", dashboard: "Dashboard",
  booking_page: "Booking page", manual: "Manual",
};
const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-transparent hover:bg-yellow-100",
  confirmed: "bg-blue-100 text-blue-800 border-transparent hover:bg-blue-100",
  cancelled: "bg-gray-100 text-gray-500 border-transparent hover:bg-gray-100",
  completed: "bg-green-100 text-green-800 border-transparent hover:bg-green-100",
  no_show: "bg-red-100 text-red-700 border-transparent hover:bg-red-100",
};

// ── Appointment row (drawer history tab) ──────────────────────────────────────

function ApptRow({ appt }: { appt: AppointmentDetailResponse }) {
  const local = appt.start_time_local || appt.start_time;
  const localEnd = appt.end_time_local || appt.end_time;
  const date = new Date(local).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const startT = new Date(local).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const endT = new Date(localEnd).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const status = appt.status || "pending";
  const source = SOURCE_LABEL[appt.source ?? ""] || appt.source || "";

  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-hairline last:border-0">
      <div className="min-w-0">
        <div className="text-xs text-muted mb-0.5">{date}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="font-medium text-ink">{appt.service_name || "—"}</span>
          <span className="text-muted">·</span>
          <span className="text-muted">{appt.employee_name || "—"}</span>
          <span className="text-xs text-muted">{startT} – {endT}</span>
          {source && (
            <span className="text-xs bg-surface-soft text-muted px-1.5 py-0.5 rounded">{source}</span>
          )}
        </div>
      </div>
      <Badge className={cn("rounded-full text-[10px] font-medium", STATUS_BADGE[status] ?? "bg-gray-100 text-gray-600 border-transparent")}>
        {STATUS_LABEL[status] || status}
      </Badge>
    </div>
  );
}

// ── Customer drawer ───────────────────────────────────────────────────────────

type DrawerTab = "edit" | "history" | "danger";

function CustomerDrawerContent({
  cust,
  canManage,
  onUpdated,
  onDeleted,
}: {
  cust: CustomerResponse;
  canManage: boolean;
  onUpdated: (c: CustomerResponse) => void;
  onDeleted: (id: number) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("edit");

  const orig = {
    name: cust.name || "",
    phone: stripE164(cust.phone),
    email: cust.email || "",
    notes: cust.notes || "",
  };
  const [name, setName] = useState(orig.name);
  const [phone, setPhone] = useState(orig.phone);
  const [email, setEmail] = useState(orig.email);
  const [notes, setNotes] = useState(orig.notes);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const dirty = name !== orig.name || phone !== orig.phone || email !== orig.email || notes !== orig.notes;

  const { data: appts, isLoading: apptLoading, isError: apptError } = useQuery({
    queryKey: ["customer-appointments", cust.id],
    queryFn: () => customersApi.getAppointments(cust.id),
    enabled: tab === "history",
    staleTime: 2 * 60 * 1000,
  });

  const updateMut = useMutation({
    mutationFn: (body: { name: string; phone: string | null; email: string | null; notes: string | null }) =>
      customersApi.update(cust.id, body),
    onSuccess: (updated) => { onUpdated(updated); setEditErr(null); },
    onError: (err: unknown) => {
      const data = (err as { data?: ApiError }).data;
      setEditErr(formatApiError(data ?? {}, "Could not save changes."));
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => customersApi.delete(cust.id),
    onSuccess: () => onDeleted(cust.id),
    onError: (err: unknown) => {
      const data = (err as { data?: ApiError }).data;
      setDeleteErr(formatApiError(data ?? {}, "Could not delete customer."));
    },
  });

  function handleSave() {
    if (!name.trim()) { setEditErr("Name cannot be empty."); return; }
    const phoneErr = validatePhone(phone);
    if (phoneErr) { setEditErr(phoneErr); return; }
    setEditErr(null);
    updateMut.mutate({ name: name.trim(), phone: buildPhone(phone), email: email.trim() || null, notes: notes.trim() || null });
  }

  function handleReset() {
    setName(orig.name); setPhone(orig.phone); setEmail(orig.email); setNotes(orig.notes); setEditErr(null);
  }

  function handleDeleteClick() {
    if (!deleteConfirm) { setDeleteConfirm(true); setTimeout(() => setDeleteConfirm(false), 4000); return; }
    setDeleteErr(null);
    deleteMut.mutate();
  }

  const initials = getInitials(cust.name, cust.phone);
  const color = avatarColor(cust.name || cust.phone || String(cust.id));
  const sub = [cust.phone, cust.email].filter(Boolean).join(" · ") || "No contact info";

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-hairline flex-shrink-0">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarFallback style={{ background: color }} className="text-white text-sm font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink truncate">{cust.name || "—"}</div>
          <div className="text-xs text-muted truncate">{sub}</div>
        </div>
        <SheetClose asChild>
          <Button variant="ghost" size="icon" className="text-muted hover:text-ink h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </SheetClose>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-hairline px-5 flex-shrink-0">
        {(["edit", "history", "danger"] as DrawerTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "pb-3 pt-3 mr-5 text-sm font-medium border-b-2 transition-colors capitalize",
              tab === t
                ? t === "danger" ? "border-error text-error" : "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink",
              t === "danger" && !canManage ? "hidden" : "",
            )}
          >
            {t === "danger" ? "Delete" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Edit tab */}
        {tab === "edit" && (
          <div className="flex flex-col gap-4">
            <FormField label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} placeholder="John Smith" />
            </FormField>
            <FormField label="Phone">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canManage} placeholder="(555) 000-0000" maxLength={14} />
            </FormField>
            <FormField label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canManage} placeholder="john@example.com" />
            </FormField>
            <FormField label="Notes">
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)}
                disabled={!canManage} placeholder="Preferences, allergies…" rows={3}
                className="w-full px-3 py-2 border border-input rounded-md text-sm bg-transparent text-ink placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </FormField>

            {editErr && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{editErr}</p>}

            {dirty && canManage && (
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={updateMut.isPending} className="flex-1">
                  {updateMut.isPending ? "Saving…" : "Save changes"}
                </Button>
                <Button variant="outline" onClick={handleReset} disabled={updateMut.isPending}>Reset</Button>
              </div>
            )}
          </div>
        )}

        {/* History tab */}
        {tab === "history" && (
          <div>
            {apptLoading && <p className="text-sm text-muted py-4">Loading…</p>}
            {apptError && <p className="text-sm text-error py-4">Could not load appointments.</p>}
            {appts && appts.length === 0 && <p className="text-sm text-muted py-4">No appointments on record.</p>}
            {appts && appts.length > 0 && appts.map((a) => <ApptRow key={a.id} appt={a} />)}
          </div>
        )}

        {/* Danger tab */}
        {tab === "danger" && canManage && (
          <div className="pt-2">
            <p className="font-semibold text-ink mb-1">Delete customer</p>
            <p className="text-sm text-muted mb-4">
              This will permanently delete this customer and all associated data. This cannot be undone.
            </p>
            {deleteErr && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">{deleteErr}</p>}
            <Button
              onClick={handleDeleteClick}
              disabled={deleteMut.isPending}
              variant={deleteConfirm ? "destructive" : "outline"}
              className={cn("w-full", !deleteConfirm && "border-error text-error hover:bg-red-50 hover:text-error")}
            >
              {deleteMut.isPending ? "Deleting…" : deleteConfirm ? "Are you sure? Click again to confirm." : "Delete customer"}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Add customer modal ────────────────────────────────────────────────────────

function AddCustomerModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (c: CustomerResponse) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      customersApi.create({
        name: name.trim() || undefined,
        phone: buildPhone(phone) ?? "",
        email: email.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: (c) => { onCreated(c); onOpenChange(false); reset(); },
    onError: (e: unknown) => {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not add customer."));
    },
  });

  function reset() {
    setName(""); setPhone(""); setEmail(""); setNotes(""); setErr(null);
  }

  function handleSubmit() {
    if (!name.trim()) { setErr("Name is required."); return; }
    const phoneErr = validatePhone(phone);
    if (phoneErr) { setErr(phoneErr); return; }
    setErr(null);
    createMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="px-6 py-4 border-b border-hairline">
          <DialogTitle className="font-display text-lg font-semibold text-ink">Add customer</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 flex flex-col gap-4">
          {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}
          <FormField label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
          </FormField>
          <FormField label="Phone" required>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" maxLength={14} />
          </FormField>
          <FormField label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" />
          </FormField>
          <FormField label="Notes">
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Preferences, allergies…" rows={3}
              className="w-full px-3 py-2 border border-input rounded-md text-sm bg-transparent text-ink placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </FormField>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <Button onClick={handleSubmit} disabled={createMut.isPending} className="flex-1">
            {createMut.isPending ? "Adding…" : "Add customer"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type SortKey = "newest" | "oldest" | "name-asc" | "name-desc";

export default function Customers() {
  const { me } = useAuth();
  const qc = useQueryClient();

  const canManage = me?.is_owner || (me?.permissions ?? []).includes("manage_customers");

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selectedCust, setSelectedCust] = useState<CustomerResponse | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list(),
    staleTime: 5 * 60 * 1000,
  });

  const customers = data?.customers ?? [];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? customers.filter(
          (c) =>
            (c.name || "").toLowerCase().includes(q) ||
            (c.phone || "").toLowerCase().includes(q) ||
            (c.email || "").toLowerCase().includes(q)
        )
      : [...customers];

    list.sort((a, b) => {
      if (sort === "name-asc") return (a.name || "").localeCompare(b.name || "");
      if (sort === "name-desc") return (b.name || "").localeCompare(a.name || "");
      if (sort === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return list;
  }, [customers, search, sort]);

  function handleUpdated(updated: CustomerResponse) {
    qc.setQueryData<{ customers: CustomerResponse[]; total: number }>(["customers"], (old) => {
      if (!old) return old;
      return { ...old, customers: old.customers.map((c) => (c.id === updated.id ? updated : c)) };
    });
    setSelectedCust(updated);
  }

  function handleDeleted(id: number) {
    qc.setQueryData<{ customers: CustomerResponse[]; total: number }>(["customers"], (old) => {
      if (!old) return old;
      return { ...old, customers: old.customers.filter((c) => c.id !== id), total: old.total - 1 };
    });
    setSelectedCust(null);
  }

  function handleCreated(c: CustomerResponse) {
    qc.setQueryData<{ customers: CustomerResponse[]; total: number }>(["customers"], (old) => {
      if (!old) return { customers: [c], total: 1 };
      return { customers: [c, ...old.customers], total: old.total + 1 };
    });
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none h-3.5 w-3.5" />
          <Input
            type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone or email…"
            className="pl-9"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="name-asc">Name A–Z</SelectItem>
            <SelectItem value="name-desc">Name Z–A</SelectItem>
          </SelectContent>
        </Select>
        {canManage && (
          <Button onClick={() => setShowAdd(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add customer
          </Button>
        )}
      </div>

      {/* States */}
      {isLoading && <p className="text-sm text-muted py-8 text-center">Loading customers…</p>}
      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          Could not load customers.
        </div>
      )}

      {!isLoading && !isError && customers.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center max-w-lg">
          <p className="font-semibold text-ink mb-1">No customers yet</p>
          <p className="text-sm text-muted">Add your first customer to get started.</p>
        </div>
      )}

      {!isLoading && !isError && customers.length > 0 && visible.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center max-w-lg">
          <p className="font-semibold text-ink mb-1">No results</p>
          <p className="text-sm text-muted">No customers match &ldquo;<strong>{search}</strong>&rdquo;.</p>
        </div>
      )}

      {/* Table */}
      {visible.length > 0 && (
        <div className="bg-canvas rounded-xl border border-hairline overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-hairline hover:bg-transparent">
                {["Customer", "Phone", "Email", "Notes", "Since"].map((h) => (
                  <TableHead key={h} className="text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3 first:pl-5 h-auto">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((cust) => {
                const initials = getInitials(cust.name, cust.phone);
                const color = avatarColor(cust.name || cust.phone || String(cust.id));
                const notesTrunc = (cust.notes || "").length > 50
                  ? (cust.notes || "").slice(0, 50) + "…"
                  : cust.notes || "";
                return (
                  <TableRow
                    key={cust.id}
                    onClick={() => setSelectedCust(cust)}
                    className="border-b border-hairline last:border-0 hover:bg-surface-soft cursor-pointer transition-colors"
                  >
                    <TableCell className="px-4 py-3 pl-5">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7 flex-shrink-0">
                          <AvatarFallback style={{ background: color }} className="text-white text-xs font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-ink">{cust.name || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-muted">{cust.phone || <span className="text-hairline">—</span>}</TableCell>
                    <TableCell className="px-4 py-3 text-muted">{cust.email || <span className="text-hairline">—</span>}</TableCell>
                    <TableCell className="px-4 py-3 text-muted max-w-xs truncate">{notesTrunc || <span className="text-hairline">—</span>}</TableCell>
                    <TableCell className="px-4 py-3 text-muted">{fmtDate(cust.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Drawer */}
      <Sheet open={selectedCust !== null} onOpenChange={(open) => !open && setSelectedCust(null)}>
        <SheetContent side="right" hideClose className="w-96 p-0 flex flex-col">
          {selectedCust && (
            <CustomerDrawerContent
              key={selectedCust.id}
              cust={selectedCust}
              canManage={!!canManage}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Add modal */}
      <AddCustomerModal open={showAdd} onOpenChange={setShowAdd} onCreated={handleCreated} />
    </div>
  );
}

// ── Shared form helpers ───────────────────────────────────────────────────────

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium text-ink">
        {label}{required && <span className="text-error ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
