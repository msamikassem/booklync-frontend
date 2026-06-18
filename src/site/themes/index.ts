/**
 * Theme catalogue. To add a theme: create themes/<name>.ts exporting a `Theme`,
 * then add it to THEMES below — the editor's theme gallery picks it up.
 */
import type { Theme } from "./types";
import { salonModern } from "./salonModern";
import { clinicClean } from "./clinicClean";

export const THEMES: Theme[] = [salonModern, clinicClean];

export function getTheme(id: string | null | undefined): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export type { Theme };
