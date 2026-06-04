/**
 * Services catalogue screen — port of dashboard-services.js + service
 * rendering helpers from dashboard-employees.js.
 *
 * Layout: 2-column (titles list | services panel) with modals for
 * create/edit/delete of titles, services, and variations.
 *
 * Behaviours reproduced:
 * - Branch-scoped (every call passes agent_id)
 * - Click title → show its services; "Uncategorised" virtual bucket
 * - Service accordion expand → shows variation rows or flat-rate row
 * - Flat vs. variation toggle when creating a service
 * - Color palette: 4 defaults + custom picker + auto-pick unused colour
 * - Drag-to-reorder services within a category
 * - Edit service metadata (name, description, color, prep times)
 * - Add / edit / delete / activate / deactivate variations
 * - Delete confirmation for titles, services, variations
 * - RBAC: manage_services gates all mutations
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { services as servicesApi, titles as titlesApi } from "../api";
import { useAgent } from "../contexts/AgentContext";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../lib/errors";
import type { ServiceResponse, ServiceVariationResponse, ServiceTitleWithServicesResponse, ApiError } from "../api/types";

// ── Design constants ──────────────────────────────────────────────────────────

const PALETTE_DEFAULTS = ["#3B82F6", "#22C55E", "#EF4444", "#F97316"];
const PALETTE_FULL = [
  "#EF4444","#F97316","#F59E0B","#EAB308","#84CC16","#22C55E",
  "#10B981","#14B8A6","#06B6D4","#0EA5E9","#3B82F6","#6366F1",
  "#8B5CF6","#A855F7","#D946EF","#EC4899","#F43F5E","#64748B","#6B7280","#78716C",
];

function autoPickColor(catalogue: { titles: ServiceTitleWithServicesResponse[]; uncategorised: ServiceResponse[] } | undefined): string {
  const used = new Set<string>();
  catalogue?.titles?.forEach((t) => t.services?.forEach((s) => { if (s.color) used.add(s.color.toUpperCase()); }));
  catalogue?.uncategorised?.forEach((s) => { if (s.color) used.add(s.color.toUpperCase()); });
  const pool = PALETTE_FULL.filter((c) => !used.has(c));
  const src = pool.length ? pool : PALETTE_FULL;
  return src[Math.floor(Math.random() * src.length)];
}

// ── Color picker ──────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const isCustom = value && !PALETTE_DEFAULTS.includes(value.toUpperCase());
  return (
    <div className="flex items-center gap-2">
      {PALETTE_DEFAULTS.map((hex) => (
        <button key={hex} type="button" onClick={() => onChange(hex)}
          className={`w-6 h-6 rounded-full transition-transform ${value.toUpperCase() === hex ? "ring-2 ring-offset-1 ring-ink scale-110" : "hover:scale-110"}`}
          style={{ background: hex }} />
      ))}
      {isCustom && (
        <button type="button" onClick={() => onChange(value)}
          className="w-6 h-6 rounded-full ring-2 ring-offset-1 ring-ink scale-110"
          style={{ background: value }} />
      )}
      <label className="w-6 h-6 rounded-full border-2 border-dashed border-muted grid place-items-center cursor-pointer hover:border-ink transition-colors" title="Custom colour">
        <span className="text-[10px] font-bold text-muted">+</span>
        <input type="color" value={value || PALETTE_DEFAULTS[0]} onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="absolute w-0 h-0 opacity-0 pointer-events-none" />
      </label>
    </div>
  );
}

// ── Tiny modal shell ──────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-canvas rounded-xl shadow-lg w-full max-w-lg pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
            <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
            <button onClick={onClose} className="text-muted hover:text-ink p-1 rounded hover:bg-surface-soft transition-colors"><XIcon /></button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}

// ── Title modal (create / rename) ─────────────────────────────────────────────

function TitleModal({ mode, initialName = "", onClose, onSave }:
  { mode: "create" | "edit"; initialName?: string; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initialName);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) { setErr("Category name cannot be empty."); return; }
    setSaving(true); setErr(null);
    try { await onSave(name.trim()); onClose(); }
    catch (e: unknown) { setErr((e as Error).message || "Could not save category."); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={mode === "create" ? "New category" : "Rename category"} onClose={onClose}>
      <div className="px-6 py-5 flex flex-col gap-4">
        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}
        <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder="e.g. Hair Colour" className={iCls} />
      </div>
      <div className="flex gap-3 px-6 pb-5">
        <button onClick={handleSave} disabled={saving}
          className="flex-1 h-9 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
          {saving ? "Saving…" : mode === "create" ? "Create category" : "Save"}
        </button>
        <button onClick={onClose} className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft transition-colors">Cancel</button>
      </div>
    </Modal>
  );
}

// ── Variation modal (add / edit) ──────────────────────────────────────────────

function VariationModal({ mode, initial, onClose, onSave }:
  { mode: "add" | "edit"; initial?: ServiceVariationResponse; onClose: () => void;
    onSave: (v: { name: string; price: number; duration_minutes: number }) => Promise<void> }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial ? String(parseFloat(initial.price as string)) : "");
  const [dur, setDur] = useState(initial ? String(initial.duration_minutes) : "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) { setErr("Name cannot be empty."); return; }
    const p = parseFloat(price); if (isNaN(p) || p < 0) { setErr("Price must be valid."); return; }
    const d = parseInt(dur); if (!d || d < 1) { setErr("Duration must be ≥ 1 minute."); return; }
    setSaving(true); setErr(null);
    try { await onSave({ name: name.trim(), price: p, duration_minutes: d }); onClose(); }
    catch (e: unknown) { const data = (e as { data?: ApiError }).data; setErr(formatApiError(data ?? {}, "Could not save variation.")); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={mode === "add" ? "Add variation" : "Edit variation"} onClose={onClose}>
      <div className="px-6 py-5 flex flex-col gap-4">
        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}
        <div><label className="block text-sm font-medium text-ink mb-1.5">Name</label>
          <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Short" className={iCls} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-sm font-medium text-ink mb-1.5">Price</label>
            <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className={iCls} /></div>
          <div><label className="block text-sm font-medium text-ink mb-1.5">Duration (min)</label>
            <input type="number" min="1" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="30" className={iCls} /></div>
        </div>
      </div>
      <div className="flex gap-3 px-6 pb-5">
        <button onClick={handleSave} disabled={saving}
          className="flex-1 h-9 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
          {saving ? "Saving…" : mode === "add" ? "Add variation" : "Save changes"}
        </button>
        <button onClick={onClose} className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft transition-colors">Cancel</button>
      </div>
    </Modal>
  );
}

// ── Service create modal ──────────────────────────────────────────────────────

function ServiceModal({ agentId, titleIds, defaultTitleId, catalogue, onClose, onSaved }:
  { agentId: number; titleIds: { id: number; name: string }[]; defaultTitleId?: number | null;
    catalogue: { titles: ServiceTitleWithServicesResponse[]; uncategorised: ServiceResponse[] } | undefined;
    onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [titleId, setTitleId] = useState<number | null>(defaultTitleId ?? null);
  const [isVar, setIsVar] = useState(false);
  const [price, setPrice] = useState("");
  const [dur, setDur] = useState("");
  const [prepBefore, setPrepBefore] = useState("");
  const [prepAfter, setPrepAfter] = useState("");
  const [color, setColor] = useState(() => autoPickColor(catalogue));
  const [varRows, setVarRows] = useState<{ name: string; price: string; dur: string }[]>([{ name: "", price: "", dur: "" }]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Inline "create new category" when user picks that option
  const [newCatName, setNewCatName] = useState("");
  const [creatingCat, setCreatingCat] = useState(false);
  const [localTitleIds, setLocalTitleIds] = useState(titleIds);
  const [showNewCat, setShowNewCat] = useState(false);

  async function createCat() {
    if (!newCatName.trim()) return;
    setCreatingCat(true);
    try {
      const t = await titlesApi.create({ agent_id: agentId, name: newCatName.trim() });
      setLocalTitleIds((prev) => [...prev, { id: t.id, name: t.name }]);
      setTitleId(t.id);
      setNewCatName("");
      setShowNewCat(false);
    } catch { /* ignore */ }
    finally { setCreatingCat(false); }
  }

  async function handleSave() {
    if (!name.trim()) { setErr("Service name cannot be empty."); return; }
    if (!color) { setErr("Please select a colour."); return; }
    if (prepBefore !== "" && (isNaN(parseInt(prepBefore)) || parseInt(prepBefore) < 0)) { setErr("Prep before must be 0 or greater."); return; }
    if (prepAfter !== "" && (isNaN(parseInt(prepAfter)) || parseInt(prepAfter) < 0)) { setErr("Prep after must be 0 or greater."); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {
      agent_id: agentId, name: name.trim(),
      description: desc.trim() || null,
      title_id: titleId || null,
      color,
      sort_order: 0,
    };
    if (prepBefore !== "") payload.preparation_before_minutes = parseInt(prepBefore);
    if (prepAfter !== "") payload.preparation_after_minutes = parseInt(prepAfter);

    if (isVar) {
      if (!varRows.length) { setErr("Add at least one variation."); return; }
      const variations = [];
      for (const row of varRows) {
        if (!row.name.trim()) { setErr("All variation names are required."); return; }
        const vp = parseFloat(row.price); if (isNaN(vp) || vp < 0) { setErr("All variation prices must be valid."); return; }
        const vd = parseInt(row.dur); if (!vd || vd < 1) { setErr("All variation durations must be ≥ 1 min."); return; }
        variations.push({ name: row.name.trim(), price: vp, duration_minutes: vd });
      }
      payload.variations = variations;
    } else {
      const p = parseFloat(price); if (isNaN(p) || p < 0) { setErr("Price must be a non-negative number."); return; }
      const d = parseInt(dur); if (!d || d < 1) { setErr("Duration must be at least 1 minute."); return; }
      payload.price = p; payload.duration_minutes = d; payload.variations = [];
    }

    setSaving(true); setErr(null);
    try { await servicesApi.create(payload as Parameters<typeof servicesApi.create>[0]); onSaved(); onClose(); }
    catch (e: unknown) { const data = (e as { data?: ApiError }).data; setErr(formatApiError(data ?? {}, "Could not create service.")); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="New service" onClose={onClose}>
      <div className="px-6 py-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}
        <div><label className="block text-sm font-medium text-ink mb-1.5">Name <span className="text-error">*</span></label>
          <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Haircut" className={iCls} /></div>

        <div><label className="block text-sm font-medium text-ink mb-1.5">Category</label>
          <select value={titleId ?? ""} onChange={(e) => { const v = e.target.value; if (v === "__new__") { setShowNewCat(true); } else { setTitleId(v ? parseInt(v) : null); setShowNewCat(false); } }} className={iCls}>
            <option value="">Uncategorised</option>
            {localTitleIds.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="__new__">+ Create new category…</option>
          </select>
          {showNewCat && (
            <div className="flex gap-2 mt-2">
              <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createCat(); } if (e.key === "Escape") setShowNewCat(false); }}
                placeholder="Category name" className={`${iCls} flex-1`} autoFocus />
              <button onClick={createCat} disabled={creatingCat}
                className="h-9 px-3 bg-primary text-white text-sm font-medium rounded-md disabled:opacity-60">{creatingCat ? "…" : "Create"}</button>
            </div>
          )}
        </div>

        <div><label className="block text-sm font-medium text-ink mb-1.5">Description</label>
          <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" className={iCls} /></div>

        <div><label className="block text-sm font-medium text-ink mb-1.5">Colour</label>
          <ColorPicker value={color} onChange={setColor} /></div>

        {/* Flat / Variation toggle */}
        <div>
          <label className="block text-sm font-medium text-ink mb-2">Pricing type</label>
          <div className="inline-flex rounded-md border border-hairline overflow-hidden">
            {[["flat", "Flat rate"], ["var", "Variations"]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setIsVar(k === "var")}
                className={`px-4 h-8 text-sm font-medium transition-colors ${(k === "var") === isVar ? "bg-primary text-white" : "bg-canvas text-ink hover:bg-surface-soft"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {!isVar && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-ink mb-1.5">Price <span className="text-error">*</span></label>
              <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className={iCls} /></div>
            <div><label className="block text-sm font-medium text-ink mb-1.5">Duration (min) <span className="text-error">*</span></label>
              <input type="number" min="1" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="30" className={iCls} /></div>
          </div>
        )}

        {isVar && (
          <div>
            <label className="block text-sm font-medium text-ink mb-2">Variations</label>
            <div className="flex flex-col gap-2">
              {varRows.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="text" value={row.name} onChange={(e) => setVarRows((r) => r.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    placeholder="Name" className={`${iCls} flex-1`} />
                  <input type="number" min="0" step="0.01" value={row.price} onChange={(e) => setVarRows((r) => r.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                    placeholder="Price" className={`${iCls} w-20`} />
                  <input type="number" min="1" value={row.dur} onChange={(e) => setVarRows((r) => r.map((x, j) => j === i ? { ...x, dur: e.target.value } : x))}
                    placeholder="Min" className={`${iCls} w-20`} />
                  {varRows.length > 1 && <button type="button" onClick={() => setVarRows((r) => r.filter((_, j) => j !== i))} className="text-muted hover:text-error text-lg leading-none">×</button>}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setVarRows((r) => [...r, { name: "", price: "", dur: "" }])}
              className="mt-2 text-sm text-primary hover:underline">+ Add variation</button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-sm font-medium text-ink mb-1.5">Prep before (min)</label>
            <input type="number" min="0" value={prepBefore} onChange={(e) => setPrepBefore(e.target.value)} placeholder="0" className={iCls} /></div>
          <div><label className="block text-sm font-medium text-ink mb-1.5">Prep after (min)</label>
            <input type="number" min="0" value={prepAfter} onChange={(e) => setPrepAfter(e.target.value)} placeholder="0" className={iCls} /></div>
        </div>
      </div>
      <div className="flex gap-3 px-6 pb-5">
        <button onClick={handleSave} disabled={saving}
          className="flex-1 h-9 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
          {saving ? "Creating…" : "Create service"}
        </button>
        <button onClick={onClose} className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft transition-colors">Cancel</button>
      </div>
    </Modal>
  );
}

// ── Edit service modal (metadata: name, desc, prep, color) ────────────────────

function EditServiceModal({ svc, agentId, onClose, onSaved }:
  { svc: ServiceResponse; agentId: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(svc.name);
  const [desc, setDesc] = useState(svc.description ?? "");
  const [color, setColor] = useState(svc.color ?? "#3B82F6");
  const [prepBefore, setPrepBefore] = useState(svc.preparation_before_minutes != null ? String(svc.preparation_before_minutes) : "");
  const [prepAfter, setPrepAfter] = useState(svc.preparation_after_minutes != null ? String(svc.preparation_after_minutes) : "");
  const [price, setPrice] = useState(svc.price != null ? String(parseFloat(svc.price as string)) : "");
  const [dur, setDur] = useState(svc.duration_minutes != null ? String(svc.duration_minutes) : "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isFlat = (svc.variations?.length ?? 0) === 0;

  async function handleSave() {
    if (!name.trim()) { setErr("Name cannot be empty."); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = { name: name.trim(), description: desc.trim() || null, color };
    body.preparation_before_minutes = prepBefore !== "" ? parseInt(prepBefore) : null;
    body.preparation_after_minutes = prepAfter !== "" ? parseInt(prepAfter) : null;
    if (isFlat) {
      const p = parseFloat(price); if (isNaN(p) || p < 0) { setErr("Price must be valid."); return; }
      const d = parseInt(dur); if (!d || d < 1) { setErr("Duration must be ≥ 1 minute."); return; }
      body.price = p; body.duration_minutes = d;
    }
    setSaving(true); setErr(null);
    try { await servicesApi.update(svc.id, agentId, body); onSaved(); onClose(); }
    catch (e: unknown) { const data = (e as { data?: ApiError }).data; setErr(formatApiError(data ?? {}, "Could not save.")); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={`Edit — ${svc.name}`} onClose={onClose}>
      <div className="px-6 py-5 flex flex-col gap-4">
        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}
        <div><label className="block text-sm font-medium text-ink mb-1.5">Name</label>
          <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} className={iCls} /></div>
        <div><label className="block text-sm font-medium text-ink mb-1.5">Description</label>
          <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" className={iCls} /></div>
        <div><label className="block text-sm font-medium text-ink mb-1.5">Colour</label>
          <ColorPicker value={color} onChange={setColor} /></div>
        {isFlat && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-ink mb-1.5">Price</label>
              <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={iCls} /></div>
            <div><label className="block text-sm font-medium text-ink mb-1.5">Duration (min)</label>
              <input type="number" min="1" value={dur} onChange={(e) => setDur(e.target.value)} className={iCls} /></div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-sm font-medium text-ink mb-1.5">Prep before (min)</label>
            <input type="number" min="0" value={prepBefore} onChange={(e) => setPrepBefore(e.target.value)} placeholder="0" className={iCls} /></div>
          <div><label className="block text-sm font-medium text-ink mb-1.5">Prep after (min)</label>
            <input type="number" min="0" value={prepAfter} onChange={(e) => setPrepAfter(e.target.value)} placeholder="0" className={iCls} /></div>
        </div>
      </div>
      <div className="flex gap-3 px-6 pb-5">
        <button onClick={handleSave} disabled={saving}
          className="flex-1 h-9 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button onClick={onClose} className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft transition-colors">Cancel</button>
      </div>
    </Modal>
  );
}

// ── Confirm delete modal ──────────────────────────────────────────────────────

function ConfirmDeleteModal({ title, body, onClose, onConfirm }:
  { title: string; body: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  async function go() { setDeleting(true); try { await onConfirm(); onClose(); } catch { /* error shown by caller */ } finally { setDeleting(false); } }
  return (
    <Modal title={title} onClose={onClose}>
      <div className="px-6 py-5">
        <p className="text-sm text-muted">{body}</p>
      </div>
      <div className="flex gap-3 px-6 pb-5">
        <button onClick={go} disabled={deleting}
          className="flex-1 h-9 bg-error hover:bg-red-700 text-white text-sm font-medium rounded-md disabled:opacity-60 transition-colors">
          {deleting ? "Deleting…" : "Delete"}
        </button>
        <button onClick={onClose} className="h-9 px-4 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft transition-colors">Cancel</button>
      </div>
    </Modal>
  );
}

// ── Service row with accordion ────────────────────────────────────────────────

function ServiceRow({ svc, agentId, canManage, expanded, onToggleExpand, onEdited, onDeleted, onToast }:
  { svc: ServiceResponse; agentId: number; canManage: boolean; expanded: boolean;
    onToggleExpand: () => void; onEdited: () => void; onDeleted: () => void; onToast: (m: string) => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [varModal, setVarModal] = useState<{ mode: "add" | "edit"; variation?: ServiceVariationResponse } | null>(null);
  const [varDeleteModal, setVarDeleteModal] = useState<ServiceVariationResponse | null>(null);
  const isVarBased = (svc.variations?.length ?? 0) > 0;
  const color = svc.active ? (svc.color ?? "#2563EB") : "#e5e7eb";

  async function toggleActive() {
    try {
      svc.active ? await servicesApi.deactivate(svc.id, agentId) : await servicesApi.activate(svc.id, agentId);
      onEdited(); onToast(`Service ${svc.active ? "deactivated" : "activated"}.`);
    } catch { onToast("Could not update status."); }
  }

  async function doDelete() {
    await servicesApi.delete(svc.id, agentId);
    onDeleted(); onToast("Service deleted.");
  }

  async function toggleVariationActive(v: ServiceVariationResponse) {
    try {
      v.active ? await servicesApi.deactivateVariation(svc.id, v.id, agentId) : await servicesApi.activateVariation(svc.id, v.id, agentId);
      onEdited(); onToast(`Variation ${v.active ? "deactivated" : "activated"}.`);
    } catch { onToast("Could not update variation status."); }
  }

  return (
    <div className="border border-hairline rounded-lg overflow-hidden mb-2">
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-canvas hover:bg-surface-soft/50 transition-colors">
        <span className="w-1 h-6 rounded-full flex-shrink-0" style={{ background: color }} />
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${svc.active ? "text-ink" : "text-muted line-through"}`}>{svc.name}</span>
          {svc.description && <p className="text-xs text-muted truncate mt-0.5">{svc.description}</p>}
        </div>
        {!svc.active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-pill">Inactive</span>}
        {canManage && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={toggleActive} title={svc.active ? "Deactivate" : "Activate"}
              className="w-6 h-6 grid place-items-center rounded text-muted hover:text-ink hover:bg-surface-strong transition-colors">
              {svc.active ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button onClick={() => setEditOpen(true)} title="Edit"
              className="w-6 h-6 grid place-items-center rounded text-muted hover:text-ink hover:bg-surface-strong transition-colors"><EditIcon /></button>
            <button onClick={() => setDeleteOpen(true)} title="Delete"
              className="w-6 h-6 grid place-items-center rounded text-muted hover:text-error hover:bg-red-50 transition-colors"><TrashIcon /></button>
          </div>
        )}
        <button onClick={onToggleExpand}
          className={`w-5 h-5 grid place-items-center text-muted transition-transform ${expanded ? "rotate-180" : ""}`}>
          <ChevronIcon size={12} />
        </button>
      </div>

      {/* Accordion */}
      {expanded && (
        <div className="border-t border-hairline bg-surface-soft/30">
          <div className="grid grid-cols-3 text-xs font-semibold text-muted uppercase tracking-wide px-4 py-1.5 border-b border-hairline">
            <span>{isVarBased ? "Variation" : "Rate"}</span>
            <span>Duration</span>
            <span>Price</span>
          </div>
          {isVarBased ? (
            <>
              {svc.variations.map((v, i) => (
                <div key={v.id} onClick={() => canManage && setVarModal({ mode: "edit", variation: v })}
                  className={`grid grid-cols-3 items-center px-4 py-2 text-sm ${i % 2 === 1 ? "bg-surface-soft/60" : ""} ${canManage ? "cursor-pointer hover:bg-surface-strong/40" : ""} transition-colors`}>
                  <span className={`font-medium ${v.active ? "text-ink" : "text-muted line-through"}`}>{v.name}</span>
                  <span className="text-muted">{v.duration_minutes} min</span>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">${parseFloat(v.price as string).toFixed(2)}</span>
                    {canManage && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleVariationActive(v)} title={v.active ? "Deactivate" : "Activate"}
                          className="w-5 h-5 grid place-items-center rounded text-muted hover:text-ink hover:bg-surface-strong transition-colors">
                          {v.active ? <PauseIcon size={10} /> : <PlayIcon size={10} />}
                        </button>
                        <button onClick={() => setVarDeleteModal(v)} title="Delete"
                          className="w-5 h-5 grid place-items-center rounded text-muted hover:text-error hover:bg-red-50 transition-colors">
                          <TrashIcon size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {canManage && (
                <button onClick={() => setVarModal({ mode: "add" })}
                  className="w-full text-sm text-primary hover:bg-primary/5 px-4 py-2 text-left transition-colors">
                  + Add variation
                </button>
              )}
            </>
          ) : (
            <div onClick={() => canManage && setEditOpen(true)}
              className={`grid grid-cols-3 items-center px-4 py-2 text-sm ${canManage ? "cursor-pointer hover:bg-surface-strong/40" : ""} transition-colors`}>
              <span className="font-medium text-ink">Base rate</span>
              <span className="text-muted">{svc.duration_minutes ?? 0} min</span>
              <span className="text-muted">${parseFloat((svc.price ?? "0") as string).toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {editOpen && <EditServiceModal svc={svc} agentId={agentId} onClose={() => setEditOpen(false)} onSaved={() => { onEdited(); onToast("Service updated."); }} />}
      {deleteOpen && <ConfirmDeleteModal title="Delete service?" body={`Permanently delete "${svc.name}"?`} onClose={() => setDeleteOpen(false)} onConfirm={doDelete} />}
      {varModal && (
        <VariationModal mode={varModal.mode} initial={varModal.variation} onClose={() => setVarModal(null)}
          onSave={async (v) => {
            if (varModal.mode === "add") await servicesApi.addVariation(svc.id, agentId, v);
            else await servicesApi.updateVariation(svc.id, varModal.variation!.id, agentId, v);
            onEdited(); onToast(varModal.mode === "add" ? "Variation added." : "Variation updated.");
          }} />
      )}
      {varDeleteModal && (
        <ConfirmDeleteModal title="Delete variation?" body={`Delete "${varDeleteModal.name}"?`} onClose={() => setVarDeleteModal(null)}
          onConfirm={async () => { await servicesApi.deleteVariation(svc.id, varDeleteModal.id, agentId); onEdited(); onToast("Variation deleted."); }} />
      )}
    </div>
  );
}

// ── Services panel (middle column) ────────────────────────────────────────────

function ServicesPanel({ services, titleName, agentId, canManage, onMutated, onToast }:
  { services: ServiceResponse[]; titleName: string; agentId: number; canManage: boolean;
    onMutated: () => void; onToast: (m: string) => void }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const dragSrc = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Drag-to-reorder sort_order update
  async function onDragEnd(ids: number[]) {
    await Promise.all(ids.map((id, idx) => servicesApi.update(id, agentId, { sort_order: idx })));
    onMutated();
  }

  if (!services.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted gap-2">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        <p className="text-sm">No services in {titleName} yet.</p>
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto p-3">
      {services.map((svc) => (
        <div key={svc.id} draggable={canManage}
          onDragStart={() => { dragSrc.current = svc.id; }}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={async (e) => {
            e.preventDefault();
            if (!dragSrc.current || dragSrc.current === svc.id) return;
            const items = listRef.current?.querySelectorAll("[data-svc-id]");
            if (!items) return;
            const ids = Array.from(items).map((el) => parseInt(el.getAttribute("data-svc-id") || "0"));
            const srcIdx = ids.indexOf(dragSrc.current); const dstIdx = ids.indexOf(svc.id);
            if (srcIdx === -1 || dstIdx === -1) return;
            const reordered = [...ids]; reordered.splice(srcIdx, 1); reordered.splice(dstIdx, 0, dragSrc.current);
            dragSrc.current = null;
            await onDragEnd(reordered);
          }}
          data-svc-id={svc.id}>
          <ServiceRow svc={svc} agentId={agentId} canManage={canManage}
            expanded={expandedId === svc.id}
            onToggleExpand={() => setExpandedId(expandedId === svc.id ? null : svc.id)}
            onEdited={onMutated} onDeleted={onMutated} onToast={onToast} />
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TitleSelection = number | "uncategorised" | null;

export default function Services() {
  const { me } = useAuth();
  const { activeAgentId } = useAgent();
  const qc = useQueryClient();
  const canManage = me?.is_owner || (me?.permissions ?? []).includes("manage_services");

  const [selectedTitle, setSelectedTitle] = useState<TitleSelection>(null);
  const [titleModal, setTitleModal] = useState<{ mode: "create" | "edit"; id?: number; name?: string } | null>(null);
  const [titleDeleteModal, setTitleDeleteModal] = useState<{ id: number; name: string } | null>(null);
  const [svcModal, setSvcModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const { data: catalogue, isLoading, isError } = useQuery({
    queryKey: ["services-catalogue", activeAgentId],
    queryFn: () => servicesApi.catalogue(activeAgentId!),
    enabled: activeAgentId != null,
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["services-catalogue", activeAgentId] });

  const titleDeleteMut = useMutation({
    mutationFn: ({ id }: { id: number }) => titlesApi.delete(id, activeAgentId!),
    onSuccess: () => { invalidate(); showToast("Category deleted."); },
  });

  const allTitles = catalogue?.titles ?? [];
  const uncategorised = catalogue?.uncategorised ?? [];

  // Selected services list
  let selectedServices: ServiceResponse[] = [];
  let panelTitle = "Services";
  if (selectedTitle === "uncategorised") { selectedServices = uncategorised; panelTitle = "Uncategorised"; }
  else if (typeof selectedTitle === "number") {
    const t = allTitles.find((t) => t.id === selectedTitle);
    if (t) { selectedServices = t.services ?? []; panelTitle = `${t.name}`; }
  }

  if (!activeAgentId) return <p className="text-sm text-muted">No branch selected.</p>;

  return (
    <div className="h-full flex flex-col">
      {/* Top toolbar */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-base font-semibold text-ink">Service catalogue</h2>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => setTitleModal({ mode: "create" })}
              className="h-8 px-3 border border-hairline text-sm text-ink rounded-md hover:bg-surface-soft transition-colors">
              + Category
            </button>
            <button onClick={() => setSvcModal(true)}
              className="h-8 px-3 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md transition-colors">
              + Service
            </button>
          </div>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted py-4">Loading…</p>}
      {isError && <p className="text-sm text-error py-4">Could not load services.</p>}

      {!isLoading && !isError && (
        <div className="flex gap-4 flex-1 min-h-0 bg-canvas rounded-xl border border-hairline overflow-hidden">
          {/* Left: Titles list */}
          <div className="w-56 flex-shrink-0 border-r border-hairline overflow-y-auto">
            <div className="p-3 border-b border-hairline">
              <span className="text-xs font-semibold text-muted uppercase tracking-wide">Categories</span>
            </div>
            {!allTitles.length && !uncategorised.length ? (
              <p className="text-xs text-muted p-3">No categories yet.</p>
            ) : (
              <>
                {allTitles.map((t) => (
                  <div key={t.id} onClick={() => setSelectedTitle(t.id)}
                    className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${selectedTitle === t.id ? "bg-primary/10 text-primary" : "hover:bg-surface-soft text-ink"}`}>
                    <div className={`w-6 h-6 rounded grid place-items-center text-[10px] font-bold flex-shrink-0 ${selectedTitle === t.id ? "bg-primary text-white" : "bg-surface-strong text-muted"}`}>
                      {t.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm font-medium truncate">{t.name}</span>
                    <span className="text-xs text-muted">{(t.services ?? []).length}</span>
                    {canManage && (
                      <div className="hidden group-hover:flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setTitleModal({ mode: "edit", id: t.id, name: t.name })}
                          className="w-5 h-5 grid place-items-center rounded text-muted hover:text-ink hover:bg-surface-strong"><EditIcon size={10} /></button>
                        <button onClick={() => setTitleDeleteModal({ id: t.id, name: t.name })}
                          className="w-5 h-5 grid place-items-center rounded text-muted hover:text-error hover:bg-red-50"><TrashIcon size={10} /></button>
                      </div>
                    )}
                  </div>
                ))}
                {uncategorised.length > 0 && (
                  <div onClick={() => setSelectedTitle("uncategorised")}
                    className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${selectedTitle === "uncategorised" ? "bg-primary/10 text-primary" : "hover:bg-surface-soft text-muted"}`}>
                    <div className="w-6 h-6 rounded grid place-items-center text-[10px] font-bold bg-surface-strong text-muted flex-shrink-0">…</div>
                    <span className="flex-1 text-sm font-medium">Uncategorised</span>
                    <span className="text-xs text-muted">{uncategorised.length}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: Services */}
          <div className="flex-1 flex flex-col min-h-0">
            {selectedTitle === null ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted gap-2">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                <p className="text-sm">Select a category to see its services</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-hairline flex-shrink-0">
                  <span className="text-sm font-semibold text-ink">{panelTitle}</span>
                </div>
                <ServicesPanel services={selectedServices} titleName={panelTitle} agentId={activeAgentId}
                  canManage={canManage} onMutated={invalidate} onToast={showToast} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}

      {/* Modals */}
      {titleModal && (
        <TitleModal mode={titleModal.mode} initialName={titleModal.name}
          onClose={() => setTitleModal(null)}
          onSave={async (name) => {
            if (titleModal.mode === "create") await titlesApi.create({ agent_id: activeAgentId, name });
            else await titlesApi.update(titleModal.id!, activeAgentId, { name });
            invalidate(); showToast(titleModal.mode === "create" ? "Category created." : "Category renamed.");
          }} />
      )}
      {titleDeleteModal && (
        <ConfirmDeleteModal title="Delete category?" body={`Delete "${titleDeleteModal.name}" and all its services?`}
          onClose={() => setTitleDeleteModal(null)}
          onConfirm={() => titleDeleteMut.mutateAsync({ id: titleDeleteModal.id })} />
      )}
      {svcModal && (
        <ServiceModal agentId={activeAgentId} titleIds={allTitles.map((t) => ({ id: t.id, name: t.name }))}
          defaultTitleId={typeof selectedTitle === "number" ? selectedTitle : null}
          catalogue={catalogue}
          onClose={() => setSvcModal(false)}
          onSaved={() => { invalidate(); showToast("Service created."); }} />
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const iCls = "w-full h-9 px-3 border border-hairline rounded-md text-sm bg-canvas text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

function XIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>; }
function EditIcon({ size = 12 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function TrashIcon({ size = 12 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function ChevronIcon({ size = 14 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
function PauseIcon({ size = 12 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>; }
function PlayIcon({ size = 12 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }
