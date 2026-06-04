import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { bundlesApi } from "./api";
import { fmtTimeTz, money, dateInputValue } from "./format";
import { cn } from "../../lib/utils";
import { useToast } from "@/hooks/use-toast";
import { formatApiError } from "../../lib/errors";
import type { Bundle, ComboOption, Sale, ApiError } from "./types";
import type { CatalogRefs } from "./refs";
import { CustomerPicker, type PickedCustomer } from "./CustomerPicker";
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
  agentId: number;
  tz: string | null;
  currency: string;
  bundle: Bundle;
  refs: CatalogRefs;
  onClose: () => void;
  onBooked: (sale: Sale) => void;
}

export function ComboBookModal({ agentId, tz, currency, bundle, refs, onClose, onBooked }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [date, setDate] = useState(dateInputValue(new Date()));
  const [employeeId, setEmployeeId] = useState(""); // "" = any eligible
  const [chosen, setChosen] = useState<ComboOption | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const availQ = useQuery({
    queryKey: ["fin-combo-avail", bundle.id, date, employeeId],
    queryFn: () => bundlesApi.availability(bundle.id, date, employeeId ? Number(employeeId) : null),
    enabled: !!date,
    staleTime: 0,
  });

  const book = useMutation({
    mutationFn: () => bundlesApi.book({
      bundle_id: bundle.id,
      customer_id: customer!.id,
      employee_id: chosen!.employee_id,
      start_time: chosen!.start_time, // UTC, passed through verbatim
      note: note.trim() || null,
    }),
    onSuccess: (sale) => {
      // A booked combo creates chained appointments + an open combo sale.
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["cal-appointments", agentId] });
      qc.invalidateQueries({ queryKey: ["fin-sales", agentId] });
      toast({ description: "Combo booked." });
      onBooked(sale);
    },
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not book the combo.")),
  });

  function confirm() {
    setErr(null);
    if (!customer) { setErr("Pick a customer."); return; }
    if (!chosen) { setErr("Choose a time slot."); return; }
    book.mutate();
  }

  const avail = availQ.data;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-canvas max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book “{bundle.name}”</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Customer</Label>
            <CustomerPicker value={customer} onSelect={setCustomer} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cb-date">Date</Label>
              <Input id="cb-date" type="date" value={date} onChange={e => { setDate(e.target.value); setChosen(null); }} />
            </div>
            <div className="grid gap-1.5">
              <Label>Staff</Label>
              <Select value={employeeId || "any"} onValueChange={(v) => { setEmployeeId(v === "any" ? "" : v); setChosen(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any eligible</SelectItem>
                  {refs.bookableEmployees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Availability */}
          <div className="grid gap-1.5">
            <Label>Available start times <span className="text-muted font-normal">— one person does the whole combo</span></Label>
            {availQ.isLoading && <p className="text-sm text-muted py-3 text-center">Searching…</p>}
            {availQ.isError && <p className="text-sm text-error">Could not load availability.</p>}
            {avail && avail.options.length === 0 && (
              <p className="text-sm text-muted py-3 text-center border border-dashed border-hairline rounded-lg">
                No back-to-back slots on this day{employeeId ? " for this person" : ""}. Try another date.
              </p>
            )}
            {avail && avail.options.length > 0 && (
              <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto">
                {avail.options.map((opt, i) => {
                  const active = chosen === opt;
                  return (
                    <button key={`${opt.employee_id}-${opt.start_time}-${i}`} type="button" onClick={() => setChosen(opt)}
                      className={cn(
                        "px-3 py-2 rounded-lg border text-left transition-colors",
                        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-hairline hover:border-primary/40",
                      )}>
                      <div className="text-sm font-medium text-ink">{fmtTimeTz(opt.start_time, tz)} – {fmtTimeTz(opt.end_time, tz)}</div>
                      <div className="text-xs text-muted">{opt.employee_name ?? refs.employeeName(opt.employee_id)} · {opt.total_duration_minutes} min</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {chosen && (
            <div className="rounded-lg bg-surface-soft border border-hairline p-3 text-sm">
              <div className="font-medium text-ink mb-1">{fmtTimeTz(chosen.start_time, tz)} with {chosen.employee_name ?? refs.employeeName(chosen.employee_id)}</div>
              <ul className="text-xs text-muted space-y-0.5">
                {chosen.items.map((it, i) => (
                  <li key={i}>{fmtTimeTz(it.start_time, tz)} — {it.variation_name ? `${it.service_name} · ${it.variation_name}` : it.service_name} ({it.duration_minutes} min)</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="cb-note">Note <span className="text-muted font-normal">(optional)</span></Label>
            <Input id="cb-note" value={note} onChange={e => setNote(e.target.value)} />
          </div>

          <p className="text-xs text-muted">Books the appointments and starts a {money(bundle.price, currency)} sale you can take payment on.</p>
        </div>

        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={book.isPending}>Cancel</Button>
          <Button onClick={confirm} disabled={book.isPending || !chosen || !customer}>{book.isPending ? "Booking…" : "Book combo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
