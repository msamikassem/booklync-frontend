/**
 * Field schema for the editor's auto-generated settings forms.
 *
 * Each section declares a `fields: Field[]` (in its schema.ts). The editor reads
 * this list and renders the matching control — so a new section's form appears
 * automatically with no editor changes. Keep the control set small and generic.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "image"
  | "imageList"
  | "color"
  | "toggle"
  | "select";

interface FieldBase {
  /** Key inside the section's `settings` object. */
  key: string;
  label: string;
  help?: string;
}

export type Field =
  | (FieldBase & { type: "text"; placeholder?: string })
  | (FieldBase & { type: "textarea"; placeholder?: string })
  | (FieldBase & { type: "image" })
  | (FieldBase & { type: "imageList" })
  | (FieldBase & { type: "color" })
  | (FieldBase & { type: "toggle" })
  | (FieldBase & {
      type: "select";
      options: { value: string; label: string }[];
    });
