/**
 * Guards authenticated routes. Redirects to /login if no token stored.
 * Redirects staff-only users away from the full dashboard, and managers
 * away from the staff-only view.
 */

import { Navigate } from "react-router-dom";
import { storage } from "../../auth/storage";
import { useAuth, isStaffOnlyUser } from "../../contexts/AuthContext";

interface Props {
  children: React.ReactNode;
  /** "dashboard" = full dashboard, "staff" = staff-only view */
  role?: "dashboard" | "staff";
}

export default function RouteGuard({ children, role }: Props) {
  const token = storage.getAccess();

  if (!token) return <Navigate to="/login" replace />;

  const { me, isLoading } = useAuth();

  // While identity loads, show nothing (avoids flash redirect)
  if (isLoading && me == null) return null;

  if (me) {
    const staffOnly = isStaffOnlyUser(me);
    if (role === "dashboard" && staffOnly) return <Navigate to="/staff" replace />;
    if (role === "staff" && !staffOnly) return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
