/**
 * Money + date formatting for the Sales module.
 *
 * Ports the shared helpers from the legacy dashboard-sales.js (_slNum / _slMoney /
 * _slBalanceDue / _slFmt*). Money fields arrive as strings — num() is the single
 * coercion point and must be used everywhere before arithmetic or formatting.
 */

import type { Sale } from "./types";

/** Coerce a wire money value (string | number | null) to a finite number. */
export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format an amount in a given ISO currency. Sales / reports / credits each carry
 * their OWN snapshotted currency — always pass it, never assume the active branch.
 * Falls back gracefully if the code isn't a valid ISO-4217 string.
 */
export function money(amount: unknown, currency?: string | null): string {
  const n = num(amount);
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n);
  } catch {
    return `${cur} ${n.toFixed(2)}`;
  }
}

/**
 * What's still owed on a sale: total minus tips minus what's been paid toward
 * goods. Payments settle (total − tips); tips are extra on top and never count
 * toward the balance. (Byte-for-byte with the legacy _slBalanceDue.)
 */
export function balanceDue(sale: Sale): number {
  const goodsDue = num(sale.total) - num(sale.tip_total);
  const paidGoods = (sale.payments ?? []).reduce((s, p) => s + num(p.amount), 0);
  return Math.max(0, +(goodsDue - paidGoods).toFixed(2));
}

/** Everything actually collected on the sale, tips included. */
export function collected(sale: Sale): number {
  return (sale.payments ?? []).reduce((s, p) => s + num(p.amount) + num(p.tip_amount), 0);
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** A Date → "YYYY-MM-DD" for <input type="date"> values (local, not UTC). */
export function dateInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Format a time in a specific IANA timezone (for combo-booking slots). */
export function fmtTimeTz(iso: string, tz?: string | null): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { timeZone: tz ?? undefined, hour: "numeric", minute: "2-digit" });
  } catch {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}
