import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { discountsApi } from "./api";
import { formatApiError } from "../../lib/errors";
import { cn } from "../../lib/utils";
import type { components } from "../../api/schema";
import type { Discount, ApiError } from "./types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type S = components["schemas"];

interface Props {
  agentId: number;
  discount: Discount | null; // null = create
  onClose: () => void;
}

/** ISO datetime → "YYYY-MM-DD" for a date input (first 10 chars). */
const toDateInput = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");
/** "YYYY-MM-DD" → start/end-of-day ISO datetime, or null when blank. */
const fromDateStart = (d: string) => (d ? d + "T00:00:00" : null);
const fromDateEnd = (d: string) => (d ? d + "T23:59:59" : null);

export function DiscountEditorModal({ agentId, discount, onClose }: Props) {
  const editing = !!discount;
  const qc = useQueryClient();
  const [name, setName] = useState(discount?.name ?? "");
  const [type, setType] = useState<S["DiscountTypeEnum"]>(discount?.type ?? "percent");
  const [value, setValue] = useState(discount ? String(discount.value) : "");
  const [scope, setScope] = useState<S["DiscountScopeEnum"]>(discount?.scope ?? "order");
  const [code, setCode] = useState(discount?.code ?? "");
  const [validFrom, setValidFrom] = useState(toDateInput(discount?.valid_from));
  const [validTo, setValidTo] = useState(toDateInput(discount?.valid_to));
  const [maxUses, setMaxUses] = useState(discount?.max_uses != null ? String(discount.max_uses) : "");
  const [perCustomer, setPerCustomer] = useState(discount?.per_customer_limit != null ? String(discount.per_customer_limit) : "");
  const [active, setActive] = useState(discount?.active ?? true);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      // Typed as the stricter Create shape (structurally assignable to Update too),
      // so the compiler validates every field name/type rather than trusting a cast.
      const common: S["DiscountCreate"] = {
        name: name.trim(),
        type, value: parseFloat(value), scope,
        code: code.trim() || null,
        valid_from: fromDateStart(validFrom),
        valid_to: fromDateEnd(validTo),
        max_uses: maxUses ? Number(maxUses) : null,
        per_customer_limit: perCustomer ? Number(perCustomer) : null,
        active,
      };
      return editing
        ? discountsApi.update(discount!.id, common)
        : discountsApi.create(agentId, common);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-discounts", agentId] });
      qc.invalidateQueries({ queryKey: ["fin-discount-catalogue", agentId] });
      onClose();
    },
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not save the discount.")),
  });

  const del = useMutation({
    mutationFn: () => discountsApi.delete(discount!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-discounts", agentId] });
      qc.invalidateQueries({ queryKey: ["fin-discount-catalogue", agentId] });
      onClose();
    },
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not delete the discount.")),
  });

  function submit() {
    setErr(null);
    if (!name.trim()) { setErr("Give the discount a name."); return; }
    const v = parseFloat(value);
    if (!(v > 0)) { setErr("Enter a value greater than 0."); return; }
    if (type === "percent" && v > 100) { setErr("A percentage cannot exceed 100."); return; }
    if (validFrom && validTo && validTo < validFrom) { setErr("The end date can't be before the start date."); return; }
    save.mutate();
  }

  const busy = save.isPending || del.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-canvas">
        <DialogHeader><DialogTitle>{editing ? "Edit discount" : "New discount"}</DialogTitle></DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="d-name">Name</Label>
            <Input id="d-name" value={name} onChange={e => setName(e.target.value)} placeholder="Summer special" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as S["DiscountTypeEnum"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="d-value">Value</Label>
              <Input id="d-value" type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Applies to</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as S["DiscountScopeEnum"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="order">Whole order</SelectItem>
                  <SelectItem value="line">Each line</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="d-code">Promo code <span className="text-muted font-normal">(optional — leave blank for a manual discount)</span></Label>
            <Input id="d-code" value={code} onChange={e => setCode(e.target.value)} placeholder="SUMMER10" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="d-from">Valid from <span className="text-muted font-normal">(optional)</span></Label>
              <Input id="d-from" type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="d-to">Valid to <span className="text-muted font-normal">(optional)</span></Label>
              <Input id="d-to" type="date" value={validTo} onChange={e => setValidTo(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="d-max">Max total uses <span className="text-muted font-normal">(optional)</span></Label>
              <Input id="d-max" type="number" min="1" step="1" value={maxUses} onChange={e => setMaxUses(e.target.value)} placeholder="Unlimited" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="d-perc">Per customer limit <span className="text-muted font-normal">(optional)</span></Label>
              <Input id="d-perc" type="number" min="1" step="1" value={perCustomer} onChange={e => setPerCustomer(e.target.value)} placeholder="Unlimited" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink select-none">
            <input type="checkbox" className="accent-primary h-4 w-4" checked={active} onChange={e => setActive(e.target.checked)} />
            Active (available to apply at checkout)
          </label>
        </div>

        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

        <DialogFooter className={cn(editing && "sm:justify-between")}>
          {editing && (
            <Button variant="ghost" className="text-error hover:text-error hover:bg-red-50"
              onClick={() => { if (confirm("Delete this discount? Past sales that used it are unaffected.")) del.mutate(); }}
              disabled={busy}>
              Delete
            </Button>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{save.isPending ? "Saving…" : editing ? "Save changes" : "Create discount"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
