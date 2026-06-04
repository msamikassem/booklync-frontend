import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { bundlesApi, creditsApi } from "./api";
import { customers as customersApi } from "../../api";
import { money, num, fmtDate } from "./format";
import { cn } from "../../lib/utils";
import type { Bundle, Sale } from "./types";
import { useCatalogRefs } from "./refs";
import { BundleEditorModal } from "./BundleEditorModal";
import { ComboBookModal } from "./ComboBookModal";
import { ComboSaleModal } from "./ComboSaleModal";
import { PackageSaleModal } from "./PackageSaleModal";
import { SaleDrawer } from "./SaleDrawer";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Package, Layers, Wallet, CalendarPlus, Receipt } from "lucide-react";

interface Props { agentId: number; currency: string; tz: string | null; canCheckout: boolean; }

export function BundlesTab({ agentId, currency, tz, canCheckout }: Props) {
  const refs = useCatalogRefs(agentId);
  const [editing, setEditing] = useState<Bundle | null | "new">(null);
  const [booking, setBooking] = useState<Bundle | null>(null);
  const [ringUp, setRingUp] = useState<Bundle | null>(null);
  const [selling, setSelling] = useState<Bundle | null>(null);
  const [openSale, setOpenSale] = useState<Sale | null>(null);

  const { data: bundles = [], isLoading, isError } = useQuery({
    queryKey: ["fin-bundles", agentId],
    queryFn: () => bundlesApi.list(agentId),
    staleTime: 30 * 1000,
  });

  // Keyed ["credits", agentId] so the checkout flow's invalidation (after a
  // package payment grants a credit) refreshes this list automatically.
  const { data: credits = [] } = useQuery({
    queryKey: ["credits", agentId],
    queryFn: () => creditsApi.list(agentId, { activeOnly: true }),
    staleTime: 30 * 1000,
  });

  // ['customers'] cache holds the full { customers, total } object (owned by the
  // Customers screen) — read .customers, never assume a bare array.
  const { data: custData } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list(),
    staleTime: 5 * 60 * 1000,
  });
  const custName = useMemo(() => {
    const map = new Map<number, string>();
    (custData?.customers ?? []).forEach(c => map.set(c.id, c.name || c.phone || `Customer #${c.id}`));
    return (id?: number | null) => id ? (map.get(id) ?? `Customer #${id}`) : "Walk-in";
  }, [custData]);

  const combos = bundles.filter(b => b.kind === "combo");
  const packages = bundles.filter(b => b.kind === "package");

  function itemsSummary(b: Bundle): string {
    const parts = b.items.map(it => {
      const name = it.variation_id ? refs.variationName(it.variation_id) : refs.serviceName(it.service_id);
      return it.qty > 1 ? `${name} ×${it.qty}` : name;
    });
    return parts.join(" · ") || "—";
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted max-w-xl">
          Combos bundle several services at one price. Packages sell prepaid sessions or a value wallet a customer draws down over time.
        </p>
        <Button onClick={() => setEditing("new")} className="gap-1.5 shrink-0"><Plus className="h-4 w-4" /> New</Button>
      </div>

      {isLoading && <p className="text-sm text-muted py-8 text-center">Loading…</p>}
      {isError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-3 text-sm">Could not load packages &amp; combos.</div>}

      {!isLoading && !isError && bundles.length === 0 && (
        <div className="bg-canvas rounded-xl border border-hairline p-10 text-center max-w-2xl">
          <Package className="h-8 w-8 text-muted mx-auto mb-3" />
          <p className="font-semibold text-ink mb-1">Nothing here yet</p>
          <p className="text-sm text-muted">Create a combo or a prepaid package to sell at checkout.</p>
        </div>
      )}

      {/* Combos */}
      {combos.length > 0 && (
        <Section icon={<Layers className="h-4 w-4" />} title="Combos">
          {combos.map(b => (
            <BundleCard key={b.id} b={b} currency={currency} active={b.active} subtitle={itemsSummary(b)} onEdit={() => setEditing(b)}>
              {canCheckout && (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRingUp(b)} disabled={!b.active}>
                    <Receipt className="h-3.5 w-3.5" /> Ring up
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBooking(b)} disabled={!b.active}>
                    <CalendarPlus className="h-3.5 w-3.5" /> Book
                  </Button>
                </>
              )}
            </BundleCard>
          ))}
        </Section>
      )}

      {/* Packages */}
      {packages.length > 0 && (
        <Section icon={<Wallet className="h-4 w-4" />} title="Packages">
          {packages.map(b => (
            <BundleCard key={b.id} b={b} currency={currency} active={b.active}
              subtitle={b.credit_kind === "value"
                ? `Value wallet · ${money(b.credit_value ?? b.price, currency)}`
                : `Sessions · ${itemsSummary(b)}`}
              onEdit={() => setEditing(b)}>
              {canCheckout && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSelling(b)} disabled={!b.active}>
                  <Receipt className="h-3.5 w-3.5" /> Sell
                </Button>
              )}
            </BundleCard>
          ))}
        </Section>
      )}

      {/* Active customer credits */}
      <section>
        <h3 className="text-sm font-semibold text-ink mb-3">Active customer credits</h3>
        {credits.length === 0 ? (
          <div className="bg-canvas rounded-xl border border-hairline p-8 text-center">
            <p className="text-sm text-muted">No active prepaid credits. They appear here when a package sale is paid.</p>
          </div>
        ) : (
          <div className="bg-canvas rounded-xl border border-hairline overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3 pl-5">Customer</th>
                  <th className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3">Remaining</th>
                  <th className="text-right text-xs font-semibold text-muted uppercase tracking-wide px-4 py-3 pr-5">Expires</th>
                </tr>
              </thead>
              <tbody>
                {credits.map(c => (
                  <tr key={c.id} className="border-b border-hairline last:border-0">
                    <td className="px-4 py-3 pl-5 text-ink font-medium">{custName(c.customer_id)}</td>
                    <td className="px-4 py-3 text-muted">
                      {c.kind === "value"
                        ? `${money(c.balance, c.currency)} wallet`
                        : `${num(c.remaining_qty)} × ${c.variation_id ? refs.variationName(c.variation_id) : refs.serviceName(c.service_id)}`}
                    </td>
                    <td className="px-4 py-3 pr-5 text-right text-muted">{c.expires_at ? fmtDate(c.expires_at) : "No expiry"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modals */}
      {editing !== null && (
        <BundleEditorModal agentId={agentId} currency={currency} bundle={editing === "new" ? null : editing} refs={refs} onClose={() => setEditing(null)} />
      )}
      {booking && (
        <ComboBookModal agentId={agentId} tz={tz} currency={currency} bundle={booking} refs={refs}
          onClose={() => setBooking(null)} onBooked={(s) => { setBooking(null); setOpenSale(s); }} />
      )}
      {ringUp && (
        <ComboSaleModal agentId={agentId} currency={currency} bundle={ringUp} refs={refs}
          onClose={() => setRingUp(null)} onSold={(s) => { setRingUp(null); setOpenSale(s); }} />
      )}
      {selling && (
        <PackageSaleModal agentId={agentId} currency={currency} bundle={selling}
          onClose={() => setSelling(null)} onSold={(s) => { setSelling(null); setOpenSale(s); }} />
      )}
      {openSale && (
        <SaleDrawer saleId={openSale.id} initialSale={openSale} agentId={agentId}
          custName={custName(openSale.customer_id)} canCheckout={canCheckout}
          onClose={() => setOpenSale(null)} onSaleChanged={(s) => setOpenSale(s)} />
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink mb-3">{icon} {title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
    </section>
  );
}

function BundleCard({ b, currency, active, subtitle, onEdit, children }: {
  b: Bundle; currency: string; active: boolean; subtitle: string; onEdit: () => void; children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border bg-canvas p-4 flex flex-col gap-3", active ? "border-hairline" : "border-hairline opacity-60")}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold text-ink leading-tight">{b.name}</div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!active && <span className="text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Inactive</span>}
            <button onClick={onEdit} className="text-muted hover:text-ink p-0.5" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="text-lg font-semibold text-ink tabular-nums mt-1">{money(b.price, currency)}</div>
        <p className="text-xs text-muted mt-1 line-clamp-2">{subtitle}</p>
      </div>
      {children && <div className="flex gap-2 mt-auto pt-1">{children}</div>}
    </div>
  );
}
