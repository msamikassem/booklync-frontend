import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "./api";
import { money, num, dateInputValue } from "./format";
import { cn } from "../../lib/utils";
import { SALE_STATUS_LABELS } from "./types";
import { Input } from "@/components/ui/input";

interface Props { agentId: number; }

type RangeKey = "month" | "30d" | "year";

function rangeFor(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const to = dateInputValue(now);
  if (key === "month") return { from: dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (key === "year") return { from: dateInputValue(new Date(now.getFullYear(), 0, 1)), to };
  const d = new Date(now); d.setDate(d.getDate() - 29);
  return { from: dateInputValue(d), to };
}

export function ReportsTab({ agentId }: Props) {
  const initial = useMemo(() => rangeFor("month"), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [quick, setQuick] = useState<RangeKey | null>("month");

  const params = {
    agent_id: agentId,
    ...(from ? { date_from: from + "T00:00:00" } : {}),
    ...(to ? { date_to: to + "T23:59:59" } : {}),
  };

  const revQ = useQuery({
    queryKey: ["fin-revenue", agentId, from, to],
    queryFn: () => reportsApi.revenue(params),
    staleTime: 30 * 1000,
  });
  const comQ = useQuery({
    queryKey: ["fin-commissions", agentId, from, to],
    queryFn: () => reportsApi.commissions(params),
    staleTime: 30 * 1000,
  });

  const applyQuick = (key: RangeKey) => {
    const r = rangeFor(key);
    setFrom(r.from); setTo(r.to); setQuick(key);
  };
  const onManual = (setter: (v: string) => void) => (v: string) => { setter(v); setQuick(null); };

  const rev = revQ.data;
  const com = comQ.data;

  return (
    <div className="space-y-6">
      {/* Date range toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-surface-soft p-0.5">
          {([["month", "This month"], ["30d", "Last 30 days"], ["year", "This year"]] as [RangeKey, string][]).map(([k, label]) => (
            <button key={k} onClick={() => applyQuick(k)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                quick === k ? "bg-canvas text-ink shadow-sm" : "text-muted hover:text-ink",
              )}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Input type="date" value={from} onChange={e => onManual(setFrom)(e.target.value)} className="h-9 w-auto" title="From date" />
          <span className="text-muted text-sm">to</span>
          <Input type="date" value={to} onChange={e => onManual(setTo)(e.target.value)} className="h-9 w-auto" title="To date" />
        </div>
      </div>

      {/* Revenue */}
      <section>
        <h3 className="text-sm font-semibold text-ink mb-3">Revenue</h3>
        {revQ.isLoading && <p className="text-sm text-muted py-6 text-center">Loading…</p>}
        {revQ.isError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">Could not load the revenue report.</div>}
        {rev && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <Stat label="Net revenue" value={money(rev.net, rev.currency)} accent />
              <Stat label="Collected" value={money(rev.collected, rev.currency)} />
              <Stat label="Outstanding" value={money(rev.outstanding, rev.currency)} muted={num(rev.outstanding) === 0} />
              <Stat label="Sales" value={String(rev.sales_count)} />
              <Stat label="Gross" value={money(rev.gross, rev.currency)} />
              <Stat label="Discounts" value={money(rev.discounts, rev.currency)} />
              <Stat label="Tax" value={money(rev.tax, rev.currency)} />
              <Stat label="Tips" value={money(rev.tips, rev.currency)} />
            </div>
            {Object.keys(rev.by_status).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(rev.by_status).map(([st, n]) => (
                  <span key={st} className="inline-flex items-center gap-1.5 text-xs rounded-full bg-surface-soft border border-hairline px-2.5 py-1">
                    <span className="text-muted">{SALE_STATUS_LABELS[st] ?? st}</span>
                    <span className="font-semibold text-ink">{n}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Commissions */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink">Staff commissions</h3>
          {com && <span className="text-sm text-muted">Total <span className="font-semibold text-ink">{money(com.commission_total, com.currency)}</span></span>}
        </div>
        {comQ.isLoading && <p className="text-sm text-muted py-6 text-center">Loading…</p>}
        {comQ.isError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">Could not load the commission report.</div>}
        {com && com.by_employee.length === 0 && (
          <div className="bg-canvas rounded-xl border border-hairline p-8 text-center">
            <p className="text-sm text-muted">No commissions earned in this period.</p>
          </div>
        )}
        {com && com.by_employee.length > 0 && (
          <div className="bg-canvas rounded-xl border border-hairline overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3 pl-5">Employee</th>
                  <th className="text-right text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3">Lines</th>
                  <th className="text-right text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3 pr-5">Commission</th>
                </tr>
              </thead>
              <tbody>
                {com.by_employee.map((row, i) => (
                  <tr key={row.employee_id ?? `u${i}`} className="border-b border-hairline last:border-0">
                    <td className="px-4 py-3 pl-5 text-ink font-medium">{row.employee_name ?? "Unassigned"}</td>
                    <td className="px-4 py-3 text-right text-muted">{row.line_count}</td>
                    <td className="px-4 py-3 pr-5 text-right font-medium text-ink">{money(row.commission_total, com.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", accent ? "border-primary/30 bg-primary/5" : "border-hairline bg-canvas")}>
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", muted ? "text-muted" : accent ? "text-primary" : "text-ink")}>{value}</div>
    </div>
  );
}
