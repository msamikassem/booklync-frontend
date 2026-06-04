"use client";

import RouteGuard from "@/components/layout/RouteGuard";
import StaffDashboard from "@/screens/Staff";

/**
 * Staff own-calendar view. RouteGuard bounces full-dashboard users to
 * /dashboard; StaffDashboard renders its own slim top bar (no DashboardShell).
 */
export default function StaffPage() {
  return (
    <RouteGuard role="staff">
      <StaffDashboard />
    </RouteGuard>
  );
}
