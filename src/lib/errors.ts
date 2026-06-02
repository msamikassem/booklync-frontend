/**
 * Mirrors formatApiError from auth.js — same stripping rules.
 * Returns a plain string (no HTML injection).
 */

import type { ApiError } from "../api/types";

export function formatApiError(data: ApiError, fallback = "Something went wrong."): string {
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const items = data.errors.map((e) => {
      const field = e.field.replace(/^body → /, "").replace(/_/g, " ");
      const label = field.charAt(0).toUpperCase() + field.slice(1);
      const msg = e.message.replace(/^Value error,\s*/i, "");
      return `${label}: ${msg}`;
    });
    return items.join("\n");
  }
  return typeof data.detail === "string" ? data.detail : fallback;
}

/** Extracts "Book at 2:07 PM" suggested time from PREP_TIME_CONFLICT detail. */
export function extractPrepSuggestedTime(detail: string): string | null {
  const m = detail.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  return m ? m[1] : null;
}

/** Safely read the error body from a failed Response. */
export async function readApiError(res: Response): Promise<ApiError> {
  try {
    return await res.json();
  } catch {
    return { detail: `HTTP ${res.status}` };
  }
}
