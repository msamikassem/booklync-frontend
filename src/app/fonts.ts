import { Inter, JetBrains_Mono, Playfair_Display, Poppins } from "next/font/google";
import localFont from "next/font/local";

/**
 * Self-hosted fonts via `next/font` — replaces the old CSS `@import` from
 * Fontshare/Google. next/font downloads + serves these from our own origin
 * (no third-party request from the user's browser, no layout shift), exposing
 * each as a CSS variable consumed by `index.css` + `tailwind.config.js`.
 *
 * Inter + JetBrains Mono are variable Google fonts (full weight range, so Inter
 * gets a real 600). Satoshi isn't on Google → local woff2 (weights 500 + 700,
 * the only static instances Fontshare ships — same as the previous @import, so
 * semibold/600 display text resolves to the nearest face exactly as before).
 */

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const satoshi = localFont({
  src: [
    { path: "./fonts/satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/satoshi-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

// Curated webfonts offered to published sites (per-site font choice). Exposed as
// CSS variables on <html>; the site renderer maps brand.font → these vars.
export const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});
