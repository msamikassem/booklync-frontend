"use client";

/**
 * Layout for every NON-public ("app") route: login, accept-invite, the full
 * dashboard, and the staff own-calendar view.
 *
 * Holds the client providers (React Query + Auth + Agent) and the toast host.
 * Auth state lives entirely in localStorage, so the whole subtree is gated
 * behind mount: on the server (and the first client paint) it renders only a
 * splash, then mounts the real tree. This guarantees no client component reads
 * `localStorage` during server render (which would throw) and that the server
 * HTML matches the first client render (no hydration mismatch).
 */

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AgentProvider } from "@/contexts/AgentContext";
import { Toaster } from "@/components/ui/toaster";

/** Provides the active-branch context once auth has resolved the agent list. */
function AgentLayer({ children }: { children: React.ReactNode }) {
  const { agents } = useAuth();
  return <AgentProvider agents={agents}>{children}</AgentProvider>;
}

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-soft">
      <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );

  const [mounted, setMounted] = useState(false);
  // Intentional one-shot client-mount gate: render the authed subtree (which
  // reads localStorage) only after hydration. The lint rule doesn't special-case
  // this canonical pattern, so the disable is deliberate.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Splash />;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AgentLayer>{children}</AgentLayer>
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
