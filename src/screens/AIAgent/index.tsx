import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { useAgent } from "../../contexts/AgentContext";
import { agents as agentsApi } from "../../api";
import { automationsApi, type NotifRule } from "./api";
import { formatApiError } from "../../lib/errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "../../lib/utils";
import type { ApiError, AgentResponse } from "../../api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Bell, Bot } from "lucide-react";

const MODEL_PRESETS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001", "gpt-4o", "gpt-4o-mini"];

function windowLabel(mins: number): string {
  if (mins % 1440 === 0) return `${mins / 1440} day${mins / 1440 > 1 ? "s" : ""} before`;
  if (mins % 60 === 0) return `${mins / 60} hour${mins / 60 > 1 ? "s" : ""} before`;
  return `${mins} min before`;
}

export default function AIAgent() {
  const { me } = useAuth();
  const { activeAgent } = useAgent();

  const canManage = !!me && (me.is_owner || me.permissions.includes("manage_branches"));
  const canMessage = !!me && (me.is_owner || me.permissions.includes("message_customers"));

  if (!activeAgent) return <p className="text-sm text-muted px-6 py-4">No branch selected.</p>;

  return (
    <div className="px-6 pb-6 max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">AI agent</h1>
        <p className="text-sm text-muted">How your AI receptionist talks to customers at {activeAgent.agent_name}.</p>
      </div>

      <SettingsForm key={activeAgent.id} agent={activeAgent} canManage={canManage} />

      {canMessage && <Automations />}
    </div>
  );
}

function SettingsForm({ agent, canManage }: { agent: AgentResponse; canManage: boolean }) {
  const { refetchAgents } = useAuth();
  const { setActiveAgent } = useAgent();
  const { toast } = useToast();

  const [model, setModel] = useState(agent.model ?? "");
  const [welcome, setWelcome] = useState(agent.sms_welcome_message ?? "");
  const [behavior, setBehavior] = useState(agent.sms_post_welcome_behavior ?? "ai");
  const [err, setErr] = useState<string | null>(null);

  const dirty = model !== (agent.model ?? "") || welcome !== (agent.sms_welcome_message ?? "") || behavior !== (agent.sms_post_welcome_behavior ?? "ai");

  const save = useMutation({
    mutationFn: () => agentsApi.update(agent.id, {
      model: model.trim() || null,
      sms_welcome_message: welcome.trim() || null,
      sms_post_welcome_behavior: behavior,
    }),
    onSuccess: (updated) => { setActiveAgent(updated); refetchAgents(); setErr(null); toast({ description: "AI settings saved." }); },
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not save settings.")),
  });

  const provider = model.startsWith("gpt") ? "OpenAI" : model.startsWith("claude") ? "Anthropic" : null;

  return (
    <section className="bg-canvas rounded-xl border border-hairline p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted" />
        <h2 className="text-sm font-semibold text-ink">Conversation settings</h2>
      </div>

      {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

      {/* Model */}
      <div className="grid gap-1.5">
        <Label htmlFor="ai-model">AI model</Label>
        <Input id="ai-model" value={model} onChange={e => setModel(e.target.value)} disabled={!canManage}
          placeholder="claude-sonnet-4-6" className="font-mono text-sm" />
        <div className="flex flex-wrap items-center gap-1.5">
          {provider && <span className="text-xs text-muted">Provider: <span className="text-ink">{provider}</span></span>}
          {canManage && (
            <div className="flex flex-wrap gap-1 ml-auto">
              {MODEL_PRESETS.map(m => (
                <button key={m} type="button" onClick={() => setModel(m)}
                  className={cn("text-[11px] font-mono rounded px-1.5 py-0.5 border transition-colors",
                    model === m ? "border-primary bg-primary/5 text-primary" : "border-hairline text-muted hover:text-ink")}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SMS welcome */}
      <div className="grid gap-1.5">
        <Label htmlFor="ai-welcome">SMS welcome message</Label>
        <textarea id="ai-welcome" value={welcome} onChange={e => setWelcome(e.target.value)} disabled={!canManage}
          rows={3} placeholder="Hi! Thanks for texting {business}. How can I help you book today?"
          className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-60 resize-y" />
        <p className="text-xs text-muted">Sent automatically the first time a customer texts your number.</p>
      </div>

      {/* Post-welcome behavior */}
      <div className="grid gap-1.5 max-w-xs">
        <Label>After the welcome message</Label>
        <Select value={behavior} onValueChange={setBehavior} disabled={!canManage}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ai">AI replies and handles booking</SelectItem>
            <SelectItem value="silent">Stay silent (no AI replies)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {canManage && (
        <div className="flex justify-end">
          <Button disabled={!dirty || save.isPending} onClick={() => { setErr(null); save.mutate(); }}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </section>
  );
}

function Automations() {
  const rulesQ = useQuery({ queryKey: ["notif-rules"], queryFn: () => automationsApi.rules(), staleTime: 10 * 60_000 });
  const tplQ = useQuery({ queryKey: ["notif-templates"], queryFn: () => automationsApi.templates(), staleTime: 10 * 60_000 });

  const rules: NotifRule[] = rulesQ.data ?? [];

  return (
    <section className="bg-canvas rounded-xl border border-hairline p-5">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="h-4 w-4 text-muted" />
        <h2 className="text-sm font-semibold text-ink">Automated reminders</h2>
      </div>
      <p className="text-sm text-muted mb-4">When the system automatically texts customers about their appointments. These windows apply to every branch.</p>

      <div className="flex flex-wrap gap-2 mb-5">
        {rules.length === 0 && <span className="text-sm text-muted">No reminder rules.</span>}
        {rules.map(r => (
          <span key={r.template_key} className={cn(
            "inline-flex items-center gap-1.5 text-xs rounded-full border px-2.5 py-1",
            r.enabled ? "bg-surface-soft border-hairline" : "border-hairline opacity-50")}>
            <span className="font-medium text-ink">{r.name}</span>
            <span className="text-muted">· {windowLabel(r.minutes_before)}</span>
          </span>
        ))}
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-ink list-none flex items-center gap-1.5">
          <span className="text-muted group-open:rotate-90 transition-transform">▸</span>
          Message templates ({tplQ.data?.length ?? 0})
        </summary>
        <div className="mt-3 space-y-2">
          {(tplQ.data ?? []).map(t => (
            <div key={t.key} className="rounded-lg border border-hairline p-3">
              <div className="text-xs font-mono text-primary mb-1">{t.key}</div>
              <p className="text-sm text-muted">{t.preview}</p>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
