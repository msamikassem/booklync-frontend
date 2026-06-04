import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { commissionApi } from "./api";
import { formatApiError } from "../../lib/errors";
import { cn } from "../../lib/utils";
import type { components } from "../../api/schema";
import type { CommissionRule, ApiError } from "./types";
import type { CatalogRefs } from "./refs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type S = components["schemas"];
type TargetType = "all" | "title" | "service" | "variation";

interface Props {
  agentId: number;
  rule: CommissionRule | null; // null = create
  refs: CatalogRefs;
  onClose: () => void;
}

function initialTarget(r: CommissionRule | null): TargetType {
  if (!r) return "all";
  if (r.variation_id != null) return "variation";
  if (r.service_id != null) return "service";
  if (r.title_id != null) return "title";
  return "all";
}

/** Active options + the currently-selected (possibly inactive) one so it stays visible. */
function optionsWith<T extends { id: number; name: string; active: boolean }>(
  active: T[], all: T[], selectedId: string,
): { id: number; name: string; inactive: boolean }[] {
  const out = active.map(o => ({ id: o.id, name: o.name, inactive: false }));
  if (selectedId && !out.some(o => String(o.id) === selectedId)) {
    const found = all.find(o => String(o.id) === selectedId);
    if (found) out.unshift({ id: found.id, name: found.name, inactive: true });
  }
  return out;
}

export function CommissionRuleModal({ agentId, rule, refs, onClose }: Props) {
  const editing = !!rule;
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState(rule?.employee_id != null ? String(rule.employee_id) : "");
  const [targetType, setTargetType] = useState<TargetType>(initialTarget(rule));
  const [titleId, setTitleId] = useState(rule?.title_id != null ? String(rule.title_id) : "");
  const [serviceId, setServiceId] = useState(rule?.service_id != null ? String(rule.service_id) : "");
  const [variationId, setVariationId] = useState(rule?.variation_id != null ? String(rule.variation_id) : "");
  const [type, setType] = useState<S["CommissionTypeEnum"]>(rule?.type ?? "percent");
  const [value, setValue] = useState(rule ? String(rule.value) : "");
  const [active, setActive] = useState(rule?.active ?? true);
  const [err, setErr] = useState<string | null>(null);

  const titleOpts = optionsWith(refs.titles.filter(t => t.active), refs.titles, titleId);
  const serviceOpts = optionsWith(refs.serviceOptions, refs.services, serviceId);
  const variationOpts = optionsWith(
    refs.variationOptions,
    refs.services.flatMap(s => s.variations),
    variationId,
  );
  const empAll = refs.employees;

  const save = useMutation({
    mutationFn: () => {
      // Typed as the stricter Create shape (assignable to Update too) so the
      // compiler validates the literal instead of trusting an `as` cast.
      const body: S["CommissionRuleCreate"] = {
        type, value: parseFloat(value),
        employee_id: employeeId ? Number(employeeId) : null,
        title_id: targetType === "title" && titleId ? Number(titleId) : null,
        service_id: targetType === "service" && serviceId ? Number(serviceId) : null,
        variation_id: targetType === "variation" && variationId ? Number(variationId) : null,
        active,
      };
      return editing
        ? commissionApi.updateRule(rule!.id, body)
        : commissionApi.createRule(agentId, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-commission-rules", agentId] });
      onClose();
    },
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not save the rule.")),
  });

  const del = useMutation({
    mutationFn: () => commissionApi.deleteRule(rule!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-commission-rules", agentId] });
      onClose();
    },
    onError: (e) => setErr(formatApiError((e as { data?: ApiError }).data ?? {}, "Could not delete the rule.")),
  });

  function submit() {
    setErr(null);
    const v = parseFloat(value);
    if (!(v > 0)) { setErr("Enter a value greater than 0."); return; }
    if (type === "percent" && v > 100) { setErr("A percentage cannot exceed 100."); return; }
    if (targetType === "title" && !titleId) { setErr("Pick a category."); return; }
    if (targetType === "service" && !serviceId) { setErr("Pick a service."); return; }
    if (targetType === "variation" && !variationId) { setErr("Pick a variation."); return; }
    save.mutate();
  }

  const busy = save.isPending || del.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-canvas">
        <DialogHeader><DialogTitle>{editing ? "Edit commission rule" : "New commission rule"}</DialogTitle></DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Employee</Label>
            <Select value={employeeId || "any"} onValueChange={(v) => setEmployeeId(v === "any" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any employee</SelectItem>
                {empAll.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">Leave as “Any employee” for a rule that applies to everyone at this branch.</p>
          </div>

          <div className="grid gap-1.5">
            <Label>Applies to</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                <SelectItem value="title">A category</SelectItem>
                <SelectItem value="service">A specific service</SelectItem>
                <SelectItem value="variation">A specific variation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {targetType === "title" && (
            <TargetSelect label="Category" value={titleId} onChange={setTitleId} options={titleOpts} />
          )}
          {targetType === "service" && (
            <TargetSelect label="Service" value={serviceId} onChange={setServiceId} options={serviceOpts} />
          )}
          {targetType === "variation" && (
            <TargetSelect label="Variation" value={variationId} onChange={setVariationId} options={variationOpts} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as S["CommissionTypeEnum"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage (%)</SelectItem>
                  <SelectItem value="flat">Flat amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-value">Value</Label>
              <Input id="c-value" type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink select-none">
            <input type="checkbox" className="accent-primary h-4 w-4" checked={active} onChange={e => setActive(e.target.checked)} />
            Active
          </label>

          <p className="text-xs text-muted">
            When several rules match a line, the most specific wins (employee + variation beats a branch-wide default).
          </p>
        </div>

        {err && <p className="text-sm text-error bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</p>}

        <DialogFooter className={cn(editing && "sm:justify-between")}>
          {editing && (
            <Button variant="ghost" className="text-error hover:text-error hover:bg-red-50"
              onClick={() => { if (confirm("Delete this rule?")) del.mutate(); }} disabled={busy}>
              Delete
            </Button>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>{save.isPending ? "Saving…" : editing ? "Save changes" : "Create rule"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TargetSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { id: number; name: string; inactive: boolean }[];
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={`Select a ${label.toLowerCase()}…`} /></SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.id} value={String(o.id)}>
              {o.name}{o.inactive ? " (inactive)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
