import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { useAgent } from "../../contexts/AgentContext";
import { bookingPageApi } from "./api";
import { formatApiError } from "../../lib/errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "../../lib/utils";
import type { ApiError } from "../../api/types";
import type { AgentResponse } from "../../api/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Globe, Check, Trash2, RefreshCw } from "lucide-react";

const DEFAULT_CNAME = "cname.booklync.com";

type DomainState = "disconnected" | "pending" | "connected";

export default function BookingPage() {
  const { me, refetchAgents } = useAuth();
  const { activeAgent } = useAgent();

  const canManage = !!me && (me.is_owner || me.permissions.includes("manage_branches"));

  const slug = activeAgent?.booking_page_slug ?? "";
  const bookUrl = slug ? `${window.location.origin}/b/${slug}` : "";
  const displayUrl = slug ? `${window.location.host}/b/${slug}` : "";
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!bookUrl) return;
    navigator.clipboard.writeText(bookUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  if (!activeAgent) return <p className="text-sm text-muted px-6 py-4">No branch selected.</p>;

  // When already connected+verified, the live link is the custom domain.
  const connectedDomain = activeAgent.domain_verified ? activeAgent.custom_domain : null;
  const liveUrl = connectedDomain ? `https://${connectedDomain}` : bookUrl;
  const liveDisplay = connectedDomain ?? displayUrl;

  return (
    <div className="px-6 pb-6 max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Booking page</h1>
        <p className="text-sm text-muted">Share this link so customers can book online with {activeAgent.agent_name}.</p>
      </div>

      {/* Public URL */}
      <section className="bg-canvas rounded-xl border border-hairline p-5">
        <h2 className="text-sm font-semibold text-ink mb-3">Your booking link</h2>
        {slug ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-[200px] text-sm bg-surface-soft border border-hairline rounded-md px-3 h-10 inline-flex items-center text-ink truncate">{liveDisplay}</code>
            <Button variant="outline" className="gap-1.5 h-10" onClick={copy}>
              {copied ? <><Check className="h-3.5 w-3.5 text-green-600" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </Button>
            <Button variant="outline" className="gap-1.5 h-10" asChild>
              <a href={liveUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Open</a>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">This branch doesn’t have a booking-page slug yet.</p>
        )}
      </section>

      {/* Booking confirmation — keyed by branch so switching resets cleanly. */}
      <ConfirmationCard key={`conf-${activeAgent.id}`} agent={activeAgent} canManage={canManage} refetchAgents={refetchAgents} />

      {/* Custom domain — keyed by branch so switching branches resets cleanly. */}
      <DomainCard key={activeAgent.id} agent={activeAgent} canManage={canManage} refetchAgents={refetchAgents} />
    </div>
  );
}

function ConfirmationCard({ agent, canManage, refetchAgents }: {
  agent: AgentResponse; canManage: boolean; refetchAgents: () => void;
}) {
  const { toast } = useToast();
  const [autoConfirm, setAutoConfirm] = useState(agent.public_booking_auto_confirm ?? false);

  const save = useMutation({
    mutationFn: (v: boolean) => bookingPageApi.updateAgent(agent.id, { public_booking_auto_confirm: v }),
    onSuccess: (_d, v) => {
      setAutoConfirm(v); refetchAgents();
      toast({ description: v ? "New bookings will be auto-confirmed." : "New bookings will need your approval." });
    },
    onError: () => toast({ description: "Could not save the setting." }),
  });

  return (
    <section className="bg-canvas rounded-xl border border-hairline p-5">
      <h2 className="text-sm font-semibold text-ink mb-1">Online booking confirmation</h2>
      <p className="text-sm text-muted mb-4">Choose what happens when a customer books from your site.</p>

      <div className="space-y-2">
        <Choice
          active={!autoConfirm} disabled={!canManage || save.isPending}
          title="Require my approval" desc="Bookings arrive as “pending”. You confirm them from the calendar. No text is sent until you do."
          onClick={() => !autoConfirm || save.mutate(false)}
        />
        <Choice
          active={autoConfirm} disabled={!canManage || save.isPending}
          title="Auto-confirm bookings" desc="Bookings are confirmed instantly and the customer gets a confirmation text."
          onClick={() => autoConfirm || save.mutate(true)}
        />
      </div>

      {autoConfirm && (
        <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Auto-confirm texts the customer automatically. We recommend turning on spam protection
          (Turnstile) before using it on a public site.
        </p>
      )}
    </section>
  );
}

function Choice({ active, disabled, title, desc, onClick }: {
  active: boolean; disabled: boolean; title: string; desc: string; onClick: () => void;
}) {
  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border px-4 py-3 transition-colors disabled:opacity-60",
        active ? "border-primary bg-primary/5" : "border-hairline hover:bg-surface-soft",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("h-4 w-4 rounded-full border-2 grid place-items-center shrink-0", active ? "border-primary" : "border-hairline")}>
          {active && <span className="h-2 w-2 rounded-full bg-primary" />}
        </span>
        <span className="text-sm font-medium text-ink">{title}</span>
      </div>
      <p className="text-xs text-muted mt-1 ml-6">{desc}</p>
    </button>
  );
}

function DomainCard({ agent, canManage, refetchAgents }: {
  agent: AgentResponse; canManage: boolean; refetchAgents: () => void;
}) {
  const { toast } = useToast();
  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const agentId = agent.id;

  // Seeded once from the agent (the parent remounts this via key on branch change).
  const [domain, setDomain] = useState(agent.custom_domain ?? "");
  const [verified, setVerified] = useState(agent.domain_verified ?? false);
  const [cname, setCname] = useState(DEFAULT_CNAME);
  const [input, setInput] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const state: DomainState = !domain ? "disconnected" : verified ? "connected" : "pending";
  const onErr = (e: unknown) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Something went wrong."));

  const connect = useMutation({
    mutationFn: () => bookingPageApi.connectDomain(agentId, input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "")),
    onSuccess: (d) => { setDomain(d.domain); setCname(d.cname_target); setVerified(d.verified); setErr(null); refetchAgents(); },
    onError: onErr,
  });
  const verify = useMutation({
    mutationFn: (force: boolean) => bookingPageApi.verifyDomain(agentId, force),
    onSuccess: (d) => {
      setCname(d.cname_target); setVerified(d.verified); setErr(null); refetchAgents();
      toast({ description: d.verified ? "Domain verified — your booking page is live on it." : "DNS not detected yet. Add the CNAME record and allow a few minutes to propagate." });
    },
    onError: onErr,
  });
  const remove = useMutation({
    mutationFn: () => bookingPageApi.removeDomain(agentId),
    onSuccess: () => { setDomain(""); setVerified(false); setInput(""); setErr(null); refetchAgents(); toast({ description: "Custom domain removed." }); },
    onError: onErr,
  });

  const dnsHost = useMemo(() => {
    if (!domain) return "@";
    return domain.split(".").length > 2 ? domain.split(".")[0] : "@";
  }, [domain]);

  const busy = connect.isPending || verify.isPending || remove.isPending;

  return (
    <section className="bg-canvas rounded-xl border border-hairline p-5">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="h-4 w-4 text-muted" />
        <h2 className="text-sm font-semibold text-ink">Custom domain</h2>
      </div>
      <p className="text-sm text-muted mb-4">Use your own web address (e.g. <code className="text-xs">book.yoursalon.com</code>) instead of the default link.</p>

      {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">{err}</p>}

      {!canManage ? (
        <p className="text-sm text-muted">{domain ? <>Connected to <strong className="text-ink">{domain}</strong>{verified ? " (verified)." : " (pending verification)."}</> : "You don’t have permission to manage the custom domain."}</p>
      ) : state === "disconnected" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)} placeholder="book.yourdomain.com"
            spellCheck={false} autoComplete="off" className="flex-1 min-w-[220px] h-10" />
          <Button className="h-10" disabled={busy || !input.includes(".")} onClick={() => { setErr(null); connect.mutate(); }}>
            {connect.isPending ? "Connecting…" : "Connect"}
          </Button>
        </div>
      ) : state === "pending" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 px-2.5 py-1">Pending DNS</span>
            <span className="text-sm font-medium text-ink">{domain}</span>
          </div>
          <div className="rounded-lg bg-surface-soft border border-hairline p-4">
            <p className="text-xs text-muted mb-2">Add this <strong>CNAME</strong> record at your domain registrar, then verify:</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm font-mono">
              <span className="text-muted">Type</span><span className="text-ink">CNAME</span>
              <span className="text-muted">Name</span><span className="text-ink">{dnsHost}</span>
              <span className="text-muted">Value</span><span className="text-ink break-all">{cname}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="gap-1.5" disabled={busy} onClick={() => { setErr(null); verify.mutate(false); }}>
              <RefreshCw className={cn("h-3.5 w-3.5", verify.isPending && "animate-spin")} /> {verify.isPending ? "Checking…" : "Verify DNS"}
            </Button>
            {isLocalhost && (
              <Button variant="outline" disabled={busy} onClick={() => { setErr(null); verify.mutate(true); }}>Force verify (dev)</Button>
            )}
            <Button variant="ghost" className="text-muted hover:text-error gap-1.5 ml-auto" disabled={busy} onClick={() => remove.mutate()}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full bg-green-100 text-green-800 px-2.5 py-1"><Check className="h-3 w-3" /> Connected</span>
          <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-ink hover:text-primary inline-flex items-center gap-1">{domain} <ExternalLink className="h-3 w-3" /></a>
          <Button variant="ghost" className="text-muted hover:text-error gap-1.5 ml-auto" disabled={busy} onClick={() => remove.mutate()}>
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        </div>
      )}
    </section>
  );
}
