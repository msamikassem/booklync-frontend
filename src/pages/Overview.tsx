import { useAuth } from "../contexts/AuthContext";
import { useAgent } from "../contexts/AgentContext";

export default function Overview() {
  const { me } = useAuth();
  const { activeAgent } = useAgent();

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-semibold text-ink">
          Welcome{me ? `, ${me.is_owner ? me.business_name : me.employee_name ?? me.email}` : ""}
        </h2>
        {activeAgent && (
          <p className="text-muted text-sm mt-1">
            Viewing: <span className="font-medium text-ink">{activeAgent.agent_name}</span>
            {activeAgent.location_name ? ` — ${activeAgent.location_name}` : ""}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Today's Appointments", value: "—" },
          { label: "Pending Bookings", value: "—" },
          { label: "Active Customers", value: "—" },
        ].map((card) => (
          <div key={card.label} className="bg-canvas rounded-xl p-6 shadow-sm border border-hairline">
            <div className="text-sm text-muted mb-2">{card.label}</div>
            <div className="font-display text-3xl font-semibold text-ink">{card.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
