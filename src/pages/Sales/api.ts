/**
 * Typed surface over the backend `/financials/*` endpoints.
 *
 * Every read returns the unwrapped payload (arrays/objects); every write returns
 * the updated resource. Failures throw an Error with `{ data, status }` attached
 * so callers can run it through formatApiError(e.data).
 */

import { apiFetch } from "../../auth/client";
import type { components } from "../../api/schema";
import type {
  Sale, Discount, CommissionRule, CommissionConfig,
  RevenueReport, CommissionReport, Bundle, PackageCredit, ComboAvailability,
  PaymentInput, ApplyDiscountInput, RedeemInput,
} from "./types";

type S = components["schemas"];

async function get<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error("Request failed"), { data, status: res.status });
  }
  return res.json();
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error("Request failed"), { data, status: res.status });
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Sales + checkout ────────────────────────────────────────────────────────
export interface SalesListParams {
  agent_id: number;
  date_from?: string;
  date_to?: string;
  status?: string;
  customer_id?: number;
}

export const salesApi = {
  list(p: SalesListParams): Promise<Sale[]> {
    const qs = new URLSearchParams({ agent_id: String(p.agent_id) });
    if (p.date_from) qs.set("date_from", p.date_from);
    if (p.date_to) qs.set("date_to", p.date_to);
    if (p.status) qs.set("status", p.status);
    if (p.customer_id) qs.set("customer_id", String(p.customer_id));
    return get<{ sales: Sale[]; total: number }>(`/financials/sales?${qs}`).then(d => d.sales ?? []);
  },
  get: (id: number) => get<Sale>(`/financials/sales/${id}`),
  recordPayment: (id: number, body: PaymentInput) =>
    send<Sale>(`/financials/sales/${id}/payments`, "POST", body),
  applyDiscount: (id: number, body: ApplyDiscountInput) =>
    send<Sale>(`/financials/sales/${id}/discounts`, "POST", body),
  removeDiscount: (id: number, saleDiscountId: number) =>
    send<Sale>(`/financials/sales/${id}/discounts/${saleDiscountId}`, "DELETE"),
  redeem: (id: number, body: RedeemInput) =>
    send<Sale>(`/financials/sales/${id}/redeem`, "POST", body),
  undoRedeem: (id: number, lineId: number) =>
    send<Sale>(`/financials/sales/${id}/redeem/${lineId}`, "DELETE"),
  createCombo: (agentId: number, body: S["ComboSaleRequest"]) =>
    send<Sale>(`/financials/sales/combo?agent_id=${agentId}`, "POST", body),
  createPackage: (agentId: number, body: S["PackageSaleRequest"]) =>
    send<Sale>(`/financials/sales/package?agent_id=${agentId}`, "POST", body),
};

// ── Discount catalogue ──────────────────────────────────────────────────────
export const discountsApi = {
  list: (agentId: number, activeOnly = false) =>
    get<{ discounts: Discount[] }>(`/financials/discounts?agent_id=${agentId}&active_only=${activeOnly}`).then(d => d.discounts ?? []),
  create: (agentId: number, body: S["DiscountCreate"]) =>
    send<Discount>(`/financials/discounts?agent_id=${agentId}`, "POST", body),
  update: (id: number, body: S["DiscountUpdate"]) =>
    send<Discount>(`/financials/discounts/${id}`, "PATCH", body),
  delete: (id: number) => send<void>(`/financials/discounts/${id}`, "DELETE"),
};

// ── Commissions ─────────────────────────────────────────────────────────────
export const commissionApi = {
  getConfig: () => get<CommissionConfig>(`/financials/commission-config`),
  updateConfig: (body: S["CommissionConfigUpdate"]) =>
    send<CommissionConfig>(`/financials/commission-config`, "PATCH", body),
  listRules: (agentId: number, activeOnly = false) =>
    get<{ commission_rules: CommissionRule[] }>(`/financials/commission-rules?agent_id=${agentId}&active_only=${activeOnly}`).then(d => d.commission_rules ?? []),
  createRule: (agentId: number, body: S["CommissionRuleCreate"]) =>
    send<CommissionRule>(`/financials/commission-rules?agent_id=${agentId}`, "POST", body),
  updateRule: (id: number, body: S["CommissionRuleUpdate"]) =>
    send<CommissionRule>(`/financials/commission-rules/${id}`, "PATCH", body),
  deleteRule: (id: number) => send<void>(`/financials/commission-rules/${id}`, "DELETE"),
};

// ── Reports ─────────────────────────────────────────────────────────────────
export interface ReportParams { agent_id: number; date_from?: string; date_to?: string; }

function reportQs(p: ReportParams): string {
  const qs = new URLSearchParams({ agent_id: String(p.agent_id) });
  if (p.date_from) qs.set("date_from", p.date_from);
  if (p.date_to) qs.set("date_to", p.date_to);
  return qs.toString();
}

export const reportsApi = {
  revenue: (p: ReportParams) => get<RevenueReport>(`/financials/reports/revenue?${reportQs(p)}`),
  commissions: (p: ReportParams) => get<CommissionReport>(`/financials/reports/commissions?${reportQs(p)}`),
};

// ── Bundles (combos + packages) ─────────────────────────────────────────────
export const bundlesApi = {
  list(agentId: number, opts?: { kind?: "combo" | "package"; activeOnly?: boolean }): Promise<Bundle[]> {
    const qs = new URLSearchParams({ agent_id: String(agentId) });
    if (opts?.kind) qs.set("kind", opts.kind);
    if (opts?.activeOnly) qs.set("active_only", "true");
    return get<{ bundles: Bundle[] }>(`/financials/bundles?${qs}`).then(d => d.bundles ?? []);
  },
  create: (agentId: number, body: S["BundleCreate"]) =>
    send<Bundle>(`/financials/bundles?agent_id=${agentId}`, "POST", body),
  update: (id: number, body: S["BundleUpdate"]) =>
    send<Bundle>(`/financials/bundles/${id}`, "PATCH", body),
  delete: (id: number) => send<void>(`/financials/bundles/${id}`, "DELETE"),
  availability(bundleId: number, date: string, employeeId?: number | null): Promise<ComboAvailability> {
    const qs = new URLSearchParams({ date });
    if (employeeId) qs.set("employee_id", String(employeeId));
    return get<ComboAvailability>(`/financials/bundles/${bundleId}/availability?${qs}`);
  },
  book: (body: S["ComboBookRequest"]) =>
    send<Sale>(`/financials/sales/combo/book`, "POST", body),
};

// ── Customer prepaid credits ────────────────────────────────────────────────
export const creditsApi = {
  list(agentId: number, opts?: { customerId?: number; activeOnly?: boolean }): Promise<PackageCredit[]> {
    const qs = new URLSearchParams({ agent_id: String(agentId) });
    if (opts?.customerId) qs.set("customer_id", String(opts.customerId));
    if (opts?.activeOnly === false) qs.set("active_only", "false");
    return get<{ credits: PackageCredit[] }>(`/financials/credits?${qs}`).then(d => d.credits ?? []);
  },
};
