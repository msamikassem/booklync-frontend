import type { ComponentType } from "react";
import type { Field } from "../fields";
import type { RenderContext } from "../types";

/**
 * The CLIENT-SAFE half of a section definition: plain data only (no React
 * component). The editor imports these (via meta.ts) to build forms + the
 * "add section" menu without pulling server components into the client bundle.
 */
export interface SectionMeta<T = Record<string, unknown>> {
  /** Stable id stored in config (`section.type`). Never rename once shipped. */
  type: string;
  /** Shown in the editor's section list + add menu. */
  label: string;
  description?: string;
  /** Settings applied when the section is first added. */
  defaults: T;
  /** Editor form schema. */
  fields: Field[];
}

export interface SectionRendererProps<T = Record<string, unknown>> {
  settings: T;
  ctx: RenderContext;
}

/**
 * The full (SERVER) section definition: its meta + its renderer (a server
 * component). The public SiteRenderer imports these (via registry.ts).
 */
export interface SectionDef<T = Record<string, unknown>> extends SectionMeta<T> {
  Renderer: ComponentType<SectionRendererProps<T>>;
}
