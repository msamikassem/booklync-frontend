/**
 * Capabilities panel — faithful port of _createCapPanel from dashboard-employees.js.
 *
 * Two sections:
 *
 * 1. Assigned list — tree grouped by title → service → variation.
 *    - Tree nodes (title / variation-based service) collapse/expand.
 *    - Capability leaves: click to expand extra-price input.
 *    - Remove (×) marks pending; Undo (↩) reverses it.
 *    - Pending adds shown at bottom with "New" badge and extra-price field.
 *    - "Save changes" / "Discard" footer appears when anything is pending.
 *
 * 2. Service picker (tree with checkboxes):
 *    - Sections: Uncategorised → titled sections.
 *    - Title checkbox cascades to all children.
 *    - Variation-based service expands to show per-variation checkboxes.
 *    - Flat-rate service is a single checkbox.
 *    - Search filters the tree in real time.
 *    - Already-assigned items appear checked (disabled).
 */

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { employeesApi } from "./api";
import { services as servicesApi } from "../../api";
import type { CapabilityResponse } from "./types";
import type { ServiceResponse, ServiceTitleWithServicesResponse } from "../../api/types";

// ── Local types ───────────────────────────────────────────────────────────────

interface PendingAdd {
  type: "title" | "service" | "variation";
  id: number;
  label: string;
  sub: string | null;
  extraPrice: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findSvc(titles: ServiceTitleWithServicesResponse[], uncat: ServiceResponse[], svcId: number): ServiceResponse | null {
  for (const t of titles) { const s = t.services?.find(s => s.id === svcId); if (s) return s; }
  return uncat.find(s => s.id === svcId) ?? null;
}
function findVar(titles: ServiceTitleWithServicesResponse[], uncat: ServiceResponse[], varId: number) {
  for (const t of titles) { for (const s of t.services ?? []) { const v = s.variations?.find(v => v.id === varId); if (v) return { svc: s, v }; } }
  for (const s of uncat) { const v = s.variations?.find(v => v.id === varId); if (v) return { svc: s, v }; }
  return { svc: null, v: null };
}
function basePrice(cap: CapabilityResponse, titles: ServiceTitleWithServicesResponse[], uncat: ServiceResponse[]): number | null {
  if (cap.variation_id) { const { v } = findVar(titles, uncat, cap.variation_id); return v ? parseFloat(v.price as string) : null; }
  if (cap.service_id) { const s = findSvc(titles, uncat, cap.service_id); if (!s || (s.variations?.length ?? 0) > 0) return null; return parseFloat((s.price ?? "0") as string); }
  return null;
}
function capLabel(cap: CapabilityResponse, titles: ServiceTitleWithServicesResponse[], uncat: ServiceResponse[]): { label: string; sub: string | null } {
  if (cap.title_id) { const t = titles.find(t => t.id === cap.title_id); return { label: t?.name ?? `Category #${cap.title_id}`, sub: "All services in category" }; }
  if (cap.service_id) { const s = findSvc(titles, uncat, cap.service_id); return { label: s?.name ?? `Service #${cap.service_id}`, sub: null }; }
  if (cap.variation_id) { const { svc, v } = findVar(titles, uncat, cap.variation_id); return { label: v?.name ?? `Variation #${cap.variation_id}`, sub: svc?.name ?? null }; }
  return { label: "Unknown", sub: null };
}

// ── Main component ────────────────────────────────────────────────────────────

export function EmployeeCapabilities({ empId, agentId, canEdit }: { empId: number; agentId: number; canEdit: boolean }) {
  const qc = useQueryClient();

  const { data: caps = [], isLoading: capsLoading } = useQuery({
    queryKey: ["emp-caps", empId, agentId],
    queryFn: () => employeesApi.getCapabilities(empId, agentId),
    staleTime: 5 * 60 * 1000,
  });

  const { data: catalogue } = useQuery({
    queryKey: ["services-catalogue", agentId],
    queryFn: () => servicesApi.catalogue(agentId),
    staleTime: 5 * 60 * 1000,
  });

  const titles: ServiceTitleWithServicesResponse[] = catalogue?.titles ?? [];
  const uncat: ServiceResponse[] = catalogue?.uncategorised ?? [];

  // ── Pending state ──────────────────────────────────────────────────────────
  const [pendingAdd, setPendingAdd]       = useState<PendingAdd[]>([]);
  const [pendingRemove, setPendingRemove] = useState<Set<number>>(new Set());
  const [pendingUpdate, setPendingUpdate] = useState<Map<number, number>>(new Map());

  // ── UI state ───────────────────────────────────────────────────────────────
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [expandedCaps, setExpandedCaps]     = useState<Set<number>>(new Set());
  const [pickerOpen, setPickerOpen]         = useState(false);
  const [expandedSvcs, setExpandedSvcs]     = useState<Set<number>>(new Set());
  const [search, setSearch]                 = useState("");
  const [saving, setSaving]                 = useState(false);
  const [err, setErr]                       = useState<string | null>(null);
  const [toast, setToast]                   = useState<string | null>(null);

  const hasPending = pendingAdd.length > 0 || pendingRemove.size > 0 || pendingUpdate.size > 0;

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(null), 3000); }
  function invalidate() { qc.invalidateQueries({ queryKey: ["emp-caps", empId, agentId] }); }

  // ── Effective sets (committed non-removed + pending adds) ──────────────────
  const effective = useCallback(() => {
    const active = (fn: (c: CapabilityResponse) => boolean) => caps.filter(c => !pendingRemove.has(c.id) && fn(c));
    return {
      titleIds: new Set([...active(c => c.title_id != null).map(c => c.title_id!), ...pendingAdd.filter(p => p.type === "title").map(p => p.id)]),
      svcIds:   new Set([...active(c => c.service_id != null).map(c => c.service_id!), ...pendingAdd.filter(p => p.type === "service").map(p => p.id)]),
      varIds:   new Set([...active(c => c.variation_id != null).map(c => c.variation_id!), ...pendingAdd.filter(p => p.type === "variation").map(p => p.id)]),
    };
  }, [caps, pendingRemove, pendingAdd]);

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setErr(null);
    try {
      await Promise.all([...pendingRemove].map(id => employeesApi.removeCapability(empId, agentId, id)));
      await Promise.all(pendingAdd.map(p => employeesApi.addCapability(empId, agentId, {
        ...(p.type === "title"     && { title_id:     p.id }),
        ...(p.type === "service"   && { service_id:   p.id }),
        ...(p.type === "variation" && { variation_id: p.id }),
        extra_price: p.extraPrice,
      })));
      await Promise.all([...pendingUpdate.entries()].map(([capId, extra]) =>
        employeesApi.addCapability(empId, agentId, {
          ...((() => { const c = caps.find(x => x.id === capId)!; return c.title_id ? { title_id: c.title_id } : c.service_id ? { service_id: c.service_id } : { variation_id: c.variation_id! }; })()),
          extra_price: extra,
        }).then(async () => { await employeesApi.removeCapability(empId, agentId, capId); })
      ));
      setPendingAdd([]); setPendingRemove(new Set()); setPendingUpdate(new Map());
      invalidate(); showToast("Capabilities saved.");
    } catch { setErr("Could not save changes."); }
    finally { setSaving(false); }
  }

  function handleDiscard() {
    setPendingAdd([]); setPendingRemove(new Set()); setPendingUpdate(new Map());
  }

  // ── Picker checkbox handler ────────────────────────────────────────────────
  function onPickerCheck(type: "title" | "service" | "variation", id: number, checked: boolean) {
    const { svcIds, varIds } = effective();
    const committed = caps.find(c =>
      (type === "title" && c.title_id === id) ||
      (type === "service" && c.service_id === id) ||
      (type === "variation" && c.variation_id === id)
    );

    if (checked) {
      // Undo a pending remove if the item was already committed
      if (committed && pendingRemove.has(committed.id)) {
        setPendingRemove(prev => { const n = new Set(prev); n.delete(committed.id); return n; });
        return;
      }
      if (committed) return; // already assigned

      if (type === "title") {
        const t = titles.find(t => t.id === id);
        const adds: PendingAdd[] = [];
        for (const svc of t?.services ?? []) {
          if ((svc.variations?.length ?? 0) > 0) {
            for (const v of svc.variations!) {
              if (!varIds.has(v.id))
                adds.push({ type: "variation", id: v.id, label: v.name, sub: svc.name, extraPrice: 0 });
            }
            setExpandedSvcs(prev => { const n = new Set(prev); n.add(svc.id); return n; });
          } else {
            if (!svcIds.has(svc.id))
              adds.push({ type: "service", id: svc.id, label: svc.name, sub: t!.name, extraPrice: 0 });
          }
        }
        setPendingAdd(prev => [...prev, ...adds]);
      } else if (type === "service") {
        const svc = findSvc(titles, uncat, id);
        if (svc && (svc.variations?.length ?? 0) > 0) {
          const adds: PendingAdd[] = [];
          for (const v of svc.variations!) {
            if (!varIds.has(v.id))
              adds.push({ type: "variation", id: v.id, label: v.name, sub: svc.name, extraPrice: 0 });
          }
          setPendingAdd(prev => [...prev, ...adds]);
          setExpandedSvcs(prev => { const n = new Set(prev); n.add(id); return n; });
        } else {
          setPendingAdd(prev => [...prev, { type, id, label: svc?.name ?? `Service #${id}`, sub: null, extraPrice: 0 }]);
        }
      } else {
        const { svc, v } = findVar(titles, uncat, id);
        setPendingAdd(prev => [...prev, { type, id, label: v?.name ?? `Variation #${id}`, sub: svc?.name ?? null, extraPrice: 0 }]);
      }
    } else {
      // Uncheck
      if (type === "title") {
        const t = titles.find(t => t.id === id);
        const titleSvcIds = new Set(t?.services?.map(s => s.id) ?? []);
        const titleVarIds = new Set(t?.services?.flatMap(s => s.variations?.map(v => v.id) ?? []) ?? []);
        setPendingAdd(prev => prev.filter(p => !(p.type === "service" && titleSvcIds.has(p.id)) && !(p.type === "variation" && titleVarIds.has(p.id))));
        const toRemove = caps.filter(c => (c.service_id && titleSvcIds.has(c.service_id)) || (c.variation_id && titleVarIds.has(c.variation_id)));
        if (toRemove.length) setPendingRemove(prev => { const n = new Set(prev); toRemove.forEach(c => n.add(c.id)); return n; });
      } else if (type === "service") {
        const svc = findSvc(titles, uncat, id);
        const varIds2 = new Set(svc?.variations?.map(v => v.id) ?? []);
        setPendingAdd(prev => prev.filter(p => !(p.type === "service" && p.id === id) && !(p.type === "variation" && varIds2.has(p.id))));
        const toRemove = caps.filter(c => c.service_id === id || (c.variation_id && varIds2.has(c.variation_id)));
        if (toRemove.length) setPendingRemove(prev => { const n = new Set(prev); toRemove.forEach(c => n.add(c.id)); return n; });
      } else {
        setPendingAdd(prev => prev.filter(p => !(p.type === "variation" && p.id === id)));
        const cap2 = caps.find(c => c.variation_id === id);
        if (cap2) setPendingRemove(prev => { const n = new Set(prev); n.add(cap2.id); return n; });
      }
    }
  }

  // ── Assigned list rendering ────────────────────────────────────────────────
  function renderList() {
    if (!caps.length && !pendingAdd.length) {
      return <p className="text-xs text-muted py-1">Nothing assigned yet.</p>;
    }

    const nodes: React.ReactNode[] = [];
    const rendered = new Set<number>();

    function CapLeaf({ cap, indent }: { cap: CapabilityResponse; indent?: boolean }) {
      const removing = pendingRemove.has(cap.id);
      const extra = pendingUpdate.has(cap.id) ? pendingUpdate.get(cap.id)! : parseFloat(cap.extra_price as string ?? "0");
      const base  = basePrice(cap, titles, uncat);
      const total = base !== null ? base + extra : null;
      const { label } = capLabel(cap, titles, uncat);
      const expanded = expandedCaps.has(cap.id) && !removing;
      const dirty    = pendingUpdate.has(cap.id);

      return (
        <div
          onClick={() => {
            if (removing) return;
            setExpandedCaps(prev => { const n = new Set(prev); n.has(cap.id) ? n.delete(cap.id) : n.add(cap.id); return n; });
          }}
          className={[
            "flex items-center gap-2 px-3 py-1.5 rounded text-sm cursor-pointer transition-colors select-none",
            indent ? "ml-5" : "",
            removing ? "line-through opacity-50 bg-red-50" : dirty ? "bg-amber-50" : "hover:bg-surface-soft",
          ].join(" ")}
        >
          <span className={`flex-1 text-ink ${removing ? "text-error" : ""}`}>{label}</span>
          {removing && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Removing</span>}
          {canEdit && (
            <button type="button"
              onClick={e => {
                e.stopPropagation();
                setPendingRemove(prev => { const n = new Set(prev); n.has(cap.id) ? n.delete(cap.id) : n.add(cap.id); return n; });
                if (pendingUpdate.has(cap.id) && !pendingRemove.has(cap.id)) {
                  setPendingUpdate(prev => { const n = new Map(prev); n.delete(cap.id); return n; });
                }
              }}
              className="text-xs text-muted hover:text-error w-5 h-5 grid place-items-center rounded hover:bg-red-50">
              {removing ? "↩" : "×"}
            </button>
          )}
          {expanded && !removing && (
            <div className="flex items-center gap-1 text-xs text-muted" onClick={e => e.stopPropagation()}>
              {base !== null && <span className="text-muted">${base.toFixed(2)}</span>}
              {base !== null && <span className="text-muted">+</span>}
              <span className="text-muted">$</span>
              <input type="number" min="0" step="0.01" value={extra.toFixed(2)}
                className="w-16 h-6 px-1 text-xs border border-hairline rounded bg-canvas focus:outline-none focus:ring-1 focus:ring-primary/30"
                onClick={e => e.stopPropagation()}
                onChange={e => {
                  const newExtra = parseFloat(e.target.value) || 0;
                  const orig = parseFloat(cap.extra_price as string ?? "0");
                  setPendingUpdate(prev => {
                    const n = new Map(prev);
                    Math.abs(newExtra - orig) > 0.001 ? n.set(cap.id, newExtra) : n.delete(cap.id);
                    return n;
                  });
                }}
              />
              {total !== null && <span className="text-muted">= ${total.toFixed(2)}</span>}
            </div>
          )}
        </div>
      );
    }

    function TreeNode({ nodeKey, label, indent }: { nodeKey: string; label: string; indent?: boolean }) {
      const open = !collapsedNodes.has(nodeKey);
      return (
        <div
          onClick={() => setCollapsedNodes(prev => { const n = new Set(prev); n.has(nodeKey) ? n.delete(nodeKey) : n.add(nodeKey); return n; })}
          className={["flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted uppercase tracking-wide cursor-pointer hover:text-ink select-none", indent ? "ml-3" : ""].join(" ")}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-90" : ""}`}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          {label}
        </div>
      );
    }

    // Walk catalogue tree
    for (const title of titles) {
      const titleCap = caps.find(c => c.title_id === title.id);
      const svcGroups: { svc: ServiceResponse; svcCap: CapabilityResponse | undefined; varCaps: CapabilityResponse[] }[] = [];
      for (const svc of title.services ?? []) {
        const svcCap  = caps.find(c => c.service_id === svc.id);
        const varCaps = caps.filter(c => c.variation_id != null && svc.variations?.some(v => v.id === c.variation_id));
        if (svcCap || varCaps.length) svcGroups.push({ svc, svcCap, varCaps });
      }
      if (!titleCap && !svcGroups.length) continue;

      const key = `t_${title.id}`;
      const open = !collapsedNodes.has(key);
      nodes.push(<TreeNode key={`tn_${key}`} nodeKey={key} label={title.name} />);
      if (open) {
        if (titleCap) { nodes.push(<CapLeaf key={titleCap.id} cap={titleCap} indent />); rendered.add(titleCap.id); }
        for (const { svc, svcCap, varCaps } of svcGroups) {
          if (varCaps.length) {
            const svcKey = `s_${svc.id}`;
            const svcOpen = !collapsedNodes.has(svcKey);
            nodes.push(<TreeNode key={`tn_${svcKey}`} nodeKey={svcKey} label={svc.name} indent />);
            if (svcOpen) { for (const vc of varCaps) { nodes.push(<CapLeaf key={vc.id} cap={vc} indent />); rendered.add(vc.id); } }
          }
          if (svcCap) { nodes.push(<CapLeaf key={svcCap.id} cap={svcCap} indent />); rendered.add(svcCap.id); }
        }
      }
    }
    // Uncategorised
    for (const svc of uncat) {
      const svcCap  = caps.find(c => c.service_id === svc.id);
      const varCaps = caps.filter(c => c.variation_id != null && svc.variations?.some(v => v.id === c.variation_id));
      if (!svcCap && !varCaps.length) continue;
      if (varCaps.length) {
        const svcKey = `s_${svc.id}`;
        const svcOpen = !collapsedNodes.has(svcKey);
        nodes.push(<TreeNode key={`tn_${svcKey}`} nodeKey={svcKey} label={svc.name} />);
        if (svcOpen) { for (const vc of varCaps) { nodes.push(<CapLeaf key={vc.id} cap={vc} indent />); rendered.add(vc.id); } }
      }
      if (svcCap) { nodes.push(<CapLeaf key={svcCap.id} cap={svcCap} />); rendered.add(svcCap.id); }
    }
    // Orphaned caps (shouldn't happen, safety net)
    for (const cap of caps) {
      if (!rendered.has(cap.id)) nodes.push(<CapLeaf key={cap.id} cap={cap} />);
    }
    // Pending adds
    for (const p of pendingAdd) {
      nodes.push(
        <div key={`pa_${p.type}_${p.id}`} className="flex items-center gap-2 px-3 py-1.5 rounded bg-green-50 text-sm">
          <div className="flex-1 min-w-0">
            <span className="text-ink">{p.label}</span>
            {p.sub && <span className="text-xs text-muted ml-1.5">{p.sub}</span>}
          </div>
          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">New</span>
          <label className="flex items-center gap-0.5 text-xs text-muted flex-shrink-0">
            <span>+$</span>
            <input type="number" min="0" step="0.01" value={p.extraPrice.toFixed(2)}
              className="w-14 h-6 px-1 text-xs border border-hairline rounded bg-canvas focus:outline-none focus:ring-1 focus:ring-primary/30"
              onChange={e => {
                const v = parseFloat(e.target.value) || 0;
                setPendingAdd(prev => prev.map(x => (x.type === p.type && x.id === p.id) ? { ...x, extraPrice: v } : x));
              }}
            />
          </label>
          <button type="button" onClick={() => setPendingAdd(prev => prev.filter(x => !(x.type === p.type && x.id === p.id)))}
            className="text-xs text-muted hover:text-error w-5 h-5 grid place-items-center rounded hover:bg-red-50">×</button>
        </div>
      );
    }

    return <div className="flex flex-col gap-0.5">{nodes}</div>;
  }

  // ── Picker tree rendering ──────────────────────────────────────────────────
  function renderPicker() {
    const { titleIds, svcIds, varIds } = effective();

    function filterTree(term: string) {
      const tl = term.toLowerCase();
      const filterSvcs = (svcs: ServiceResponse[], parentMatch: boolean): ServiceResponse[] =>
        svcs.map(svc => {
          if (parentMatch || svc.name.toLowerCase().includes(tl)) return svc;
          const vars = svc.variations?.filter(v => v.name.toLowerCase().includes(tl)) ?? [];
          return vars.length ? { ...svc, variations: vars, _expand: true } as ServiceResponse : null!;
        }).filter(Boolean);

      return {
        titles: titles.map(t => {
          const tm = t.name.toLowerCase().includes(tl);
          const svcs = filterSvcs(t.services ?? [], tm);
          return (tm || svcs.length) ? { ...t, services: svcs } : null!;
        }).filter(Boolean),
        uncategorised: filterSvcs(uncat, false),
      };
    }

    const cat = search ? filterTree(search) : { titles, uncategorised: uncat };

    function SvcRow({ svc, titleDone }: { svc: ServiceResponse; titleDone: boolean }) {
      const hasVars = (svc.variations?.length ?? 0) > 0;
      const svcChecked = titleDone || svcIds.has(svc.id) || (hasVars && svc.variations?.every(v => varIds.has(v.id)));
      const svcPending = pendingAdd.some(p => p.type === "service" && p.id === svc.id);

      if (!hasVars) {
        return (
          <label className={`flex items-center gap-2 pl-5 pr-2 py-1.5 text-sm cursor-pointer hover:bg-surface-soft transition-colors ${svcChecked && !svcPending ? "opacity-60" : ""}`}>
            <input type="checkbox" checked={svcChecked} disabled={titleDone}
              className="accent-primary"
              onChange={e => onPickerCheck("service", svc.id, e.target.checked)} />
            <span className="flex-1 text-ink">{svc.name}</span>
            <span className="text-xs text-muted">{svc.duration_minutes}min · ${parseFloat((svc.price ?? "0") as string).toFixed(2)}</span>
          </label>
        );
      }

      const isOpen = (svc as ServiceResponse & { _expand?: boolean })._expand || expandedSvcs.has(svc.id);
      return (
        <div>
          <div className="flex items-center gap-2 pl-5 pr-2 py-1.5 text-sm">
            <button type="button" onClick={() => setExpandedSvcs(prev => { const n = new Set(prev); n.has(svc.id) ? n.delete(svc.id) : n.add(svc.id); return n; })}
              className={`text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <input type="checkbox" checked={svcChecked} disabled={titleDone} className="accent-primary"
              onChange={e => onPickerCheck("service", svc.id, e.target.checked)} />
            <span className="flex-1 text-ink cursor-pointer" onClick={() => setExpandedSvcs(prev => { const n = new Set(prev); n.has(svc.id) ? n.delete(svc.id) : n.add(svc.id); return n; })}>{svc.name}</span>
            <span className="text-xs text-muted">{svc.variations?.length} variation{svc.variations?.length !== 1 ? "s" : ""}</span>
          </div>
          {isOpen && svc.variations?.map(v => {
            const vChecked = titleDone || svcChecked || varIds.has(v.id);
            return (
              <label key={v.id} className={`flex items-center gap-2 pl-10 pr-2 py-1 text-xs cursor-pointer hover:bg-surface-soft transition-colors ${vChecked && !pendingAdd.some(p => p.type === "variation" && p.id === v.id) ? "opacity-60" : ""}`}>
                <input type="checkbox" checked={vChecked} disabled={titleDone || svcIds.has(svc.id)} className="accent-primary"
                  onChange={e => onPickerCheck("variation", v.id, e.target.checked)} />
                <span className="flex-1 text-ink">{v.name}</span>
                <span className="text-muted">{v.duration_minutes}min · ${parseFloat(v.price as string).toFixed(2)}</span>
              </label>
            );
          })}
        </div>
      );
    }

    function Section({ titleId, name, svcs }: { titleId: number | null; name: string; svcs: ServiceResponse[] }) {
      const titleDone    = titleId != null && titleIds.has(titleId);
      const titleChecked = titleDone || (titleId != null && svcs.length > 0 && svcs.every(svc => {
        const hasVars = (svc.variations?.length ?? 0) > 0;
        return svcIds.has(svc.id) || (hasVars && svc.variations?.every(v => varIds.has(v.id)));
      }));
      return (
        <div className={`border-b border-hairline last:border-0 ${titleChecked ? "opacity-70" : ""}`}>
          <div className="flex items-center gap-2 px-2 py-2">
            {titleId != null && (
              <input type="checkbox" checked={titleChecked} className="accent-primary"
                onChange={e => onPickerCheck("title", titleId!, e.target.checked)} />
            )}
            <span className="text-xs font-semibold text-ink">{name}</span>
          </div>
          {svcs.map(svc => <SvcRow key={svc.id} svc={svc} titleDone={titleDone} />)}
        </div>
      );
    }

    return (
      <div className="border border-hairline rounded-lg overflow-hidden mt-3">
        {/* Picker header */}
        <div className="flex items-center justify-between px-3 py-2 bg-surface-soft border-b border-hairline">
          <span className="text-xs font-semibold text-ink">Select services</span>
          <button onClick={() => { setPickerOpen(false); setSearch(""); }} className="text-muted hover:text-ink text-sm">×</button>
        </div>
        {/* Search */}
        <div className="px-2 py-1.5 border-b border-hairline">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search services…"
            className="w-full h-7 px-2 text-xs border border-hairline rounded bg-canvas focus:outline-none focus:ring-1 focus:ring-primary/30" />
        </div>
        {/* Tree */}
        <div className="max-h-64 overflow-y-auto">
          {cat.uncategorised.length > 0 && <Section key="uncat" titleId={null} name="Uncategorised" svcs={cat.uncategorised} />}
          {cat.titles.map(t => <Section key={t.id} titleId={t.id} name={t.name} svcs={t.services ?? []} />)}
          {cat.titles.length === 0 && cat.uncategorised.length === 0 && (
            <p className="text-xs text-muted px-3 py-3">{search ? "No services match your search." : "No services in catalogue."}</p>
          )}
        </div>
      </div>
    );
  }

  if (capsLoading) return <p className="text-sm text-muted py-2">Loading…</p>;

  return (
    <div>
      {toast && <p className="text-xs text-success mb-2">{toast}</p>}
      {err && <p className="text-xs text-error bg-red-50 border border-red-200 rounded px-2 py-1 mb-2">{err}</p>}

      {/* Assigned list */}
      {renderList()}

      {/* Add button */}
      {canEdit && !pickerOpen && (
        <button onClick={() => setPickerOpen(true)} className="text-xs text-primary hover:underline mt-2">
          + Add service
        </button>
      )}

      {/* Picker */}
      {canEdit && pickerOpen && renderPicker()}

      {/* Save / Discard footer */}
      {canEdit && hasPending && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-hairline">
          <button onClick={handleSave} disabled={saving}
            className="h-7 px-3 bg-primary hover:bg-primary-hover text-white text-xs font-medium rounded disabled:opacity-60 transition-colors">
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button onClick={handleDiscard} disabled={saving}
            className="h-7 px-3 border border-hairline text-xs text-ink rounded hover:bg-surface-soft transition-colors">
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
