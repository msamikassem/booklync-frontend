import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { discountsApi } from "./api";
import { money, num, fmtDate } from "./format";
import { cn } from "../../lib/utils";
import type { Discount } from "./types";
import { DiscountEditorModal } from "./DiscountEditorModal";
import { Button } from "@/components/ui/button";
import { Plus, Tag, Ticket } from "lucide-react";

interface Props { agentId: number; currency: string; }

export function DiscountsTab({ agentId, currency }: Props) {
  const [editing, setEditing] = useState<Discount | null | "new">(null);

  const { data: discounts = [], isLoading, isError } = useQuery({
    queryKey: ["fin-discounts", agentId],
    queryFn: () => discountsApi.list(agentId, false),
    staleTime: 30 * 1000,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-muted max-w-xl">
          Reusable discounts your team can apply at checkout — a manual discount (no code) or a promo code customers can enter.
        </p>
        <Button onClick={() => setEditing("new")} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> New discount
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted py-8 text-center">Loading discounts…</p>}
      {isError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">Could not load discounts.</div>}

      {!isLoading && !isError && discounts.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center max-w-2xl">
          <Tag className="h-8 w-8 text-muted mx-auto mb-3" />
          <p className="font-semibold text-ink mb-1">No discounts yet</p>
          <p className="text-sm text-muted">Create a discount to make it available at checkout.</p>
        </div>
      )}

      {discounts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {discounts.map(d => (
            <button key={d.id} onClick={() => setEditing(d)}
              className={cn(
                "text-left rounded-xl border bg-canvas p-4 transition-colors hover:border-primary/40 hover:shadow-sm",
                d.active ? "border-hairline" : "border-hairline opacity-60",
              )}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="font-semibold text-ink leading-tight">{d.name}</div>
                <span className={cn(
                  "shrink-0 text-[10px] font-medium uppercase tracking-wide rounded-full px-2 py-0.5",
                  d.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500",
                )}>{d.active ? "Active" : "Inactive"}</span>
              </div>
              <div className="text-2xl font-semibold text-ink tabular-nums mb-2">
                {d.type === "percent" ? `${num(d.value)}%` : money(d.value, currency)}
                <span className="text-xs font-normal text-muted ml-1.5">
                  off {d.scope === "line" ? "each line" : "the order"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs text-muted">
                {d.code && (
                  <span className="inline-flex items-center gap-1 rounded bg-surface-soft border border-hairline px-1.5 py-0.5 font-medium text-ink">
                    <Ticket className="h-3 w-3" /> {d.code}
                  </span>
                )}
                {(d.valid_from || d.valid_to) && (
                  <span className="rounded bg-surface-soft px-1.5 py-0.5">
                    {d.valid_from ? fmtDate(d.valid_from) : "—"} → {d.valid_to ? fmtDate(d.valid_to) : "—"}
                  </span>
                )}
                {d.max_uses != null && <span className="rounded bg-surface-soft px-1.5 py-0.5">Max {d.max_uses} uses</span>}
                {d.per_customer_limit != null && <span className="rounded bg-surface-soft px-1.5 py-0.5">{d.per_customer_limit}/customer</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing !== null && (
        <DiscountEditorModal
          agentId={agentId}
          discount={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
