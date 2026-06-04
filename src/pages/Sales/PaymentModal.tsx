import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { salesApi } from "./api";
import { money, balanceDue } from "./format";
import { formatApiError } from "../../lib/errors";
import { PAY_METHOD_LABELS } from "./types";
import type { Sale, ApiError } from "./types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  sale: Sale;
  onClose: () => void;
  onDone: (s: Sale) => void;
}

export function PaymentModal({ sale, onClose, onDone }: Props) {
  const due = balanceDue(sale);
  const [amount, setAmount] = useState(due > 0 ? due.toFixed(2) : "");
  const [tip, setTip] = useState("0");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => {
      const a = parseFloat(amount);
      const t = parseFloat(tip) || 0;
      return salesApi.recordPayment(sale.id, {
        amount: Number.isFinite(a) ? a : 0,
        method,
        tip_amount: t,
        note: note.trim() || null,
      });
    },
    onSuccess: onDone,
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not record the payment.")),
  });

  function submit() {
    setErr(null);
    const a = parseFloat(amount);
    const t = parseFloat(tip) || 0;
    if (!(a >= 0) && !(t > 0)) { setErr("Enter an amount."); return; }
    if (a < 0 || t < 0) { setErr("Amounts cannot be negative."); return; }
    mut.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-canvas">
        <DialogHeader><DialogTitle>Take payment</DialogTitle></DialogHeader>

        <div className="text-sm text-muted">
          Balance due <span className="font-semibold text-ink">{money(due, sale.currency)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pay-amount">Amount</Label>
            <Input id="pay-amount" type="number" min="0" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-tip">Tip</Label>
            <Input id="pay-tip" type="number" min="0" step="0.01" value={tip}
              onChange={(e) => setTip(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label>Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PAY_METHOD_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pay-note">Note <span className="text-muted font-normal">(optional)</span></Label>
          <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mut.isPending}>
            {mut.isPending ? "Recording…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
