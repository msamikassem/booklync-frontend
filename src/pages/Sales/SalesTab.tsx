import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { salesApi } from "./api";
import { customers as customersApi } from "../../api";
import { money, balanceDue, fmtDateTime } from "./format";
import { cn } from "../../lib/utils";
import { SALE_STATUS_LABELS, SALE_STATUS_BADGE } from "./types";
import type { Sale } from "./types";
import { SaleDrawer } from "./SaleDrawer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

interface Props {
  agentId: number;
  canCheckout: boolean;
}

function saleSummary(sale: Sale): string {
  const parts = (sale.line_items ?? [])
    .filter(li => li.kind !== "adjustment")
    .map(li => li.description ?? (li.kind === "package" ? "Package" : "Service"));
  if (!parts.length) return "—";
  const txt = parts.join(" · ");
  return txt.length > 60 ? txt.slice(0, 60) + "…" : txt;
}

export function SalesTab({ agentId, canCheckout }: Props) {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Sale | null>(null);

  const { data: sales = [], isLoading, isError } = useQuery({
    queryKey: ["fin-sales", agentId, dateFrom, dateTo, status],
    queryFn: () => salesApi.list({
      agent_id: agentId,
      ...(dateFrom ? { date_from: dateFrom + "T00:00:00" } : {}),
      ...(dateTo ? { date_to: dateTo + "T23:59:59" } : {}),
      ...(status !== "all" ? { status } : {}),
    }),
    staleTime: 30 * 1000,
  });

  // Customer id → display name (tenant-wide; reuses the ['customers'] cache).
  const { data: custList = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      try { return (await customersApi.list()).customers ?? []; } catch { return []; }
    },
    staleTime: 5 * 60 * 1000,
  });
  const custName = useMemo(() => {
    const map = new Map<number, string>();
    custList.forEach(c => map.set(c.id, c.name || c.phone || `Customer #${c.id}`));
    return (id?: number | null) => id ? (map.get(id) ?? `Customer #${id}`) : "Walk-in";
  }, [custList]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter(s => {
      const cust = custName(s.customer_id).toLowerCase();
      const svcs = (s.line_items ?? []).map(li => li.description ?? "").join(" ").toLowerCase();
      return String(s.id).includes(q) || cust.includes(q) || svcs.includes(q);
    });
  }, [sales, search, custName]);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none h-3.5 w-3.5" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search receipts…" className="pl-9" />
        </div>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-auto" title="From date" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-auto" title="To date" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(SALE_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* States */}
      {isLoading && <p className="text-sm text-muted py-8 text-center">Loading sales…</p>}
      {isError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">Could not load sales.</div>}

      {!isLoading && !isError && visible.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center max-w-2xl">
          <p className="font-semibold text-ink mb-1">{search ? "No results" : "No sales yet"}</p>
          <p className="text-sm text-muted">
            {search
              ? `Nothing matches "${search}".`
              : "A sale is created when an appointment is completed, or when you ring up a combo or sell a package. Try widening the date filter."}
          </p>
        </div>
      )}

      {/* Table */}
      {visible.length > 0 && (
        <div className="bg-canvas rounded-xl border border-hairline overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-hairline hover:bg-transparent">
                {["Receipt", "When", "Customer", "Items", "Status", "Total"].map((h, i) => (
                  <TableHead key={h} className={cn(
                    "text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3 first:pl-5 h-auto",
                    i === 5 && "text-right",
                  )}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(sale => {
                const due = balanceDue(sale);
                return (
                  <TableRow key={sale.id} onClick={() => setSelected(sale)}
                    className="border-b border-hairline last:border-0 hover:bg-surface-soft cursor-pointer transition-colors">
                    <TableCell className="px-4 py-3 pl-5 font-medium text-ink">#{sale.id}</TableCell>
                    <TableCell className="px-4 py-3 text-muted">{fmtDateTime(sale.created_at)}</TableCell>
                    <TableCell className="px-4 py-3 text-ink">{custName(sale.customer_id)}</TableCell>
                    <TableCell className="px-4 py-3 text-muted">
                      {saleSummary(sale)}
                      {sale.bundle_id && <span className="text-[10px] font-medium uppercase tracking-wide bg-surface-soft text-muted px-1.5 py-px rounded ml-1.5">Bundle</span>}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge className={cn("rounded-full text-[10px] font-medium", SALE_STATUS_BADGE[sale.status] ?? "bg-gray-100 text-gray-600 border-transparent")}>
                        {SALE_STATUS_LABELS[sale.status] ?? sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="font-medium text-ink">{money(sale.total, sale.currency)}</div>
                      {due > 0 && sale.status !== "void" && <div className="text-xs text-primary">{money(due, sale.currency)} due</div>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Drawer */}
      {selected && (
        <SaleDrawer
          saleId={selected.id}
          initialSale={selected}
          agentId={agentId}
          custName={custName(selected.customer_id)}
          canCheckout={canCheckout}
          onClose={() => setSelected(null)}
          onSaleChanged={(s) => setSelected(s)}
        />
      )}
    </div>
  );
}
