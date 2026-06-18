import { SECTION_META_BY_TYPE } from "./sections/meta";
import type { Section } from "./types";

/** Stable unique id for a placed section. */
export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Build a fresh section of `type` seeded with its defaults (editor "add"). */
export function createSection(type: string): Section | null {
  const meta = SECTION_META_BY_TYPE[type];
  if (!meta) return null;
  return { id: uid(), type, settings: { ...meta.defaults } };
}
