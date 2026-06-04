import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { salesApi } from "./api";
import { money } from "./format";
import { formatApiError } from "../../lib/errors";
import type { Bundle, Sale, ApiError } from "./types";
import { CustomerPicker, type PickedCustomer } from "./CustomerPicker";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Props {
  agentId: number;
  currency: string;
  bundle: Bundle; // a package
  onClose: () => void;
  onSold: (sale: Sale) => void;
}

/** Sell a prepaid package. The credit is granted only once the sale is PAID. */
export function PackageSaleModal({ agentId, currency, bundle, onClose, onSold }: Props) {
  const qc = useQueryClient();
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sell = useMutation({
    mutationFn: () => salesApi.createPackage(agentId, { bundle_id: bundle.id, customer_id: customer!.id }),
    onSuccess: (sale) => {
      qc.invalidateQueries({ queryKey: ["fin-sales", agentId] });
      onSold(sale);
    },
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not sell the package.")),
  });

  function submit() {
    setErr(null);
    if (!customer) { setErr("Pick the customer this package is for."); return; }
    sell.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-canvas">
        <DialogHeader><DialogTitle>Sell “{bundle.name}”</DialogTitle></DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Customer</Label>
            <CustomerPicker value={customer} onSelect={setCustomer} />
          </div>
          <p className="text-xs text-muted">
            Creates a {money(bundle.price, currency)} sale. The prepaid credit is added to the customer’s account once the sale is paid.
          </p>
        </div>

        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sell.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={sell.isPending}>{sell.isPending ? "Selling…" : "Sell package"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
