/**
 * Instant loading state for every /dashboard/* tab.
 *
 * Next App Router blocks a navigation until the target route is fully ready
 * UNLESS the segment has a loading.tsx — this Suspense fallback renders the
 * moment a tab is clicked (inside the persistent sidebar/topbar shell), so
 * navigation feels instant instead of freezing on the previous page while the
 * route's code + data load. Matches the screens' content padding.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="h-7 w-44 rounded-md bg-hairline mb-6" />
      <div className="grid gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-hairline-soft" />
        ))}
      </div>
    </div>
  );
}
