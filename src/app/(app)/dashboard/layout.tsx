"use client";

import RouteGuard from "@/components/layout/RouteGuard";
import DashboardShell from "@/components/layout/DashboardShell";

/**
 * Full-dashboard layout — owners, branch managers, receptionists. RouteGuard
 * bounces unauthenticated visitors to /login and staff-only users to /staff;
 * DashboardShell renders the sidebar/topbar chrome around the active screen.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard role="dashboard">
      <DashboardShell>{children}</DashboardShell>
    </RouteGuard>
  );
}
