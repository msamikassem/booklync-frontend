import { apiFetch, API_BASE } from "../../auth/client";
import { storage } from "../../auth/storage";
import type { SiteConfig } from "@/site/types";

export interface SiteDraft {
  agent_id: number;
  theme_id: string | null;
  draft_config: SiteConfig;
  has_published: boolean;
  published_version: number;
  published_at: string | null;
  branding_removed: boolean;
}

export interface PublishResult {
  published_version: number;
  published_at: string;
  revalidated: boolean;
}

export interface PreviewToken {
  token: string;
  preview_path: string;
  expires_in_minutes: number;
}

export interface AssetResult {
  url: string;
}

async function unwrap<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(fallback), { data, status: res.status });
  }
  return res.json();
}

export const siteApi = {
  getDraft: (agentId: number) =>
    apiFetch(`/sites/${agentId}/draft`).then((r) => unwrap<SiteDraft>(r, "Could not load the site.")),

  patchDraft: (agentId: number, config: SiteConfig, themeId?: string | null) =>
    apiFetch(`/sites/${agentId}/draft`, {
      method: "PATCH",
      body: JSON.stringify({ config, theme_id: themeId ?? null }),
    }).then((r) => unwrap<SiteDraft>(r, "Could not save the site.")),

  publish: (agentId: number) =>
    apiFetch(`/sites/${agentId}/publish`, { method: "POST" }).then((r) =>
      unwrap<PublishResult>(r, "Could not publish the site."),
    ),

  previewToken: (agentId: number) =>
    apiFetch(`/sites/${agentId}/preview-token`).then((r) =>
      unwrap<PreviewToken>(r, "Could not start the preview."),
    ),

  // FormData upload — bypasses apiFetch's JSON Content-Type (browser sets the
  // multipart boundary). Mirrors the employee profile-picture upload: manual
  // token + one refresh-and-retry on 401.
  async uploadAsset(agentId: number, file: File): Promise<AssetResult> {
    const form = new FormData();
    form.append("file", file);
    const doUpload = (token: string | null) =>
      fetch(`${API_BASE}/sites/${agentId}/assets`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });

    let res = await doUpload(storage.getAccess());
    if (res.status === 401) {
      res = await doUpload(storage.getAccess());
    }
    return unwrap<AssetResult>(res, "Could not upload the image.");
  },
};
