import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { agents as agentsApi } from "../../api";
import { num } from "./format";
import { formatApiError } from "../../lib/errors";
import type { AgentResponse, ApiError } from "../../api/types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  agent: AgentResponse;
  onClose: () => void;
  onSaved: (a: AgentResponse) => void;
}

export function TaxCurrencyModal({ agent, onClose, onSaved }: Props) {
  const [currency, setCurrency] = useState(agent.currency || "USD");
  const [rate, setRate] = useState(agent.tax_rate != null ? String(num(agent.tax_rate)) : "");
  const [inclusive, setInclusive] = useState(!!agent.tax_inclusive);
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => agentsApi.update(agent.id, {
      currency: currency.trim().toUpperCase(),
      tax_rate: rate === "" ? null : parseFloat(rate),
      tax_inclusive: inclusive,
    }),
    onSuccess: onSaved,
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not save.")),
  });

  function submit() {
    setErr(null);
    const cur = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) { setErr("Currency must be a 3-letter code (e.g. USD)."); return; }
    const r = rate === "" ? null : parseFloat(rate);
    if (r != null && (r < 0 || r > 100)) { setErr("Tax rate must be between 0 and 100."); return; }
    mut.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-canvas">
        <DialogHeader><DialogTitle>Currency &amp; tax</DialogTitle></DialogHeader>

        <p className="text-sm text-muted">These apply to every sale at this branch. Money is never mixed across branches.</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="tc-currency">Currency (ISO)</Label>
            <Input id="tc-currency" value={currency} maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tc-rate">Tax rate (%)</Label>
            <Input id="tc-rate" type="number" min="0" max="100" step="0.01" value={rate}
              onChange={(e) => setRate(e.target.value)} placeholder="None" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
          <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} className="accent-primary" />
          Prices already include tax (tax-inclusive)
        </label>

        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mut.isPending}>{mut.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
