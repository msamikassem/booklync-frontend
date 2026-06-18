"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, ExternalLink, RefreshCw, ImagePlus, X, Loader2, Rocket,
  Monitor, Smartphone, Layers, Palette, GripVertical, ChevronLeft,
  Image as ImageIcon, List, Phone, Square, CalendarDays, Type, Images, Megaphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAuth } from "../../contexts/AuthContext";
import { useAgent } from "../../contexts/AgentContext";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { cn } from "../../lib/utils";

import { siteApi, type SiteDraft, type PreviewToken } from "./api";
import type { SiteConfig, Section } from "@/site/types";
import { FONT_OPTIONS } from "@/site/brand";
import { THEMES } from "@/site/themes";
import { SECTION_METAS, SECTION_META_BY_TYPE } from "@/site/sections/meta";
import { createSection } from "@/site/factory";
import type { Field } from "@/site/fields";

const SECTION_ICONS: Record<string, LucideIcon> = {
  hero: ImageIcon,
  about: Type,
  services: List,
  gallery: Images,
  booking: CalendarDays,
  cta: Megaphone,
  contact: Phone,
};
const iconFor = (type: string): LucideIcon => SECTION_ICONS[type] ?? Square;

const MSG = {
  select: "booklync-preview:select",
  highlight: "booklync-preview:highlight",
  ready: "booklync-preview:ready",
};

export default function SiteBuilder() {
  const { me } = useAuth();
  const { activeAgent, activeAgentId } = useAgent();
  const canManage = !!me && (me.is_owner || me.permissions.includes("manage_branches"));

  const draftQ = useQuery({
    queryKey: ["site-draft", activeAgentId],
    queryFn: () => siteApi.getDraft(activeAgentId as number),
    enabled: !!activeAgentId && canManage,
  });
  const tokenQ = useQuery({
    queryKey: ["site-preview-token", activeAgentId],
    queryFn: () => siteApi.previewToken(activeAgentId as number),
    enabled: !!activeAgentId && canManage,
    staleTime: 0,
  });

  if (!activeAgent) return <Center>No branch selected.</Center>;
  if (!canManage) return <Center>You don’t have permission to edit this website.</Center>;
  if (draftQ.isLoading || tokenQ.isLoading) return <Center><Loader2 className="h-5 w-5 animate-spin" /></Center>;
  if (draftQ.isError || !draftQ.data) return <Center>Could not load the website.</Center>;

  return (
    <Editor
      key={activeAgentId}
      agentId={activeAgentId as number}
      slug={activeAgent.booking_page_slug ?? ""}
      initial={draftQ.data}
      token={tokenQ.data ?? null}
    />
  );
}

function Editor({
  agentId, slug, initial, token,
}: {
  agentId: number; slug: string; initial: SiteDraft; token: PreviewToken | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [config, setConfig] = useState<SiteConfig>(initial.draft_config);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.draft_config.sections?.[0]?.id ?? null,
  );
  const [leftTab, setLeftTab] = useState<"sections" | "theme">("sections");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [iframeKey, setIframeKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const previewUrl =
    token && slug
      ? `${window.location.origin}/preview/${slug}?token=${encodeURIComponent(token.token)}`
      : null;

  // ── editor ↔ preview messaging ──────────────────────────────────────────────
  const highlight = (id: string | null) => {
    iframeRef.current?.contentWindow?.postMessage({ type: MSG.highlight, id }, window.location.origin);
  };
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === MSG.select && e.data.id) {
        setSelectedId(e.data.id);
        setLeftTab("sections");
      }
      if (e.data?.type === MSG.ready) highlight(selectedId);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [selectedId]);
  useEffect(() => { highlight(selectedId); }, [selectedId]);

  // Autosave the draft shortly after edits stop (Shopify-style). `dirty` clears
  // on save success, so this re-arms only on the next real edit. Theme-pick saves
  // directly (no dirty), so it won't double-save here.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => patch.mutate(config), 1200);
    return () => clearTimeout(t);
  }, [config, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── mutations ────────────────────────────────────────────────────────────────
  const patch = useMutation({
    mutationFn: (next: SiteConfig) => siteApi.patchDraft(agentId, next, next.theme),
    onSuccess: () => {
      setDirty(false);
      setIframeKey((k) => k + 1);
      qc.invalidateQueries({ queryKey: ["site-draft", agentId] });
    },
    onError: () => toast({ description: "Could not save changes." }),
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await siteApi.patchDraft(agentId, config, config.theme);
      return siteApi.publish(agentId);
    },
    onSuccess: (res) => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["site-draft", agentId] });
      toast({ description: res.revalidated ? "Published — your live site is updated." : "Published. Your live site will refresh shortly." });
    },
    onError: () => toast({ description: "Could not publish." }),
  });

  // ── helpers ───────────────────────────────────────────────────────────────────
  const update = (producer: (d: SiteConfig) => SiteConfig) => {
    setConfig((c) => producer(structuredClone(c)));
    setDirty(true);
  };
  const pickTheme = (id: string) => {
    const theme = THEMES.find((t) => t.id === id);
    if (!theme) return;
    const next = theme.build();
    setConfig(next);
    setSelectedId(next.sections[0]?.id ?? null);
    patch.mutate(next);
  };
  async function uploadImage(file: File): Promise<string | null> {
    setUploading(true);
    try { return (await siteApi.uploadAsset(agentId, file)).url; }
    catch { toast({ description: "Image upload failed." }); return null; }
    finally { setUploading(false); }
  }
  const reorder = (from: number, to: number) =>
    update((c) => {
      if (to < 0 || to >= c.sections.length) return c;
      const next = [...c.sections];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return { ...c, sections: next };
    });

  // ── theme not chosen → gallery ─────────────────────────────────────────────────
  if (!config.theme) {
    return (
      <Shell>
        <Toolbar
          themeName="Choose a design" status={initial.has_published ? "published" : "draft"}
          device={device} setDevice={setDevice} dirty={false} disabled
          onSave={() => {}} onPublish={() => {}} saving={false} publishing={false}
        />
        <div className="flex-1 overflow-auto bg-surface-soft grid place-items-center p-8">
          <div className="w-full max-w-3xl">
            <h2 className="font-display text-lg font-semibold text-ink mb-1 text-center">Pick a starting design</h2>
            <p className="text-sm text-muted text-center mb-6">You can customise everything afterwards.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {THEMES.map((t) => (
                <button key={t.id} onClick={() => pickTheme(t.id)} disabled={patch.isPending}
                  className="group text-left rounded-xl border border-hairline bg-canvas hover:border-primary hover:shadow-lg transition overflow-hidden disabled:opacity-60">
                  <div className="h-36 bg-gradient-to-br from-primary to-accent" />
                  <div className="p-4">
                    <div className="font-semibold text-ink group-hover:text-primary">{t.name}</div>
                    <div className="text-sm text-muted mt-0.5">{t.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  const selected = config.sections.find((s) => s.id === selectedId) ?? null;
  const selectedMeta = selected ? SECTION_META_BY_TYPE[selected.type] : null;

  return (
    <Shell>
      <Toolbar
        themeName={THEMES.find((t) => t.id === config.theme)?.name ?? "Website"}
        status={initial.has_published ? "published" : "draft"}
        liveHref={initial.has_published && slug ? `/b/${slug}` : undefined}
        device={device} setDevice={setDevice}
        dirty={dirty} saving={patch.isPending} publishing={publish.isPending}
        onSave={() => patch.mutate(config)} onPublish={() => publish.mutate()}
      />

      <div className="flex-1 flex min-h-0">
        {/* icon rail */}
        <div className="w-12 shrink-0 border-r border-hairline bg-canvas flex flex-col items-center py-3 gap-1">
          <RailButton active={leftTab === "sections"} onClick={() => setLeftTab("sections")} title="Sections"><Layers className="h-[18px] w-[18px]" /></RailButton>
          <RailButton active={leftTab === "theme"} onClick={() => setLeftTab("theme")} title="Theme settings"><Palette className="h-[18px] w-[18px]" /></RailButton>
        </div>

        {/* left panel */}
        <div className="w-[270px] shrink-0 border-r border-hairline bg-canvas overflow-y-auto">
          {leftTab === "sections" ? (
            <div className="py-3">
              <GroupLabel>Page sections</GroupLabel>
              <ul className="px-2">
                {config.sections.map((s, i) => (
                  <SectionRow
                    key={s.id} section={s} selected={s.id === selectedId} dragging={dragIdx === i}
                    onSelect={() => setSelectedId(s.id)}
                    onDelete={() => { update((c) => ({ ...c, sections: c.sections.filter((x) => x.id !== s.id) })); if (selectedId === s.id) setSelectedId(null); }}
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) { reorder(dragIdx, i); setDragIdx(i); } }}
                    onDragEnd={() => setDragIdx(null)}
                  />
                ))}
              </ul>
              <div className="px-3 pt-1">
                <AddSection onAdd={(type) => { const sec = createSection(type); if (!sec) return; update((c) => ({ ...c, sections: [...c.sections, sec] })); setSelectedId(sec.id); }} />
              </div>
            </div>
          ) : (
            <ThemePanel config={config} uploading={uploading} update={update} uploadImage={uploadImage} />
          )}
        </div>

        {/* canvas */}
        <div className="flex-1 min-w-0 bg-[#eef1f5] p-5 flex flex-col">
          <div className="flex items-center justify-end gap-1 mb-3">
            <button onClick={() => setIframeKey((k) => k + 1)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink px-2 py-1 rounded"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
            {previewUrl && <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink px-2 py-1 rounded"><ExternalLink className="h-3.5 w-3.5" /> Open</a>}
          </div>
          <div className="flex-1 min-h-0 flex justify-center">
            <div
              className="bg-white rounded-xl shadow-md border border-black/5 overflow-hidden transition-all duration-300 h-full"
              style={{ width: device === "mobile" ? 390 : "100%", maxWidth: device === "mobile" ? 390 : 1180 }}
            >
              {previewUrl ? (
                <iframe ref={iframeRef} key={iframeKey} src={previewUrl} title="Site preview"
                  className="w-full h-full bg-white" onLoad={() => highlight(selectedId)} />
              ) : (
                <div className="h-full grid place-items-center text-sm text-muted px-6 text-center">No preview (this branch has no booking-page slug).</div>
              )}
            </div>
          </div>
        </div>

        {/* right panel */}
        <div className="w-[320px] shrink-0 border-l border-hairline bg-canvas overflow-y-auto flex flex-col">
          {selected && selectedMeta ? (
            <>
              <div className="flex items-center gap-2 px-4 h-12 border-b border-hairline shrink-0">
                {(() => { const I = iconFor(selected.type); return <I className="h-4 w-4 text-muted" />; })()}
                <span className="text-sm font-semibold text-ink">{selectedMeta.label}</span>
              </div>
              <div className="p-4 space-y-4 flex-1">
                {selectedMeta.description && <p className="text-xs text-muted -mt-1">{selectedMeta.description}</p>}
                {selectedMeta.fields.map((f: Field) => (
                  <SettingField
                    key={f.key} field={f}
                    value={(selected.settings as Record<string, unknown>)[f.key]} uploading={uploading}
                    onChange={(val) => update((c) => ({ ...c, sections: c.sections.map((s) => s.id === selected.id ? { ...s, settings: { ...s.settings, [f.key]: val } } : s) }))}
                    onUpload={uploadImage}
                  />
                ))}
              </div>
              <div className="border-t border-hairline p-3 shrink-0">
                <button
                  onClick={() => { update((c) => ({ ...c, sections: c.sections.filter((x) => x.id !== selected.id) })); setSelectedId(null); }}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-sm text-error hover:bg-red-50 rounded-md py-2 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" /> Remove section
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 grid place-items-center p-6 text-center">
              <p className="text-sm text-muted">Select a section in the list or on the page to edit it.</p>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

// ── chrome ────────────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  // Break out of the dashboard's p-8 and fill the area under the h-14 topbar.
  return <div className="-m-8 h-[calc(100vh-3.5rem)] flex flex-col bg-canvas">{children}</div>;
}

function Toolbar({
  themeName, status, liveHref, device, setDevice, dirty, saving, publishing, onSave, onPublish, disabled,
}: {
  themeName: string; status: "draft" | "published"; liveHref?: string;
  device: "desktop" | "mobile"; setDevice: (d: "desktop" | "mobile") => void;
  dirty: boolean; saving: boolean; publishing: boolean; onSave: () => void; onPublish: () => void; disabled?: boolean;
}) {
  return (
    <div className="h-12 shrink-0 flex items-center gap-3 px-3 border-b border-hairline bg-canvas">
      <a href="/dashboard" className="p-1.5 rounded-md text-muted hover:bg-surface-soft hover:text-ink" title="Back to dashboard"><ChevronLeft className="h-4 w-4" /></a>
      <span className="text-sm font-semibold text-ink">{themeName}</span>
      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", status === "published" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
        {status === "published" ? "Published" : "Draft"}
      </span>

      <div className="mx-auto inline-flex items-center rounded-lg border border-hairline bg-surface-soft p-0.5">
        <DeviceBtn active={device === "desktop"} onClick={() => setDevice("desktop")} title="Desktop"><Monitor className="h-4 w-4" /></DeviceBtn>
        <DeviceBtn active={device === "mobile"} onClick={() => setDevice("mobile")} title="Mobile"><Smartphone className="h-4 w-4" /></DeviceBtn>
      </div>

      {liveHref && <a href={liveHref} target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:text-primary inline-flex items-center gap-1 mr-1"><ExternalLink className="h-3.5 w-3.5" /> View live</a>}
      <button onClick={onSave} disabled={disabled || !dirty || saving}
        className="text-sm font-medium px-3 h-8 rounded-md border border-hairline text-ink hover:bg-surface-soft disabled:opacity-50 disabled:hover:bg-transparent">
        {saving ? "Saving…" : dirty ? "Save" : "Saved"}
      </button>
      <button onClick={onPublish} disabled={disabled || publishing}
        className="text-sm font-semibold px-3.5 h-8 rounded-md bg-primary text-white hover:bg-primary-hover disabled:opacity-50 inline-flex items-center gap-1.5">
        <Rocket className="h-3.5 w-3.5" /> {publishing ? "Publishing…" : "Publish"}
      </button>
    </div>
  );
}

function DeviceBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return <button onClick={onClick} title={title} className={cn("h-7 w-9 grid place-items-center rounded-md transition-colors", active ? "bg-canvas text-ink shadow-sm" : "text-muted hover:text-ink")}>{children}</button>;
}

function RailButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return <button onClick={onClick} title={title} className={cn("h-9 w-9 grid place-items-center rounded-lg transition-colors", active ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface-soft hover:text-ink")}>{children}</button>;
}

// ── left panel pieces ───────────────────────────────────────────────────────────

function SectionRow({
  section, selected, dragging, onSelect, onDelete, onDragStart, onDragOver, onDragEnd,
}: {
  section: Section; selected: boolean; dragging: boolean;
  onSelect: () => void; onDelete: () => void;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  const meta = SECTION_META_BY_TYPE[section.type];
  const I = iconFor(section.type);
  return (
    <li
      draggable onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 h-9 cursor-pointer mb-0.5 border",
        selected ? "bg-primary/5 border-primary/30" : "border-transparent hover:bg-surface-soft",
        dragging && "opacity-50",
      )}
    >
      <GripVertical className="h-4 w-4 text-muted/40 group-hover:text-muted cursor-grab shrink-0" />
      <I className={cn("h-4 w-4 shrink-0", selected ? "text-primary" : "text-muted")} />
      <span className={cn("flex-1 text-sm truncate", selected ? "text-ink font-medium" : "text-ink")}>{meta?.label ?? section.type}</span>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-error shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
    </li>
  );
}

function AddSection({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="w-full inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:bg-primary/5 rounded-md px-2 h-9">
        <Plus className="h-4 w-4" /> Add section
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 z-20 rounded-lg border border-hairline bg-canvas shadow-lg py-1">
            {SECTION_METAS.map((m) => {
              const I = iconFor(m.type);
              return (
                <button key={m.type} onClick={() => { onAdd(m.type); setOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-soft">
                  <I className="h-4 w-4 text-muted" />
                  <span className="text-sm text-ink">{m.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ThemePanel({
  config, uploading, update, uploadImage,
}: {
  config: SiteConfig; uploading: boolean;
  update: (p: (d: SiteConfig) => SiteConfig) => void; uploadImage: (f: File) => Promise<string | null>;
}) {
  const colors = config.brand?.colors ?? {};
  const setColor = (key: string, v: string) => update((c) => ({ ...c, brand: { ...c.brand, colors: { ...c.brand?.colors, [key]: v } } }));
  return (
    <div className="py-3">
      <GroupLabel>Brand</GroupLabel>
      <div className="px-4 space-y-4 pt-1">
        <div>
          <FieldLabel>Business name</FieldLabel>
          <Input value={config.brand?.businessName ?? ""} placeholder="(use branch name)"
            onChange={(e) => update((c) => ({ ...c, brand: { ...c.brand, businessName: e.target.value || null } }))} />
        </div>
        <div>
          <FieldLabel>Logo</FieldLabel>
          <ImageControl value={config.brand?.logoUrl ?? null} uploading={uploading}
            onPick={async (f) => { const u = await uploadImage(f); if (u) update((c) => ({ ...c, brand: { ...c.brand, logoUrl: u } })); }}
            onClear={() => update((c) => ({ ...c, brand: { ...c.brand, logoUrl: null } }))} />
        </div>
        <div>
          <FieldLabel>Favicon</FieldLabel>
          <ImageControl value={config.brand?.faviconUrl ?? null} uploading={uploading}
            onPick={async (f) => { const u = await uploadImage(f); if (u) update((c) => ({ ...c, brand: { ...c.brand, faviconUrl: u } })); }}
            onClear={() => update((c) => ({ ...c, brand: { ...c.brand, faviconUrl: null } }))} />
        </div>
      </div>
      <div className="mt-2 border-t border-hairline" />
      <GroupLabel>Typography</GroupLabel>
      <div className="px-4 pt-1">
        <FieldLabel>Font</FieldLabel>
        <select
          value={config.brand?.font ?? "satoshi"}
          onChange={(e) => update((c) => ({ ...c, brand: { ...c.brand, font: e.target.value } }))}
          className="w-full text-sm rounded-md border border-hairline bg-canvas h-9 px-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {FONT_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>
      <div className="mt-2 border-t border-hairline" />
      <GroupLabel>Colours</GroupLabel>
      <div className="px-4 space-y-3 pt-1">
        <ColorRow label="Primary" value={colors.primary ?? "#2563EB"} onChange={(v) => setColor("primary", v)} />
        <ColorRow label="Accent" value={colors.accent ?? "#7C3AED"} onChange={(v) => setColor("accent", v)} />
        <ColorRow label="Background" value={colors.bg ?? "#ffffff"} onChange={(v) => setColor("bg", v)} />
        <ColorRow label="Text" value={colors.text ?? "#0F172A"} onChange={(v) => setColor("text", v)} />
      </div>
    </div>
  );
}

// ── right panel field controls ──────────────────────────────────────────────────

function SettingField({
  field, value, uploading, onChange, onUpload,
}: {
  field: Field; value: unknown; uploading: boolean;
  onChange: (val: unknown) => void; onUpload: (file: File) => Promise<string | null>;
}) {
  return (
    <div>
      {field.type !== "toggle" && <FieldLabel>{field.label}</FieldLabel>}
      {field.type === "text" && <Input value={(value as string) ?? ""} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />}
      {field.type === "textarea" && (
        <textarea value={(value as string) ?? ""} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} rows={3}
          className="w-full text-sm rounded-md border border-hairline bg-canvas px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary/30" />
      )}
      {field.type === "toggle" && <Switch label={field.label} checked={!!value} onChange={onChange} />}
      {field.type === "color" && <ColorControl value={(value as string) ?? "#000000"} onChange={onChange} />}
      {field.type === "select" && (
        field.options.length <= 3 ? (
          <Segmented value={(value as string) ?? ""} options={field.options} onChange={onChange} />
        ) : (
          <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}
            className="w-full text-sm rounded-md border border-hairline bg-canvas h-9 px-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary/30">
            {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )
      )}
      {field.type === "image" && (
        <ImageControl value={(value as string) ?? null} uploading={uploading}
          onPick={async (f) => { const u = await onUpload(f); if (u) onChange(u); }} onClear={() => onChange(null)} />
      )}
      {field.type === "imageList" && (
        <ImageListControl value={(value as string[]) ?? []} uploading={uploading}
          onAdd={async (f) => { const u = await onUpload(f); if (u) onChange([...((value as string[]) ?? []), u]); }}
          onRemove={(i) => onChange(((value as string[]) ?? []).filter((_, idx) => idx !== i))} />
      )}
      {field.help && <p className="text-xs text-muted mt-1">{field.help}</p>}
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex w-full rounded-md border border-hairline bg-surface-soft p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn("flex-1 text-xs font-medium px-2 h-7 rounded transition-colors", value === o.value ? "bg-canvas text-ink shadow-sm" : "text-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-ink">{label}</span>
      <button type="button" onClick={() => onChange(!checked)}
        className={cn("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-primary" : "bg-hairline")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono text-muted">{value.toUpperCase()}</span>
        <label className="h-7 w-7 rounded-md border border-hairline cursor-pointer overflow-hidden shrink-0" style={{ backgroundColor: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="opacity-0 w-full h-full cursor-pointer" />
        </label>
      </div>
    </div>
  );
}

function ColorControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="h-9 w-9 rounded-md border border-hairline cursor-pointer overflow-hidden shrink-0" style={{ backgroundColor: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="opacity-0 w-full h-full cursor-pointer" />
      </label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
    </div>
  );
}

function ImageControl({
  value, uploading, onPick, onClear,
}: {
  value: string | null; uploading: boolean; onPick: (file: File) => void; onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-12 w-12 rounded-md object-cover border border-hairline" />
      ) : (
        <div className="h-12 w-12 rounded-md border border-dashed border-hairline grid place-items-center text-muted"><ImagePlus className="h-4 w-4" /></div>
      )}
      <label className="inline-flex items-center gap-1.5 text-sm text-primary cursor-pointer">
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        {value ? "Replace" : "Upload"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = ""; }} />
      </label>
      {value && <button onClick={onClear} className="text-muted hover:text-error"><X className="h-3.5 w-3.5" /></button>}
    </div>
  );
}

function ImageListControl({
  value, uploading, onAdd, onRemove,
}: {
  value: string[]; uploading: boolean; onAdd: (file: File) => void; onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {value.map((src, i) => (
            <div key={i} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full aspect-square object-cover rounded-md border border-hairline" />
              <button onClick={() => onRemove(i)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-canvas border border-hairline shadow grid place-items-center text-muted hover:text-error">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="inline-flex items-center gap-1.5 text-sm text-primary cursor-pointer">
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Add photo
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onAdd(f); e.currentTarget.value = ""; }} />
      </label>
    </div>
  );
}

// ── primitives ──────────────────────────────────────────────────────────────────

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pt-2 pb-1.5 text-[11px] font-semibold text-muted uppercase tracking-wider">{children}</div>;
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-muted mb-1">{children}</label>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <div className="-m-8 h-[calc(100vh-3.5rem)] grid place-items-center text-sm text-muted">{children}</div>;
}
