"use client";

import { useEffect, useState } from "react";
import { SECTION_META_BY_TYPE } from "@/site/sections/meta";

/**
 * Editor↔preview bridge — rendered ONLY inside the editor's preview iframe
 * (never on the public site). It gives the canvas its Shopify-like behaviour:
 *  - click a section → tell the parent editor to select it
 *  - parent says "highlight id" → draw a blue outline + label over that section
 * Communication is same-origin postMessage (editor and preview share an origin).
 */

type Rect = { top: number; left: number; width: number; height: number };
const MSG = {
  select: "booklync-preview:select",
  highlight: "booklync-preview:highlight",
  ready: "booklync-preview:ready",
};

export default function PreviewBridge() {
  const [sel, setSel] = useState<{ type: string; rect: Rect } | null>(null);

  useEffect(() => {
    const origin = window.location.origin;
    let currentId: string | null = null;

    const elFor = (id: string) =>
      document.querySelector(`[data-site-section="${CSS.escape(id)}"]`) as HTMLElement | null;

    const refresh = () => {
      if (!currentId) return setSel(null);
      const el = elFor(currentId);
      if (!el) return setSel(null);
      const r = el.getBoundingClientRect();
      setSel({
        type: el.getAttribute("data-section-type") || "",
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
      });
    };

    const onMsg = (e: MessageEvent) => {
      if (e.origin !== origin) return;
      if (e.data?.type === MSG.highlight) {
        currentId = e.data.id ?? null;
        const el = currentId ? elFor(currentId) : null;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        refresh();
      }
    };

    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest("[data-site-section]") as HTMLElement | null;
      if (!el) return;
      e.preventDefault(); // don't follow CTA links while editing
      currentId = el.getAttribute("data-site-section");
      window.parent.postMessage({ type: MSG.select, id: currentId }, origin);
      refresh();
    };

    window.addEventListener("message", onMsg);
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    // images/fonts load async + change layout → keep the outline pinned
    const iv = window.setInterval(refresh, 400);
    window.parent.postMessage({ type: MSG.ready }, origin);

    return () => {
      window.removeEventListener("message", onMsg);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
      window.clearInterval(iv);
    };
  }, []);

  if (!sel) return null;
  const label = SECTION_META_BY_TYPE[sel.type]?.label ?? sel.type;

  return (
    <div
      style={{
        position: "fixed",
        top: sel.rect.top,
        left: sel.rect.left,
        width: sel.rect.width,
        height: sel.rect.height,
        outline: "2px solid #2563EB",
        outlineOffset: "-2px",
        pointerEvents: "none",
        zIndex: 2147483647,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: "translateY(-100%)",
          background: "#2563EB",
          color: "#fff",
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: "4px 4px 0 0",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </div>
  );
}
