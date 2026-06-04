"use client";

/**
 * Dashboard shell — sidebar + topbar + content area.
 * Mirrors the dash-layout / dash-sidebar / dash-topbar structure from dashboard.html.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { useAgent } from "../../contexts/AgentContext";

function BranchClock({ tz }: { tz: string | null | undefined }) {
  const [display, setDisplay] = useState("");
  const [tzShort, setTzShort] = useState("");

  useEffect(() => {
    if (!tz) { setDisplay(""); return; }
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
    });
    const tzFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" });
    setTzShort(tzFmt.formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value ?? "");
    const tick = () => setDisplay(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tz]);

  if (!display) return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "0 14px", height: 34,
      background: "var(--surface-soft)", borderRadius: 999, userSelect: "none", cursor: "default" }}>
      <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12.5, fontWeight: 500,
        color: "var(--ink)", letterSpacing: "0.01em" }}>{display}</span>
      {tzShort && <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 500 }}>{tzShort}</span>}
    </div>
  );
}

// ── Permission helpers ────────────────────────────────────────────────────────

function useCan() {
  const { me } = useAuth();
  return function can(...perms: string[]): boolean {
    if (!me) return false;
    if (me.is_owner) return true;
    return perms.some((p) => me.permissions.includes(p));
  };
}

// ── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({
  to,
  icon,
  label,
  show = true,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  show?: boolean;
}) {
  const pathname = usePathname();
  if (!show) return null;
  const isActive = pathname === to;
  return (
    <li>
      <Link
        href={to}
        className={[
          "flex items-center gap-2.5 h-[38px] px-2.5 rounded-md text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/25 text-blue-300"
            : "text-white/55 hover:bg-white/[0.06] hover:text-white/90",
        ].join(" ")}
      >
        <span className="flex-shrink-0 opacity-70">{icon}</span>
        {label}
      </Link>
    </li>
  );
}

// ── Branch picker dropdown ────────────────────────────────────────────────────

function BranchPicker() {
  const { agents } = useAuth();
  const { activeAgent, setActiveAgent } = useAgent();
  const [open, setOpen] = useState(false);

  if (agents.length <= 1) {
    return (
      <div className="inline-flex items-center gap-1.5 h-9 px-3 border border-hairline rounded-md bg-canvas text-sm text-ink">
        <LocationIcon />
        <span>{activeAgent?.agent_name ?? "Loading…"}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 h-9 px-3 border border-hairline rounded-md bg-canvas text-sm text-ink hover:border-primary/50 transition-colors"
      >
        <LocationIcon />
        <span>{activeAgent?.agent_name ?? "Loading…"}</span>
        <ChevronIcon />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-canvas rounded-lg shadow-lg border border-hairline z-50 py-1">
            {agents.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setActiveAgent(a); setOpen(false); }}
                className={[
                  "w-full text-left px-3 py-2 text-sm transition-colors",
                  a.id === activeAgent?.id
                    ? "text-primary font-medium bg-primary/5"
                    : "text-ink hover:bg-surface-soft",
                ].join(" ")}
              >
                {a.agent_name}
                {a.location_name && (
                  <span className="block text-xs text-muted">{a.location_name}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { me, logout } = useAuth();
  const { activeAgent } = useAgent();
  const can = useCan();
  const pathname = usePathname();

  // Display name: owner shows business name, everyone else shows employee name or email
  const displayName = me?.is_owner
    ? me.business_name
    : me?.employee_name ?? me?.email ?? "…";

  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  // Page title from route
  const routeLabel: Record<string, string> = {
    "/dashboard": "Overview",
    "/dashboard/customers": "Customers",
    "/dashboard/appointments": "Appointments",
    "/dashboard/calendar": "Calendar",
    "/dashboard/branches": "Branches",
    "/dashboard/employees": "Employees",
    "/dashboard/services": "Services",
    "/dashboard/sales": "Sales",
    "/dashboard/team": "Team",
    "/dashboard/booking-page": "Booking Page",
  };
  const pageTitle = routeLabel[pathname] ?? "Dashboard";

  return (
    <div className="grid min-h-screen" style={{ gridTemplateColumns: "240px minmax(0,1fr)" }}>
      {/* ── Sidebar ── */}
      <aside
        className="sticky top-0 h-screen overflow-y-auto border-r border-white/[0.06]"
        style={{ background: "var(--surface-dark)" }}
      >
        <div className="flex flex-col h-full px-4 py-6">
          {/* Brand */}
          <Link href="/dashboard" className="inline-flex items-center gap-2.5 font-display font-semibold text-lg text-white tracking-tight mb-8 px-2">
            <svg width="26" height="26" viewBox="0 0 100 100">
              <rect width="100" height="100" rx="22" fill="#2563EB" />
              <rect x="28" y="28" width="44" height="44" rx="8" fill="none" stroke="white" strokeWidth="6" />
            </svg>
            Booklync
          </Link>

          {/* Nav */}
          <nav className="flex-1">
            <span className="block text-[11px] font-semibold text-white/30 uppercase tracking-widest px-2 mb-1">
              Main
            </span>
            <ul className="grid gap-0.5 mb-2">
              <NavItem to="/dashboard" icon={<OverviewIcon />} label="Overview" />
              <NavItem
                to="/dashboard/calendar"
                icon={<CalendarIcon />}
                label="Calendar"
                show={can("view_branch_calendar")}
              />
              <NavItem
                to="/dashboard/appointments"
                icon={<AppointmentIcon />}
                label="Appointments"
                show={can("view_branch_calendar")}
              />
              <NavItem
                to="/dashboard/customers"
                icon={<CustomersIcon />}
                label="Customers"
                show={can("view_customers")}
              />
              <NavItem to="/dashboard/conversations" icon={<ConversationsIcon />} label="Conversations" />
              <NavItem
                to="/dashboard/sales"
                icon={<SalesIcon />}
                label="Sales"
                show={can("view_financials", "manage_discounts", "manage_commissions")}
              />
            </ul>

            <span className="block text-[11px] font-semibold text-white/30 uppercase tracking-widest px-2 mb-1 mt-6">
              Manage
            </span>
            <ul className="grid gap-0.5 mb-2">
              <NavItem
                to="/dashboard/branches"
                icon={<BranchIcon />}
                label="Branches"
                show={can("manage_employees", "manage_services", "manage_schedules", "manage_branches")}
              />
              <NavItem
                to="/dashboard/employees"
                icon={<EmployeesIcon />}
                label="Employees"
                show={can("manage_employees", "edit_employee_details", "toggle_employee_status")}
              />
              <NavItem
                to="/dashboard/services"
                icon={<ServicesIcon />}
                label="Services"
                show={can("manage_services")}
              />
              <NavItem
                to="/dashboard/booking-page"
                icon={<BookingPageIcon />}
                label="Booking Page"
                show={can("manage_branches")}
              />
            </ul>

            <span className="block text-[11px] font-semibold text-white/30 uppercase tracking-widest px-2 mb-1 mt-6">
              Configure
            </span>
            <ul className="grid gap-0.5">
              <NavItem to="/dashboard/ai-agent" icon={<AgentIcon />} label="AI Agent" />
              <NavItem
                to="/dashboard/team"
                icon={<TeamIcon />}
                label="Team"
                show={can("manage_users")}
              />
            </ul>
          </nav>

          {/* User footer */}
          <div className="flex items-center gap-2.5 px-2 pt-4 border-t border-white/[0.06] mt-4">
            <div
              className="w-8 h-8 rounded-full grid place-items-center text-xs font-semibold text-white flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #2563EB, #7C3AED)" }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">{displayName}</div>
              <div className="flex items-center gap-1.5 min-w-0">
                {me?.subscription_plan && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-px rounded-full bg-white/10 text-white/45 flex-shrink-0">
                    {me.subscription_plan}
                  </span>
                )}
                <span className="text-[11px] text-white/40 truncate">{me?.email}</span>
              </div>
            </div>
            <button
              onClick={logout}
              title="Log out"
              className="w-7 h-7 rounded-md grid place-items-center text-white/35 hover:bg-white/[0.08] hover:text-white/80 transition-colors flex-shrink-0"
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-8 h-14 bg-canvas border-b border-hairline">
          <h1 className="font-display text-lg font-semibold text-ink">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <BranchClock tz={activeAgent?.timezone} />
            <BranchPicker />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-8 bg-surface-soft">
          {children}
        </main>
      </div>
    </div>
  );
}

// ── Icons (inline SVG — no extra dep) ────────────────────────────────────────

const s = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function OverviewIcon() { return <svg {...s}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>; }
function CalendarIcon() { return <svg {...s}><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/><path d="M16 2v4M8 2v4M3 10h13"/><circle cx="17.5" cy="17.5" r="4.5"/><path d="M17.5 15.5v2l1.5 1"/></svg>; }
function AppointmentIcon() { return <svg {...s}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function CustomersIcon() { return <svg {...s}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function ConversationsIcon() { return <svg {...s}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>; }
function SalesIcon() { return <svg {...s}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>; }
function BranchIcon() { return <svg {...s}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>; }
function EmployeesIcon() { return <svg {...s}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function ServicesIcon() { return <svg {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>; }
function BookingPageIcon() { return <svg {...s}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>; }
function AgentIcon() { return <svg {...s}><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>; }
function TeamIcon() { return <svg {...s}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function LogoutIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
function LocationIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>; }
function ChevronIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>; }
