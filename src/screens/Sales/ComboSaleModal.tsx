import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { salesApi } from "./api";
import { money } from "./format";
import { formatApiError } from "../../lib/errors";
import type { Bundle, Sale, ApiError } from "./types";
import type { CatalogRefs } from "./refs";
import { CustomerPicker, type PickedCustomer } from "./CustomerPicker";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  agentId: number;
  currency: string;
  bundle: Bundle; // a combo
  refs: CatalogRefs;
  onClose: () => void;
  onSold: (sale: Sale) => void;
}

/** Ring up a combo at the till (no appointments) — one sale, employee per line. */
export function ComboSaleModal({ agentId, currency, bundle, refs, onClose, onSold }: Props) {
  const qc = useQueryClient();
  // The backend matches assignments positionally to the bundle's items ORDERED BY
  // ID — so sort here and drive both the selects and the payload off that order.
  const orderedItems = useMemo(() => [...bundle.items].sort((a, b) => a.id - b.id), [bundle.items]);
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [assignees, setAssignees] = useState<string[]>(() => orderedItems.map(() => ""));
  const [err, setErr] = useState<string | null>(null);

  const sell = useMutation({
    mutationFn: () => salesApi.createCombo(agentId, {
      bundle_id: bundle.id,
      customer_id: customer ? customer.id : null,
      assignments: orderedItems.map((_, i) => ({ employee_id: assignees[i] ? Number(assignees[i]) : null })),
    }),
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ["fin-sales", agentId] });
      onSold(sale);
    },
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not ring up the combo.")),
  });

  const setAssignee = (i: number, v: string) => setAssignees(a => a.map((x, j) => j === i ? v : x));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-canvas max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Ring up “{bundle.name}”</DialogTitle></DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Customer <span className="text-muted font-normal">(optional — leave blank for a walk-in)</span></Label>
            <CustomerPicker value={customer} onSelect={setCustomer} />
          </div>

          <div className="grid gap-2">
            <Label>Who performed each service <span className="text-muted font-normal">(for commission)</span></Label>
            {orderedItems.map((it, i) => (
              <div key={it.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm text-ink">
                  {it.variation_id ? refs.variationName(it.variation_id) : refs.serviceName(it.service_id)}
                  {it.qty > 1 && <span className="text-muted"> ×{it.qty}</span>}
                </span>
                <Select value={assignees[i] || "none"} onValueChange={(v) => setAssignee(i, v === "none" ? "" : v)}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {refs.bookableEmployees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted">Creates a {money(bundle.price, currency)} sale you can take payment on next.</p>
        </div>

        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sell.isPending}>Cancel</Button>
          <Button onClick={() => { setErr(null); sell.mutate(); }} disabled={sell.isPending}>{sell.isPending ? "Ringing up…" : "Ring up"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
