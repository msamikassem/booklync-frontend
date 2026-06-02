import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Avatar initials from name or phone. */
export function getInitials(name?: string | null, phone?: string | null): string {
  const src = name || phone || "?";
  return src
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Deterministic colour from a string — same palette as the old app. */
const AVATAR_COLORS = ["#2563EB", "#7C3AED", "#059669", "#D97706", "#DC2626", "#0891B2"];
export function avatarColor(str?: string | null): string {
  return AVATAR_COLORS[((str || "?").charCodeAt(0)) % AVATAR_COLORS.length];
}

/** Strip +1 prefix for display in a US phone input. */
export function stripE164(phone?: string | null): string {
  return (phone || "").replace(/^\+1/, "");
}

/** Build E.164 from 10-digit US input. Returns null for empty. */
export function buildPhone(digits: string): string | null {
  const cleaned = digits.replace(/\D/g, "");
  return cleaned ? "+1" + cleaned : null;
}

/** Validate a 10-digit US phone input. Returns error string or null. */
export function validatePhone(digits: string): string | null {
  if (!digits || !digits.trim()) return null;
  const cleaned = digits.replace(/\D/g, "");
  if (cleaned.length !== 10) return "Please enter a 10-digit phone number.";
  return null;
}

/** Format a date string for display. */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
