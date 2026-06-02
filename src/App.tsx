import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import Placeholder from "./pages/Placeholder";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function AppRoutes() {
  const { agents } = useAuth();

  return (
    <AgentProvider agents={agents}>
      <Routes>
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
          <Route path="appointments" element={<Placeholder name="Appointments" />} />
          <Route path="calendar" element={<Placeholder name="Calendar" />} />
          <Route path="branches" element={<Placeholder name="Branches" />} />
          <Route path="employees" element={<Placeholder name="Employees" />} />
          <Route path="services" element={<Services />} />
          <Route path="sales" element={<Placeholder name="Sales" />} />
          <Route path="team" element={<Placeholder name="Team" />} />
          <Route path="booking-page" element={<Placeholder name="Booking Page" />} />
          <Route path="conversations" element={<Placeholder name="Conversations" />} />
          <Route path="ai-agent" element={<Placeholder name="AI Agent" />} />
        </Route>

        {/* Staff own-calendar view */}
        <Route
          path="/staff"
          element={
            <RouteGuard role="staff">
              <Placeholder name="Staff Dashboard" />
            </RouteGuard>
          }
        />

        {/* Accept invite — unauthenticated */}
        <Route path="/accept-invite" element={<Placeholder name="Accept Invite" />} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AgentProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
