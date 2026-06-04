import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { bundlesApi } from "./api";
import { money } from "./format";
import { cn } from "../../lib/utils";
import { formatApiError } from "../../lib/errors";
import type { components } from "../../api/schema";
import type { Bundle, ApiError } from "./types";
import type { CatalogRefs } from "./refs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

type S = components["schemas"];
type Kind = "combo" | "package";
type CreditKind = "sessions" | "value";

interface Props {
  agentId: number;
  currency: string;
  bundle: Bundle | null; // null = create
  refs: CatalogRefs;
  onClose: () => void;
}

interface ItemRow { key: string; qty: string; }

/** One selectable bundle target — a flat service, or a specific variation. */
interface ItemOption { key: string; label: string; service_id?: number; variation_id?: number; }

export function BundleEditorModal({ agentId, currency, bundle, refs, onClose }: Props) {
  const editing = !!bundle;
  const qc = useQueryClient();

  const [kind, setKind] = useState<Kind>(bundle?.kind ?? "combo");
  const [name, setName] = useState(bundle?.name ?? "");
  const [price, setPrice] = useState(bundle ? String(bundle.price) : "");
  const [creditKind, setCreditKind] = useState<CreditKind>((bundle?.credit_kind as CreditKind) ?? "sessions");
  const [creditValue, setCreditValue] = useState(bundle?.credit_value != null ? String(bundle.credit_value) : "");
  const [expiresDays, setExpiresDays] = useState(bundle?.expires_days != null ? String(bundle.expires_days) : "");
  const [active, setActive] = useState(bundle?.active ?? true);
  const [items, setItems] = useState<ItemRow[]>([{ key: "", qty: "1" }]);
  const [err, setErr] = useState<string | null>(null);

  const itemOptions = useMemo<ItemOption[]>(() => {
    const out: ItemOption[] = [];
    for (const s of refs.serviceOptions) {
      const vars = s.variations.filter(v => v.active);
      if (vars.length) for (const v of vars) out.push({ key: `v${v.id}`, label: `${s.name} · ${v.name}`, variation_id: v.id });
      else out.push({ key: `s${s.id}`, label: s.name, service_id: s.id });
    }
    return out;
  }, [refs.serviceOptions]);

  const needsItems = kind === "combo" || (kind === "package" && creditKind === "sessions");
  const needsCreditValue = kind === "package" && creditKind === "value";

  const save = useMutation({
    mutationFn: () => {
      if (editing) {
        const body: S["BundleUpdate"] = {
          name: name.trim(),
          price: parseFloat(price),
          active,
          ...(bundle!.kind === "package" && bundle!.credit_kind === "value" ? { credit_value: creditValue ? parseFloat(creditValue) : null } : {}),
          expires_days: expiresDays ? Number(expiresDays) : null,
        };
        return bundlesApi.update(bundle!.id, body);
      }
      const mapped = items
        .filter(r => r.key)
        .map(r => {
          const opt = itemOptions.find(o => o.key === r.key)!;
          return { service_id: opt.service_id ?? null, variation_id: opt.variation_id ?? null, qty: Math.max(1, Number(r.qty) || 1) };
        });
      const body: S["BundleCreate"] = {
        kind, name: name.trim(), price: parseFloat(price), active,
        items: needsItems ? mapped : [],
        credit_kind: kind === "package" ? creditKind : null,
        credit_value: needsCreditValue ? parseFloat(creditValue) : null,
        expires_days: expiresDays ? Number(expiresDays) : null,
      };
      return bundlesApi.create(agentId, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-bundles", agentId] });
      onClose();
    },
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not save.")),
  });

  const del = useMutation({
    mutationFn: () => bundlesApi.delete(bundle!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-bundles", agentId] });
      onClose();
    },
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not delete.")),
  });

  function submit() {
    setErr(null);
    if (!name.trim()) { setErr("Give it a name."); return; }
    if (!(parseFloat(price) >= 0)) { setErr("Enter a valid price."); return; }
    if (!editing) {
      if (needsItems && !items.some(r => r.key)) { setErr(kind === "combo" ? "A combo needs at least one service." : "Pick the service this package is for."); return; }
      if (needsCreditValue && !(parseFloat(creditValue) > 0)) { setErr("Enter the wallet value."); return; }
    } else if (bundle!.kind === "package" && bundle!.credit_kind === "value" && !(parseFloat(creditValue) > 0)) {
      setErr("Enter the wallet value."); return;
    }
    save.mutate();
  }

  const busy = save.isPending || del.isPending;
  const setItem = (i: number, patch: Partial<ItemRow>) => setItems(rows => rows.map((r, j) => j === i ? { ...r, ...patch } : r));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-canvas max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? `Edit ${bundle!.kind}` : "New package or combo"}</DialogTitle></DialogHeader>

        <div className="grid gap-3">
          {/* Kind — locked once created */}
          {!editing && (
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <div className="inline-flex rounded-md border border-hairline p-0.5 bg-surface-soft self-start">
                {(["combo", "package"] as Kind[]).map(k => (
                  <button key={k} type="button" onClick={() => setKind(k)}
                    className={cn("px-3 py-1 text-sm font-medium rounded capitalize transition-colors",
                      kind === k ? "bg-canvas text-ink shadow-sm" : "text-muted hover:text-ink")}>
                    {k}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">
                {kind === "combo"
                  ? "Several services sold together at one bundled price."
                  : "Prepaid sessions of a service, or a value wallet the customer draws down."}
              </p>
            </div>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="b-name">Name</Label>
              <Input id="b-name" value={name} onChange={e => setName(e.target.value)} placeholder={kind === "combo" ? "Cut + Colour" : "10-session pass"} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="b-price">Price</Label>
              <Input id="b-price" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className="w-32" />
            </div>
          </div>

          {/* Package credit kind — locked once created */}
          {kind === "package" && !editing && (
            <div className="grid gap-1.5">
              <Label>Grants</Label>
              <Select value={creditKind} onValueChange={(v) => setCreditKind(v as CreditKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sessions">Prepaid sessions of a service</SelectItem>
                  <SelectItem value="value">A value wallet (spend on anything)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Value wallet amount */}
          {((kind === "package" && !editing && creditKind === "value") ||
            (editing && bundle!.kind === "package" && bundle!.credit_kind === "value")) && (
            <div className="grid gap-1.5">
              <Label htmlFor="b-cv">Wallet value</Label>
              <Input id="b-cv" type="number" min="0" step="0.01" value={creditValue} onChange={e => setCreditValue(e.target.value)} className="w-40" />
              <p className="text-xs text-muted">How much credit the customer can spend (often more than the price, as a bonus).</p>
            </div>
          )}

          {/* Item rows — create only (items are immutable after creation) */}
          {!editing && needsItems && (
            <div className="grid gap-2">
              <Label>{kind === "combo" ? "Services in this combo" : "Service & number of sessions"}</Label>
              {items.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={row.key} onValueChange={(v) => setItem(i, { key: v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select a service…" /></SelectTrigger>
                    <SelectContent>
                      {itemOptions.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" min="1" step="1" value={row.qty} onChange={e => setItem(i, { qty: e.target.value })}
                    className="w-20" title={kind === "package" ? "Sessions" : "Quantity"} />
                  {items.length > 1 && (
                    <button type="button" onClick={() => setItems(rows => rows.filter((_, j) => j !== i))}
                      className="text-muted hover:text-error p-1"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
              {kind === "combo" && (
                <Button type="button" variant="outline" size="sm" className="self-start gap-1.5"
                  onClick={() => setItems(rows => [...rows, { key: "", qty: "1" }])}>
                  <Plus className="h-3.5 w-3.5" /> Add service
                </Button>
              )}
            </div>
          )}

          {/* Items read-only when editing */}
          {editing && (bundle!.items?.length ?? 0) > 0 && (
            <div className="grid gap-1.5">
              <Label>Includes <span className="text-muted font-normal">(fixed — recreate to change)</span></Label>
              <ul className="text-sm text-ink rounded-lg border border-hairline divide-y divide-hairline">
                {bundle!.items.map(it => (
                  <li key={it.id} className="flex justify-between px-3 py-2">
                    <span>{it.variation_id ? refs.variationName(it.variation_id) : refs.serviceName(it.service_id)}</span>
                    <span className="text-muted">×{it.qty}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {kind === "package" && (
            <div className="grid gap-1.5">
              <Label htmlFor="b-exp">Expires after <span className="text-muted font-normal">(optional, days)</span></Label>
              <Input id="b-exp" type="number" min="1" step="1" value={expiresDays} onChange={e => setExpiresDays(e.target.value)} className="w-40" placeholder="Never" />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-ink select-none">
            <input type="checkbox" className="accent-primary h-4 w-4" checked={active} onChange={e => setActive(e.target.checked)} />
            Active (available to sell)
          </label>

          {price && <p className="text-xs text-muted">Sells for {money(parseFloat(price) || 0, currency)}.</p>}
        </div>

        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

        <DialogFooter className={cn(editing && "sm:justify-between")}>
          {editing && (
            <Button variant="ghost" className="text-error hover:text-error hover:bg-red-50"
              onClick={() => { if (confirm("Delete this item? Past sales are unaffected.")) del.mutate(); }} disabled={busy}>
              Delete
            </Button>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{save.isPending ? "Saving…" : editing ? "Save changes" : "Create"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
