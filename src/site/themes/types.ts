import type { SiteConfig } from "../types";

export interface Theme {
  /** Stored in config.theme. Never rename once shipped. */
  id: string;
  name: string;
  description: string;
  /** Optional preview thumbnail (public path or asset URL). */
  thumbnail?: string;
  /** Build a fresh config for this theme (fresh section ids each call). */
  build: () => SiteConfig;
}
