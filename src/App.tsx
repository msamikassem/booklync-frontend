import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
import { AgentProvider } from "./contexts/AgentContext";
import { useAuth } from "./contexts/AuthContext";
import RouteGuard from "./components/layout/RouteGuard";
import DashboardShell from "./components/layout/DashboardShell";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Customers from "./pages/Customers";
import Services from "./pages/Services";
import Branches from "./pages/Branches";
import Employees from "./pages/Employees";
import Appointments from "./pages/Appointments";
import Calendar from "./pages/Calendar";
import Sales from "./pages/Sales";
import StaffDashboard from "./pages/Staff";
import AcceptInvite from "./pages/AcceptInvite";
import Conversations from "./pages/Conversations";
import BookingPage from "./pages/BookingPage";
import Team from "./pages/Team";
import AIAgent from "./pages/AIAgent";
import PublicBooking from "./pages/PublicBooking";
import { Toaster } from "@/components/ui/toaster";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

// Hostnames that belong to Booklync itself (the dashboard host). Anything else
// is treated as a customer's verified custom domain, where the whole app IS the
// public booking page (no router, no auth). Raw IPs (LAN dev) and *.vercel.app
// count as Booklync hosts so the dashboard stays reachable there — preview a
// booking page via /b/:slug.
const BOOKLYNC_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "booklync.com",
  "www.booklync.com",
]);

function isBooklyncHost(h: string): boolean {
  return (
    BOOKLYNC_HOSTS.has(h) ||
    h.endsWith(".vercel.app") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(h)
  );
}

/** Provides the active-branch context once auth has resolved the agent list. */
function AgentLayer() {
  const { agents } = useAuth();
  return (
    <AgentProvider agents={agents}>
      <Outlet />
    </AgentProvider>
  );
}

/** Wraps every authenticated route in the auth + agent providers. */
function AuthBoundary() {
  return (
    <AuthProvider>
      <AgentLayer />
    </AuthProvider>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public, unauthenticated booking page — rendered OUTSIDE AuthProvider. */}
      <Route path="/b/:slug" element={<PublicBooking />} />

      {/* Everything else is the authenticated dashboard app. */}
      <Route element={<AuthBoundary />}>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Full dashboard — business owners, managers, receptionists */}
        <Route
          path="/dashboard"
          element={
            <RouteGuard role="dashboard">
              <DashboardShell />
            </RouteGuard>
          }
        >
          <Route index element={<Overview />} />
          <Route path="customers" element={<Customers />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="branches" element={<Branches />} />
          <Route path="employees" element={<Employees />} />
          <Route path="services" element={<Services />} />
          <Route path="sales" element={<Sales />} />
          <Route path="team" element={<Team />} />
          <Route path="booking-page" element={<BookingPage />} />
          <Route path="conversations" element={<Conversations />} />
          <Route path="ai-agent" element={<AIAgent />} />
        </Route>

        {/* Staff own-calendar view */}
        <Route
          path="/staff"
          element={
            <RouteGuard role="staff">
              <StaffDashboard />
            </RouteGuard>
          }
        />

        {/* Accept invite — unauthenticated form, but lives under the providers */}
        <Route path="/accept-invite" element={<AcceptInvite />} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  // On a customer's custom domain the entire app is the public booking page.
  const onCustomDomain =
    typeof window !== "undefined" && !isBooklyncHost(window.location.hostname);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{onCustomDomain ? <PublicBooking /> : <AppRoutes />}</BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
