import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useAgent } from "../../contexts/AgentContext";
import { num } from "./format";
import { cn } from "../../lib/utils";
import { SalesTab } from "./SalesTab";
import { ReportsTab } from "./ReportsTab";
import { DiscountsTab } from "./DiscountsTab";
import { CommissionsTab } from "./CommissionsTab";
import { BundlesTab } from "./BundlesTab";
import { TaxCurrencyModal } from "./TaxCurrencyModal";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

type TabKey = "sales" | "reports" | "discounts" | "bundles" | "commissions";

interface TabDef { key: TabKey; label: string; perms: string[]; }

const TABS: TabDef[] = [
  { key: "sales",       label: "Sales",              perms: ["view_financials"] },
  { key: "reports",     label: "Reports",            perms: ["view_financials"] },
  { key: "discounts",   label: "Discounts",          perms: ["manage_discounts"] },
  { key: "bundles",     label: "Packages & Combos",  perms: ["manage_discounts", "view_financials"] },
  { key: "commissions", label: "Commissions",        perms: ["manage_commissions"] },
];

export default function Sales() {
  const { me, refetchAgents } = useAuth();
  const { activeAgent, activeAgentId, setActiveAgent } = useAgent();
  const [editTax, setEditTax] = useState(false);

  const can = (...perms: string[]) => !!me && (me.is_owner || perms.some(p => me.permissions.includes(p)));
  const visibleTabs = TABS.filter(t => can(...t.perms));
  const [tab, setTab] = useState<TabKey>(visibleTabs[0]?.key ?? "sales");
  const activeTab = visibleTabs.some(t => t.key === tab) ? tab : (visibleTabs[0]?.key ?? "sales");

  if (!activeAgentId || !activeAgent) return <p className="text-sm text-muted">No branch selected.</p>;
  if (visibleTabs.length === 0) return <p className="text-sm text-muted">You don't have access to the Sales section.</p>;

  const canCheckout = can("view_financials");
  const rate = num(activeAgent.tax_rate);
  const taxLabel = activeAgent.tax_rate != null && rate > 0
    ? `Tax ${rate}% ${activeAgent.tax_inclusive ? "incl." : "excl."}`
    : "No tax";

  return (
    <div>
      {/* Header: tab bar + branch currency/tax chip */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 border-b border-hairline">
        <div className="flex items-center gap-1 -mb-px">
          {visibleTabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                "px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors",
                activeTab === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink",
              )}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 pb-2">
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface-soft border border-hairline text-xs font-medium text-ink">
            {activeAgent.currency || "USD"} <span className="text-muted">· {taxLabel}</span>
          </span>
          {can("manage_branches") && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted hover:text-ink" onClick={() => setEditTax(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
      </div>

      {/* Active panel */}
      {activeTab === "sales" && <SalesTab agentId={activeAgentId} canCheckout={canCheckout} />}
      {activeTab === "reports" && <ReportsTab agentId={activeAgentId} />}
      {activeTab === "discounts" && <DiscountsTab agentId={activeAgentId} currency={activeAgent.currency || "USD"} />}
      {activeTab === "commissions" && <CommissionsTab agentId={activeAgentId} currency={activeAgent.currency || "USD"} />}
      {activeTab === "bundles" && (
        <BundlesTab agentId={activeAgentId} currency={activeAgent.currency || "USD"} tz={activeAgent.timezone ?? null} canCheckout={canCheckout} />
      )}

      {editTax && (
        <TaxCurrencyModal agent={activeAgent} onClose={() => setEditTax(false)}
          onSaved={(updated) => { setActiveAgent(updated); refetchAgents(); setEditTax(false); }} />
      )}
    </div>
  );
}
