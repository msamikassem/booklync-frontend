"use client";

/**
 * Guards authenticated routes. Redirects to /login if no token is stored.
 * Redirects staff-only users away from the full dashboard, and managers away
 * from the staff-only view.
 *
 * Auth is client-side (localStorage), so this is a client guard: it reads the
 * token during render (safe — it only ever renders client-side, under the
 * mount-gate in app/(app)/layout.tsx) and performs redirects in an effect.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { storage } from "../../auth/storage";
import { useAuth, isStaffOnlyUser } from "../../contexts/AuthContext";

interface Props {
  children: React.ReactNode;
  /** "dashboard" = full dashboard, "staff" = staff-only view */
  role?: "dashboard" | "staff";
}

export default function RouteGuard({ children, role }: Props) {
  const router = useRouter();
  const token = storage.getAccess();
  const { me, isLoading } = useAuth();

  // Decide whether (and where) to redirect.
  let redirectTo: string | null = null;
  if (!token) {
    redirectTo = "/login";
  } else if (me) {
    const staffOnly = isStaffOnlyUser(me);
    if (role === "dashboard" && staffOnly) redirectTo = "/staff";
    if (role === "staff" && !staffOnly) redirectTo = "/dashboard";
  }

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (!token) return null;
  if (isLoading && me == null) return null; // identity loading — avoid flash
  if (redirectTo) return null; // redirect in flight

  return <>{children}</>;
}
