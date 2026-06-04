import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { salesApi, discountsApi } from "./api";
import { money, num } from "./format";
import { formatApiError } from "../../lib/errors";
import { cn } from "../../lib/utils";
import type { Sale, ApiError, ApplyDiscountInput } from "./types";
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
  agentId: number;
  onClose: () => void;
  onDone: (s: Sale) => void;
}

export function DiscountModal({ sale, agentId, onClose, onDone }: Props) {
  const [mode, setMode] = useState<"catalogue" | "custom">("catalogue");
  // catalogue mode
  const [discountId, setDiscountId] = useState("");
  const [code, setCode] = useState("");
  // custom mode
  const [type, setType] = useState("percent");
  const [value, setValue] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState(""); // "" = whole order, else line id
  const [err, setErr] = useState<string | null>(null);

  const { data: catalogue = [], isLoading } = useQuery({
    queryKey: ["fin-discount-catalogue", agentId],
    queryFn: () => discountsApi.list(agentId, true),
    staleTime: 60 * 1000,
  });

  const lineOptions = (sale.line_items ?? []).filter(li => li.kind === "service" || li.kind === "product");

  const mut = useMutation({
    mutationFn: (payload: ApplyDiscountInput) => salesApi.applyDiscount(sale.id, payload),
    onSuccess: onDone,
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not apply the discount.")),
  });

  function submit() {
    setErr(null);
    let payload: ApplyDiscountInput;
    if (mode === "catalogue") {
      if (code.trim()) payload = { code: code.trim() };
      else if (discountId) payload = { discount_id: Number(discountId) };
      else { setErr("Pick a discount or enter a promo code."); return; }
    } else {
      const v = parseFloat(value);
      if (!(v > 0)) { setErr("Enter a value greater than 0."); return; }
      if (type === "percent" && v > 100) { setErr("A percentage cannot exceed 100."); return; }
      payload = { type, value: v, name: name.trim() || null };
      if (scope) payload.sale_line_item_id = Number(scope);
    }
    mut.mutate(payload);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-canvas">
        <DialogHeader><DialogTitle>Apply discount</DialogTitle></DialogHeader>

        {/* Mode toggle */}
        <div className="inline-flex rounded-md border border-hairline p-0.5 bg-surface-soft self-start">
          {(["catalogue", "custom"] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={cn(
                "px-3 py-1 text-sm font-medium rounded transition-colors capitalize",
                mode === m ? "bg-canvas text-ink shadow-sm" : "text-muted hover:text-ink",
              )}>
              {m === "catalogue" ? "From catalogue" : "Custom"}
            </button>
          ))}
        </div>

        {mode === "catalogue" ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Discount</Label>
              <Select value={discountId} onValueChange={(v) => { setDiscountId(v); setCode(""); }}>
                <SelectTrigger><SelectValue placeholder={isLoading ? "Loading…" : "Select a discount…"} /></SelectTrigger>
                <SelectContent>
                  {catalogue.map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name} — {d.type === "percent" ? `${num(d.value)}%` : money(d.value, sale.currency)}
                      {d.code ? ` · ${d.code}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="disc-code">Or enter a promo code</Label>
              <Input id="disc-code" value={code} onChange={(e) => { setCode(e.target.value); if (e.target.value) setDiscountId(""); }}
                placeholder="SUMMER10" />
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="disc-value">Value</Label>
                <Input id="disc-value" type="number" min="0" step="0.01" value={value}
                  onChange={(e) => setValue(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="disc-name">Label <span className="text-muted font-normal">(optional)</span></Label>
              <Input id="disc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Loyalty discount" />
            </div>
            <div className="grid gap-1.5">
              <Label>Applies to</Label>
              <Select value={scope || "order"} onValueChange={(v) => setScope(v === "order" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="order">Whole order</SelectItem>
                  {lineOptions.map(li => (
                    <SelectItem key={li.id} value={String(li.id)}>{li.description ?? "Line"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mut.isPending}>
            {mut.isPending ? "Applying…" : "Apply discount"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
