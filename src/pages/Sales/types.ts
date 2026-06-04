/**
 * Sales (financials) — type re-exports + label maps.
 *
 * Every money field arrives over the wire as a STRING ("30.00"), never a number
 * (the backend uses Numeric/Decimal). Route all arithmetic through num() in
 * ./format — never do math on these fields directly.
 */

import type { components } from "../../api/schema";

type S = components["schemas"];

// ── Sales / checkout ──────────────────────────────────────────────────────────
export type Sale = S["SaleResponse"];
export type SaleLineItem = S["SaleLineItemResponse"];
export type Payment = S["PaymentResponse"];
export type SaleDiscount = S["SaleDiscountResponse"];
export type SaleStatus = S["SaleStatusEnum"];
export type SaleLineKind = S["SaleLineKindEnum"];
export type PaymentMethod = S["PaymentMethodEnum"];

// ── Discounts ─────────────────────────────────────────────────────────────────
export type Discount = S["DiscountResponse"];
export type DiscountType = S["DiscountTypeEnum"];
export type DiscountScope = S["DiscountScopeEnum"];

// ── Commissions ───────────────────────────────────────────────────────────────
export type CommissionRule = S["CommissionRuleResponse"];
export type CommissionConfig = S["CommissionConfigResponse"];
export type CommissionType = S["CommissionTypeEnum"];
export type CommissionBase = S["CommissionBaseEnum"];

// ── Reports ───────────────────────────────────────────────────────────────────
export type RevenueReport = S["RevenueReportResponse"];
export type CommissionReport = S["CommissionReportResponse"];
export type CommissionReportRow = S["CommissionReportRow"];

// ── Bundles (combos + packages) ────────────────────────────────────────────────
export type Bundle = S["BundleResponse"];
export type BundleItem = S["BundleItemResponse"];
export type BundleKind = S["BundleKindEnum"];
export type CreditKind = S["CreditKindEnum"];
export type PackageCredit = S["PackageCreditResponse"];
export type ComboAvailability = S["ComboAvailabilityResponse"];
export type ComboOption = S["ComboOption"];

export type { ApiError } from "../../api/types";

// ── Local request-body shapes (these request schemas aren't named in the spec) ──
export interface PaymentInput {
  amount: number;
  method: string;
  tip_amount: number;
  note?: string | null;
}
export interface ApplyDiscountInput {
  discount_id?: number;
  code?: string;
  type?: string;
  value?: number;
  scope?: string;
  name?: string | null;
  sale_line_item_id?: number;
}
export interface RedeemInput {
  credit_id: number;
  sale_line_item_id: number;
}

// ── Display maps ───────────────────────────────────────────────────────────────
export const SALE_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  partially_paid: "Partially paid",
  paid: "Paid",
  refunded: "Refunded",
  void: "Void",
};

/** Tailwind badge classes per sale status (matches the app's badge palette). */
export const SALE_STATUS_BADGE: Record<string, string> = {
  open:           "bg-yellow-100 text-yellow-800 border-transparent",
  partially_paid: "bg-blue-100 text-blue-800 border-transparent",
  paid:           "bg-green-100 text-green-800 border-transparent",
  refunded:       "bg-gray-100 text-gray-500 border-transparent",
  void:           "bg-gray-100 text-gray-500 border-transparent",
};

export const PAY_METHOD_LABELS: Record<string, string> = {
  cash: "Cash", card: "Card", transfer: "Transfer", other: "Other",
};
