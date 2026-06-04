import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { salesApi } from "./api";
import { money, num, balanceDue, collected, fmtDateTime } from "./format";
import { formatApiError } from "../../lib/errors";
import { cn } from "../../lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  SALE_STATUS_LABELS, SALE_STATUS_BADGE, PAY_METHOD_LABELS,
} from "./types";
import type { Sale, SaleLineItem, SaleDiscount, ApiError } from "./types";
import { PaymentModal } from "./PaymentModal";
import { DiscountModal } from "./DiscountModal";
import { RedeemModal } from "./RedeemModal";
import { Sheet, SheetContent, SheetClose, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface Props {
  saleId: number;
  initialSale: Sale;
  agentId: number;
  custName: string;
  canCheckout: boolean;
  onClose: () => void;
  onSaleChanged: (s: Sale) => void;
}

/** Structural discounts (combo savings / package redemptions) are managed by
 *  their own lifecycle — never removed by hand from the discounts list. */
function discountRemovable(sd: SaleDiscount): boolean {
  if (!sd.name) return true;
  if (sd.name === "Package redemption") return false;
  if (sd.name.startsWith("Combo: ")) return false;
  return true;
}

export function SaleDrawer({ saleId, initialSale, agentId, custName, canCheckout, onClose, onSaleChanged }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState<"pay" | "disc" | null>(null);
  const [redeemLineId, setRedeemLineId] = useState<number | null>(null);

  const { data: sale = initialSale } = useQuery({
    queryKey: ["fin-sale", saleId],
    queryFn: () => salesApi.get(saleId),
    initialData: initialSale,
    staleTime: 0,
  });

  const cur = sale.currency;
  const mutable = sale.status === "open" || sale.status === "partially_paid";
  const due = balanceDue(sale);
  const paid = collected(sale);

  function applyUpdate(updated: Sale, opts?: { credits?: boolean }) {
    qc.setQueryData(["fin-sale", saleId], updated);
    qc.invalidateQueries({ queryKey: ["fin-sales", agentId] });
    if (opts?.credits) qc.invalidateQueries({ queryKey: ["credits", agentId] });
    onSaleChanged(updated);
  }

  const removeDisc = useMutation({
    mutationFn: (sdId: number) => salesApi.removeDiscount(saleId, sdId),
    onSuccess: (s) => { applyUpdate(s); toast({ description: "Discount removed." }); },
    onError: (e) => toast({ description: formatApiError((e as { data?: ApiError }).data ?? {}, "Could not remove the discount.") }),
  });

  const undoRedeem = useMutation({
    mutationFn: (lineId: number) => salesApi.undoRedeem(saleId, lineId),
    onSuccess: (s) => { applyUpdate(s, { credits: true }); toast({ description: "Redemption undone." }); },
    onError: (e) => toast({ description: formatApiError((e as { data?: ApiError }).data ?? {}, "Could not undo the redemption.") }),
  });

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" hideClose className="w-[26rem] p-0 flex flex-col">
          {/* Accessible title for the dialog (visually hidden — the styled
              header below is the visible equivalent). Radix requires a title. */}
          <SheetTitle className="sr-only">Receipt #{sale.id}</SheetTitle>
          {/* Header */}
          <div className="flex items-start gap-3 px-5 py-4 border-b border-hairline flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ink">Receipt #{sale.id}</div>
              <div className="text-xs text-muted truncate">{custName} · {fmtDateTime(sale.created_at)}</div>
              <div className="mt-1">
                <Badge className={cn("rounded-full text-[10px] font-medium", SALE_STATUS_BADGE[sale.status] ?? "bg-gray-100 text-gray-600 border-transparent")}>
                  {SALE_STATUS_LABELS[sale.status] ?? sale.status}
                </Badge>
              </div>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" className="text-muted hover:text-ink h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </SheetClose>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
            {/* Items */}
            <Section title="Items">
              {(sale.line_items ?? []).length === 0 && <p className="text-sm text-muted">No line items.</p>}
              {(sale.line_items ?? []).map(li => (
                <LineRow key={li.id} li={li} currency={cur}
                  canCheckout={canCheckout} mutable={mutable} hasCustomer={sale.customer_id != null}
                  onRedeem={() => setRedeemLineId(li.id)}
                  onUndoRedeem={() => undoRedeem.mutate(li.id)}
                  undoing={undoRedeem.isPending} />
              ))}
            </Section>

            {/* Discounts */}
            {(sale.discounts ?? []).length > 0 && (
              <Section title="Discounts">
                {(sale.discounts ?? []).map(sd => {
                  const tag = sd.type === "percent" ? `${num(sd.value)}%` : money(sd.value, cur);
                  return (
                    <div key={sd.id} className="flex items-center justify-between gap-2 text-sm py-0.5">
                      <span className="text-ink min-w-0">
                        {sd.name ?? "Discount"}{sd.code ? ` (${sd.code})` : ""}
                        <span className="text-muted ml-1.5 text-xs">{tag}</span>
                      </span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-success">−{money(sd.amount, cur)}</span>
                        {canCheckout && mutable && discountRemovable(sd) && (
                          <button type="button" aria-label="Remove discount" disabled={removeDisc.isPending}
                            onClick={() => removeDisc.mutate(sd.id)}
                            className="text-muted hover:text-error transition-colors disabled:opacity-50">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </Section>
            )}

            {/* Totals */}
            <div className="border-t border-hairline pt-3 flex flex-col gap-1.5 text-sm">
              <TotalRow label="Subtotal" value={money(sale.subtotal, cur)} />
              {num(sale.discount_total) > 0 && <TotalRow label="Discounts" value={`−${money(sale.discount_total, cur)}`} />}
              {num(sale.tax_total) > 0 && <TotalRow label="Tax" value={`+${money(sale.tax_total, cur)}`} />}
              {num(sale.tip_total) > 0 && <TotalRow label="Tips" value={`+${money(sale.tip_total, cur)}`} />}
              <TotalRow label="Total" value={money(sale.total, cur)} strong />
              {paid > 0 && <TotalRow label="Paid" value={money(paid, cur)} muted />}
              {due > 0 && sale.status !== "void" && <TotalRow label="Balance due" value={money(due, cur)} due />}
            </div>

            {/* Payments */}
            {(sale.payments ?? []).length > 0 && (
              <Section title="Payments">
                {(sale.payments ?? []).map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm py-0.5">
                    <span className="text-muted">{PAY_METHOD_LABELS[p.method] ?? p.method} · {fmtDateTime(p.paid_at)}</span>
                    <span className="text-ink">
                      {money(p.amount, cur)}
                      {num(p.tip_amount) > 0 && <span className="text-muted text-xs ml-1">+{money(p.tip_amount, cur)} tip</span>}
                    </span>
                  </div>
                ))}
              </Section>
            )}

            {sale.note && (
              <div className="text-sm text-ink bg-surface-soft rounded-md px-3 py-2">{sale.note}</div>
            )}
          </div>

          {/* Actions */}
          {canCheckout && mutable && (
            <div className="flex gap-2 px-5 py-4 border-t border-hairline flex-shrink-0">
              <Button variant="outline" className="flex-1" onClick={() => setModal("disc")}>Apply discount</Button>
              {due > 0 && <Button className="flex-1" onClick={() => setModal("pay")}>Take payment</Button>}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {modal === "pay" && (
        <PaymentModal sale={sale} onClose={() => setModal(null)}
          onDone={(s) => { applyUpdate(s, { credits: true }); setModal(null); toast({ description: "Payment recorded." }); }} />
      )}
      {modal === "disc" && (
        <DiscountModal sale={sale} agentId={agentId} onClose={() => setModal(null)}
          onDone={(s) => { applyUpdate(s); setModal(null); toast({ description: "Discount applied." }); }} />
      )}
      {redeemLineId != null && (
        <RedeemModal sale={sale} agentId={agentId} lineId={redeemLineId} onClose={() => setRedeemLineId(null)}
          onDone={(s) => { applyUpdate(s, { credits: true }); setRedeemLineId(null); toast({ description: "Credit redeemed." }); }} />
      )}
    </>
  );
}

// ── Small presentational helpers ──────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{title}</div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function TotalRow({ label, value, strong, muted, due }: { label: string; value: string; strong?: boolean; muted?: boolean; due?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between",
      strong && "font-semibold text-ink text-base pt-1",
      muted && "text-muted",
      due && "text-primary font-semibold",
      !strong && !muted && !due && "text-ink")}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function LineRow({ li, currency, canCheckout, mutable, hasCustomer, onRedeem, onUndoRedeem, undoing }: {
  li: SaleLineItem; currency: string; canCheckout: boolean; mutable: boolean; hasCustomer: boolean;
  onRedeem: () => void; onUndoRedeem: () => void; undoing: boolean;
}) {
  const isFree = li.redeemed_credit_id != null;
  const meta: string[] = [];
  if (li.employee_name) meta.push(li.employee_name);
  meta.push(`${num(li.qty)} × ${money(li.unit_price, currency)}`);
  if (num(li.surcharge) > 0) meta.push(`+${money(li.surcharge, currency)} surcharge`);
  const breakdown: string[] = [];
  if (num(li.discount_amount) > 0) breakdown.push(`−${money(li.discount_amount, currency)} disc`);
  if (num(li.tax_amount) > 0) breakdown.push(`+${money(li.tax_amount, currency)} tax`);

  let action: React.ReactNode = null;
  if (canCheckout && mutable && hasCustomer) {
    if (isFree) {
      action = <button type="button" disabled={undoing} onClick={onUndoRedeem}
        className="text-xs text-primary hover:underline disabled:opacity-50 mt-0.5 text-left">Undo redeem</button>;
    } else if (li.kind === "service") {
      action = <button type="button" onClick={onRedeem}
        className="text-xs text-primary hover:underline mt-0.5 text-left">Redeem credit</button>;
    }
  }

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm text-ink flex items-center gap-1.5">
          {li.description ?? "Item"}
          {isFree && <span className="text-[10px] font-medium uppercase tracking-wide bg-accent-brand/10 text-accent-brand px-1.5 py-px rounded">Prepaid</span>}
        </div>
        <div className="text-xs text-muted">
          {meta.join(" · ")}{breakdown.length > 0 && ` — ${breakdown.join(" · ")}`}
        </div>
        {action}
      </div>
      <div className="text-sm text-ink flex-shrink-0">{money(li.line_total, currency)}</div>
    </div>
  );
}
