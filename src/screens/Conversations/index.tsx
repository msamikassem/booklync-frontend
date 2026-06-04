import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { useAgent } from "../../contexts/AgentContext";
import { conversationsApi, type ConvMessage } from "./api";
import { cn } from "../../lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MessageSquare, Trash2, Phone } from "lucide-react";

const CHANNEL_LABEL: Record<string, string> = { sms: "SMS", call: "Call", phone_call: "Call", whatsapp: "WhatsApp", web: "Web", booking_page: "Web" };
const CHANNEL_BADGE: Record<string, string> = {
  sms: "bg-blue-100 text-blue-800", whatsapp: "bg-green-100 text-green-800",
  call: "bg-purple-100 text-purple-800", phone_call: "bg-purple-100 text-purple-800",
  web: "bg-gray-100 text-gray-600", booking_page: "bg-gray-100 text-gray-600",
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function Conversations() {
  const { me } = useAuth();
  const { activeAgentId } = useAgent();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const canView = !!me && (me.is_owner || me.permissions.includes("view_customers"));

  const { data: conversations = [], isLoading, isError } = useQuery({
    queryKey: ["conversations", activeAgentId],
    queryFn: () => conversationsApi.list(activeAgentId as number),
    enabled: !!activeAgentId && canView,
    staleTime: 30 * 1000,
  });

  const { data: history, isLoading: histLoading } = useQuery({
    queryKey: ["conversation", selectedId],
    queryFn: () => conversationsApi.get(selectedId as number),
    enabled: selectedId != null,
    staleTime: 30 * 1000,
  });

  const clearMut = useMutation({
    mutationFn: (id: number) => conversationsApi.clear(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations", activeAgentId] });
      setSelectedId(null);
      toast({ description: "Conversation cleared." });
    },
    onError: () => toast({ variant: "destructive", description: "Could not clear the conversation." }),
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(c =>
      (c.customer_name ?? "").toLowerCase().includes(q) || (c.customer_phone ?? "").includes(q));
  }, [conversations, search]);

  if (!activeAgentId) return <p className="text-sm text-muted px-6 py-4">No branch selected.</p>;
  if (!canView) return <p className="text-sm text-muted px-6 py-4">You don't have access to conversations.</p>;

  const messages: ConvMessage[] = (history?.messages as unknown as ConvMessage[]) ?? [];

  return (
    <div className="px-6 pb-6 h-[calc(100vh-3.5rem)]">
      <div className="grid grid-cols-1 md:grid-cols-[20rem_1fr] gap-4 h-full">
        {/* List pane */}
        <div className="flex flex-col bg-canvas rounded-xl border border-hairline overflow-hidden min-h-0">
          <div className="p-3 border-b border-hairline">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none h-3.5 w-3.5" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…" className="pl-9 h-9" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading && <p className="text-sm text-muted p-4 text-center">Loading…</p>}
            {isError && <p className="text-sm text-error p-4">Could not load conversations.</p>}
            {!isLoading && !isError && visible.length === 0 && (
              <div className="p-6 text-center">
                <MessageSquare className="h-7 w-7 text-muted mx-auto mb-2" />
                <p className="text-sm text-muted">{search ? "No matches." : "No conversations yet."}</p>
              </div>
            )}
            {visible.map(c => (
              <button key={c.conversation_id} onClick={() => setSelectedId(c.conversation_id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-hairline last:border-0 transition-colors",
                  selectedId === c.conversation_id ? "bg-primary/5" : "hover:bg-surface-soft",
                )}>
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-medium text-ink text-sm truncate">{c.customer_name || c.customer_phone || "Unknown"}</span>
                  <span className={cn("shrink-0 text-[10px] font-medium rounded-full px-1.5 py-0.5", CHANNEL_BADGE[c.channel] ?? "bg-gray-100 text-gray-600")}>
                    {CHANNEL_LABEL[c.channel] ?? c.channel}
                  </span>
                </div>
                <p className="text-xs text-muted truncate">{c.last_message ?? "No messages"}</p>
                <p className="text-[11px] text-muted/70 mt-0.5">{fmtWhen(c.created_at)} · {c.total_messages} msg</p>
              </button>
            ))}
          </div>
        </div>

        {/* Thread pane */}
        <div className="flex flex-col bg-canvas rounded-xl border border-hairline overflow-hidden min-h-0">
          {selectedId == null ? (
            <div className="flex-1 grid place-items-center text-center p-8">
              <div>
                <MessageSquare className="h-8 w-8 text-muted mx-auto mb-3" />
                <p className="text-sm text-muted">Select a conversation to read the full thread.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-hairline">
                <div className="min-w-0">
                  <div className="font-semibold text-ink truncate">{history?.customer_name || history?.customer_phone || "Conversation"}</div>
                  {history?.customer_phone && (
                    <div className="text-xs text-muted flex items-center gap-1"><Phone className="h-3 w-3" /> {history.customer_phone}</div>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="text-muted hover:text-error gap-1.5"
                  onClick={() => { if (confirm("Clear this conversation? The message history will be removed.")) clearMut.mutate(selectedId); }}
                  disabled={clearMut.isPending}>
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3 bg-surface-soft/40">
                {histLoading && <p className="text-sm text-muted text-center py-6">Loading…</p>}
                {!histLoading && messages.length === 0 && <p className="text-sm text-muted text-center py-6">No messages in this conversation.</p>}
                {messages.map((m, i) => <MessageBubble key={i} m={m} />)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ m }: { m: ConvMessage }) {
  const content = typeof m.content === "string" ? m.content : "";
  // System prompt + empty tool turns add no value in a human-readable thread.
  if (m.role === "system") return null;
  if (!content.trim()) {
    if (m.role === "tool" || m.role === "assistant") {
      return <p className="text-[11px] text-muted text-center italic">· {m.role === "tool" ? "tool result" : "took an action"} ·</p>;
    }
    return null;
  }
  if (m.role === "tool") {
    return <p className="text-[11px] text-muted text-center">{content}</p>;
  }
  const isCustomer = m.role === "user";
  return (
    <div className={cn("flex", isCustomer ? "justify-start" : "justify-end")}>
      <div className={cn(
        "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
        isCustomer ? "bg-canvas border border-hairline text-ink rounded-bl-sm" : "bg-primary text-white rounded-br-sm",
      )}>
        {content}
        {m.ts && <div className={cn("text-[10px] mt-1", isCustomer ? "text-muted" : "text-white/70")}>{new Date(m.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>}
      </div>
    </div>
  );
}
