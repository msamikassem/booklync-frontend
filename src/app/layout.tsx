import type { Metadata } from "next";
import { inter, jetbrainsMono, satoshi } from "./fonts";
import "@/index.css";

export const metadata: Metadata = {
  title: { default: "Booklync", template: "%s — Booklync" },
  description:
    "Booklync — AI receptionist and online booking for appointment-based businesses.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Root layout stays provider-free so the public (SSR) tree never pulls in any
  // client-only auth/query context. Providers live in app/(app)/layout.tsx.
  return (
    <html
      lang="en"
      className={`${satoshi.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
