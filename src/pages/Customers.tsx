/**
 * Customers screen — port of dashboard-customers.js.
 *
 * Behaviours reproduced exactly:
 * - Load all customers, filter/sort client-side
 * - Click row → slide-in drawer with Edit / History / Delete tabs
 * - Edit: dirty-detection, save/reset row only when changed, phone E.164 build
 * - History tab: lazy-load appointment list per customer (TTL via TanStack Query)
 * - Delete: two-step inline confirmation (4 s auto-reset)
 * - Add modal: name required, 10-digit phone validated, phone built to E.164
 * - RBAC: manage_customers gates add button + disables edit/delete; view_customers needed to render
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customers as customersApi } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../lib/errors";
import { getInitials, avatarColor, stripE164, buildPhone, validatePhone, fmtDate } from "../lib/utils";
import type { CustomerResponse, AppointmentDetailResponse, ApiError } from "../api/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", cancelled: "Cancelled",
  completed: "Completed", no_show: "No-show",
};
const SOURCE_LABEL: Record<string, string> = {
  ai: "AI", sms: "SMS", dashboard: "Dashboard",
  booking_page: "Booking page", manual: "Manual",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  cancelled: "bg-gray-100 text-gray-500",
  completed: "bg-green-100 text-green-800",
  no_show: "bg-red-100 text-red-700",
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
      <span className={`text-xs font-medium px-2 py-0.5 rounded-pill flex-shrink-0 ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600"}`}>
        {STATUS_LABEL[status] || status}
      </span>
    </div>
  );
}

// ── Customer drawer ───────────────────────────────────────────────────────────

type DrawerTab = "edit" | "history" | "danger";

function CustomerDrawer({
  cust,
  canManage,
  onClose,
  onUpdated,
  onDeleted,
}: {
  cust: CustomerResponse;
  canManage: boolean;
  onClose: () => void;
  onUpdated: (c: CustomerResponse) => void;
  onDeleted: (id: number) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("edit");

  // Edit form state
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

  const dirty =
    name !== orig.name ||
    phone !== orig.phone ||
    email !== orig.email ||
    notes !== orig.notes;

  // Appointment history query — only fetches when history tab is open
  const { data: appts, isLoading: apptLoading, isError: apptError } = useQuery({
    queryKey: ["customer-appointments", cust.id],
    queryFn: () => customersApi.getAppointments(cust.id),
    enabled: tab === "history",
    staleTime: 2 * 60 * 1000,
  });

  const updateMut = useMutation({
    mutationFn: (body: { name: string; phone: string | null; email: string | null; notes: string | null }) =>
      customersApi.update(cust.id, body),
    onSuccess: (updated) => {
      onUpdated(updated);
      setEditErr(null);
    },
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
    updateMut.mutate({
      name: name.trim(),
      phone: buildPhone(phone),
      email: email.trim() || null,
      notes: notes.trim() || null,
    });
  }

  function handleReset() {
    setName(orig.name); setPhone(orig.phone);
    setEmail(orig.email); setNotes(orig.notes);
    setEditErr(null);
  }

  function handleDeleteClick() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 4000);
      return;
    }
    setDeleteErr(null);
    deleteMut.mutate();
  }

  const initials = getInitials(cust.name, cust.phone);
  const color = avatarColor(cust.name || cust.phone || String(cust.id));
  const sub = [cust.phone, cust.email].filter(Boolean).join(" · ") || "No contact info";

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 h-full w-96 max-w-full bg-canvas shadow-lg z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-hairline">
          <div
            className="w-10 h-10 rounded-full flex-shrink-0 grid place-items-center text-sm font-semibold text-white"
            style={{ background: color }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-ink truncate">{cust.name || "—"}</div>
            <div className="text-xs text-muted truncate">{sub}</div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink p-1 rounded-md hover:bg-surface-soft transition-colors">
            <CloseIcon />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-hairline px-5">
          {(["edit", "history", "danger"] as DrawerTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "pb-3 pt-3 mr-5 text-sm font-medium border-b-2 transition-colors capitalize",
                tab === t
                  ? t === "danger"
                    ? "border-error text-error"
                    : "border-primary text-primary"
                  : "border-transparent text-muted hover:text-ink",
                t === "danger" && !canManage ? "hidden" : "",
              ].join(" ")}
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
              <Field label="Name" required>
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  disabled={!canManage} placeholder="John Smith"
                  className={inputCls(!canManage)}
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  disabled={!canManage} placeholder="(555) 000-0000" maxLength={14}
                  className={inputCls(!canManage)}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  disabled={!canManage} placeholder="john@example.com"
                  className={inputCls(!canManage)}
                />
              </Field>
              <Field label="Notes">
                <textarea
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  disabled={!canManage} placeholder="Preferences, allergies…" rows={3}
                  className={inputCls(!canManage) + " resize-none"}
                />
              </Field>

              {editErr && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{editErr}</p>}

              {dirty && canManage && (
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={updateMut.isPending}
                    className="flex-1 h-9 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors"
                  >
                    {updateMut.isPending ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={updateMut.isPending}
                    className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft transition-colors"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          )}

          {/* History tab */}
          {tab === "history" && (
            <div>
              {apptLoading && <p className="text-sm text-muted py-4">Loading…</p>}
              {apptError && <p className="text-sm text-error py-4">Could not load appointments.</p>}
              {appts && appts.length === 0 && (
                <p className="text-sm text-muted py-4">No appointments on record.</p>
              )}
              {appts && appts.length > 0 && appts.map((a) => (
                <ApptRow key={a.id} appt={a} />
              ))}
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
              <button
                onClick={handleDeleteClick}
                disabled={deleteMut.isPending}
                className={[
                  "w-full h-9 text-sm font-medium rounded-md transition-colors disabled:opacity-60",
                  deleteConfirm
                    ? "bg-error text-white hover:bg-red-700"
                    : "border border-error text-error hover:bg-red-50",
                ].join(" ")}
              >
                {deleteMut.isPending
                  ? "Deleting…"
                  : deleteConfirm
                  ? "Are you sure? Click again to confirm."
                  : "Delete customer"}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ── Add customer modal ────────────────────────────────────────────────────────

function AddCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
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
    onSuccess: (c) => { onCreated(c); onClose(); },
    onError: (e: unknown) => {
      const data = (e as { data?: ApiError }).data;
      setErr(formatApiError(data ?? {}, "Could not add customer."));
    },
  });

  function handleSubmit() {
    if (!name.trim()) { setErr("Name is required."); return; }
    const phoneErr = validatePhone(phone);
    if (phoneErr) { setErr(phoneErr); return; }
    setErr(null);
    createMut.mutate();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-canvas rounded-xl shadow-lg w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
            <h2 className="font-display text-lg font-semibold text-ink">Add customer</h2>
            <button onClick={onClose} className="text-muted hover:text-ink p-1 rounded-md hover:bg-surface-soft transition-colors">
              <CloseIcon />
            </button>
          </div>
          <div className="px-6 py-5 flex flex-col gap-4">
            {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}
            <Field label="Name" required>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="John Smith" autoFocus className={inputCls(false)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </Field>
            <Field label="Phone" required>
              <input
                type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 000-0000" maxLength={14} className={inputCls(false)}
              />
            </Field>
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com" className={inputCls(false)} />
            </Field>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Preferences, allergies…" rows={3}
                className={inputCls(false) + " resize-none"} />
            </Field>
          </div>
          <div className="flex gap-3 px-6 pb-5">
            <button
              onClick={handleSubmit} disabled={createMut.isPending}
              className="flex-1 h-9 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors"
            >
              {createMut.isPending ? "Adding…" : "Add customer"}
            </button>
            <button onClick={onClose}
              className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
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
      return {
        ...old,
        customers: old.customers.map((c) => (c.id === updated.id ? updated : c)),
      };
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
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone or email…"
            className="w-full h-9 pl-9 pr-3 border border-hairline rounded-md text-sm bg-canvas focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
        </div>
        <select
          value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
        </select>
        {canManage && (
          <button
            onClick={() => setShowAdd(true)}
            className="h-9 px-4 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md transition-colors flex items-center gap-1.5"
          >
            <PlusIcon /> Add customer
          </button>
        )}
      </div>

      {/* States */}
      {isLoading && (
        <p className="text-sm text-muted py-8 text-center">Loading customers…</p>
      )}
      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">
          Could not load customers.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && customers.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center max-w-lg">
          <p className="font-semibold text-ink mb-1">No customers yet</p>
          <p className="text-sm text-muted">Add your first customer to get started.</p>
        </div>
      )}

      {/* No results */}
      {!isLoading && !isError && customers.length > 0 && visible.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center max-w-lg">
          <p className="font-semibold text-ink mb-1">No results</p>
          <p className="text-sm text-muted">No customers match &ldquo;<strong>{search}</strong>&rdquo;.</p>
        </div>
      )}

      {/* Table */}
      {visible.length > 0 && (
        <div className="bg-canvas rounded-xl border border-hairline overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline">
                {["Customer", "Phone", "Email", "Notes", "Since"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3 first:pl-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((cust) => {
                const initials = getInitials(cust.name, cust.phone);
                const color = avatarColor(cust.name || cust.phone || String(cust.id));
                const notesTrunc = (cust.notes || "").length > 50
                  ? (cust.notes || "").slice(0, 50) + "…"
                  : cust.notes || "";
                return (
                  <tr
                    key={cust.id}
                    onClick={() => setSelectedCust(cust)}
                    className="border-b border-hairline last:border-0 hover:bg-surface-soft cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 pl-5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-full grid place-items-center text-xs font-semibold text-white flex-shrink-0"
                          style={{ background: color }}
                        >
                          {initials}
                        </div>
                        <span className="font-medium text-ink">{cust.name || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{cust.phone || <span className="text-hairline">—</span>}</td>
                    <td className="px-4 py-3 text-muted">{cust.email || <span className="text-hairline">—</span>}</td>
                    <td className="px-4 py-3 text-muted max-w-xs truncate">{notesTrunc || <span className="text-hairline">—</span>}</td>
                    <td className="px-4 py-3 text-muted">{fmtDate(cust.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer */}
      {selectedCust && (
        <CustomerDrawer
          cust={selectedCust}
          canManage={canManage}
          onClose={() => setSelectedCust(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}

      {/* Add modal */}
      {showAdd && (
        <AddCustomerModal
          onClose={() => setShowAdd(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

// ── Tiny shared UI helpers ────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1.5">
        {label}{required && <span className="text-error ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function inputCls(disabled: boolean) {
  return [
    "w-full px-3 py-2 border rounded-md text-sm bg-canvas text-ink placeholder:text-muted",
    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors",
    disabled ? "border-hairline opacity-60 cursor-not-allowed" : "border-hairline",
  ].join(" ");
}

function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}
function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}
