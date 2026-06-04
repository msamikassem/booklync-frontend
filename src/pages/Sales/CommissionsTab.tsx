import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { commissionApi } from "./api";
import { money, num } from "./format";
import { cn } from "../../lib/utils";
import { useToast } from "@/hooks/use-toast";
import { formatApiError } from "../../lib/errors";
import type { components } from "../../api/schema";
import type { CommissionRule, ApiError } from "./types";
import { useCatalogRefs } from "./refs";
import { CommissionRuleModal } from "./CommissionRuleModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Percent } from "lucide-react";

type S = components["schemas"];

interface Props { agentId: number; currency: string; }

export function CommissionsTab({ agentId, currency }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const refs = useCatalogRefs(agentId);
  const [editing, setEditing] = useState<CommissionRule | null | "new">(null);

  const cfgQ = useQuery({
    queryKey: ["fin-commission-config"],
    queryFn: () => commissionApi.getConfig(),
    staleTime: 60 * 1000,
  });
  const rulesQ = useQuery({
    queryKey: ["fin-commission-rules", agentId],
    queryFn: () => commissionApi.listRules(agentId, false),
    staleTime: 30 * 1000,
  });

  const cfgMut = useMutation({
    mutationFn: (body: S["CommissionConfigUpdate"]) => commissionApi.updateConfig(body),
    onSuccess: (updated) => {
      qc.setQueryData(["fin-commission-config"], updated);
      toast({ description: "Commission policy updated." });
    },
    onError: (e) => toast({ variant: "destructive", description: formatApiError((e as { data?: ApiError }).data ?? {}, "Could not update the policy.") }),
  });

  const cfg = cfgQ.data;

  return (
    <div className="space-y-8">
      {/* Company policy */}
      <section className="bg-canvas rounded-xl border border-hairline p-5 max-w-2xl">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-sm font-semibold text-ink">Commission policy</h3>
          <span className="text-[10px] font-medium uppercase tracking-wide bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">All branches</span>
        </div>
        <p className="text-xs text-muted mb-4">This policy is company-wide — changing it here affects every branch. Tips are always excluded.</p>

        {cfgQ.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {cfg && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium text-ink">Commission is based on</label>
              <Select value={cfg.commission_base} onValueChange={(v) => cfgMut.mutate({ commission_base: v as S["CommissionBaseEnum"] })} disabled={cfgMut.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gross">Gross (before discounts)</SelectItem>
                  <SelectItem value="net">Net (after discounts)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-start gap-2 text-sm text-ink select-none pt-6">
              <input type="checkbox" className="accent-primary h-4 w-4 mt-0.5"
                checked={cfg.commission_includes_surcharge}
                onChange={(e) => cfgMut.mutate({ commission_includes_surcharge: e.target.checked })}
                disabled={cfgMut.isPending} />
              <span>Include surcharges in the commission base</span>
            </label>
          </div>
        )}
      </section>

      {/* Per-branch rules */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Rate rules <span className="text-muted font-normal">· this branch</span></h3>
            <p className="text-xs text-muted">Who earns what. The most specific matching rule wins.</p>
          </div>
          <Button onClick={() => setEditing("new")} className="gap-1.5 shrink-0">
            <Plus className="h-4 w-4" /> New rule
          </Button>
        </div>

        {rulesQ.isLoading && <p className="text-sm text-muted py-8 text-center">Loading rules…</p>}
        {rulesQ.isError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">Could not load commission rules.</div>}

        {rulesQ.data && rulesQ.data.length === 0 && (
          <div className="bg-canvas rounded-xl border border-hairline p-10 text-center max-w-2xl">
            <Percent className="h-8 w-8 text-muted mx-auto mb-3" />
            <p className="font-semibold text-ink mb-1">No commission rules</p>
            <p className="text-sm text-muted">Without a rule, staff earn no commission. Add a branch-wide default or target specific staff and services.</p>
          </div>
        )}

        {rulesQ.data && rulesQ.data.length > 0 && (
          <div className="bg-canvas rounded-xl border border-hairline overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3 pl-5">Employee</th>
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3">Applies to</th>
                  <th className="text-right text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3">Rate</th>
                  <th className="text-right text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3 pr-5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rulesQ.data.map(r => (
                  <tr key={r.id} onClick={() => setEditing(r)}
                    className="border-b border-hairline last:border-0 hover:bg-surface-soft cursor-pointer transition-colors">
                    <td className="px-4 py-3 pl-5 text-ink font-medium">{r.employee_id != null ? refs.employeeName(r.employee_id) : "Any employee"}</td>
                    <td className="px-4 py-3 text-muted">{refs.targetLabel(r)}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink tabular-nums">
                      {r.type === "percent" ? `${num(r.value)}%` : money(r.value, currency)}
                    </td>
                    <td className="px-4 py-3 pr-5 text-right">
                      <Badge className={cn("rounded-full text-[10px] font-medium",
                        r.active ? "bg-green-100 text-green-800 border-transparent" : "bg-gray-100 text-gray-500 border-transparent")}>
                        {r.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing !== null && (
        <CommissionRuleModal
          agentId={agentId}
          rule={editing === "new" ? null : editing}
          refs={refs}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
