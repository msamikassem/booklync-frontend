import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { salesApi, creditsApi } from "./api";
import { money, num } from "./format";
import { formatApiError } from "../../lib/errors";
import { cn } from "../../lib/utils";
import type { Sale, PackageCredit, ApiError } from "./types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  sale: Sale;
  agentId: number;
  lineId: number;
  onClose: () => void;
  onDone: (s: Sale) => void;
}

function creditLabel(c: PackageCredit): string {
  if (c.kind === "value") return `Wallet · ${money(c.balance, c.currency)} left`;
  return `${num(c.remaining_qty)} session${num(c.remaining_qty) === 1 ? "" : "s"} left`;
}

export function RedeemModal({ sale, agentId, lineId, onClose, onDone }: Props) {
  const line = (sale.line_items ?? []).find(l => l.id === lineId);
  const [picked, setPicked] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: credits = [], isLoading } = useQuery({
    queryKey: ["credits", agentId, sale.customer_id],
    queryFn: () => creditsApi.list(agentId, { customerId: sale.customer_id! }),
    enabled: sale.customer_id != null,
    staleTime: 30 * 1000,
  });

  // Sessions credits must match this line's service/variation; value wallets fit anything.
  const usable = credits.filter(c => {
    if (!c.active) return false;
    if (c.kind === "value") return num(c.balance) > 0;
    if (num(c.remaining_qty) <= 0) return false;
    if (c.variation_id) return c.variation_id === line?.variation_id;
    if (c.service_id) return c.service_id === line?.service_id;
    return false;
  });

  const mut = useMutation({
    mutationFn: (creditId: number) => salesApi.redeem(sale.id, { credit_id: creditId, sale_line_item_id: lineId }),
    onSuccess: onDone,
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not redeem the credit.")),
  });

  function submit() {
    setErr(null);
    if (picked == null) { setErr("Select a credit to redeem."); return; }
    mut.mutate(picked);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-canvas">
        <DialogHeader><DialogTitle>Redeem prepaid credit</DialogTitle></DialogHeader>

        <p className="text-sm text-muted">
          Use a prepaid credit toward <span className="font-medium text-ink">{line?.description ?? "this service"}</span>.
          The line becomes free to the customer.
        </p>

        <div className="grid gap-2">
          {isLoading && <p className="text-sm text-muted py-2">Loading credits…</p>}
          {!isLoading && usable.length === 0 && (
            <p className="text-sm text-muted bg-surface-soft rounded-md px-3 py-3">
              No prepaid credit available for this customer that fits this service.
            </p>
          )}
          {usable.map(c => (
            <label key={c.id}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-md border cursor-pointer transition-colors",
                picked === c.id ? "border-primary bg-primary/5" : "border-hairline hover:bg-surface-soft",
              )}>
              <input type="radio" name="redeem-credit" checked={picked === c.id}
                onChange={() => setPicked(c.id)} className="accent-primary" />
              <span className="text-sm text-ink">{creditLabel(c)}</span>
            </label>
          ))}
        </div>

        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mut.isPending || usable.length === 0}>
            {mut.isPending ? "Redeeming…" : "Redeem credit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
