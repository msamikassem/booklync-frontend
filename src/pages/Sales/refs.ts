/**
 * Shared catalogue + employee lookups for the Sales tabs.
 *
 * Commission rules and bundles reference services / variations / titles / employees
 * by id; this hook turns those ids into human labels and supplies the picker lists.
 *
 * Name maps are built from the FULL catalogue (inactive included) so an existing
 * rule/bundle that targets a since-deactivated service still renders its name.
 * Picker option lists (`*Options`) expose only ACTIVE rows for new selections —
 * callers that need to keep an already-selected inactive value visible should fall
 * back to the name map for the label.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { services as servicesApi } from "../../api";
import { employeesApi } from "../Employees/api";
import type { CommissionRule } from "./types";

export interface FlatVariation { id: number; name: string; active: boolean; serviceId: number; }
export interface FlatService {
  id: number; name: string; titleId: number | null; active: boolean;
  variations: FlatVariation[];
}
export interface FlatTitle { id: number; name: string; active: boolean; }
export interface FlatEmployee { id: number; name: string; bookable: boolean; }

export interface CatalogRefs {
  loading: boolean;
  services: FlatService[];
  titles: FlatTitle[];
  employees: FlatEmployee[];
  /** Active-only picker lists (use the name maps to label inactive selections). */
  serviceOptions: FlatService[];
  variationOptions: FlatVariation[];
  bookableEmployees: FlatEmployee[];
  serviceName: (id?: number | null) => string;
  variationName: (id?: number | null) => string;
  titleName: (id?: number | null) => string;
  employeeName: (id?: number | null) => string;
  /** Human label for a commission rule's target (most-specific-first). */
  targetLabel: (rule: Pick<CommissionRule, "title_id" | "service_id" | "variation_id">) => string;
}

export function useCatalogRefs(agentId: number | null): CatalogRefs {
  const catQ = useQuery({
    queryKey: ["services-catalogue", agentId],
    queryFn: () => servicesApi.catalogue(agentId as number),
    enabled: !!agentId,
    staleTime: 60_000,
  });
  const empQ = useQuery({
    queryKey: ["fin-employees", agentId],
    queryFn: () => employeesApi.list(agentId as number),
    enabled: !!agentId,
    staleTime: 60_000,
  });

  return useMemo<CatalogRefs>(() => {
    const titles: FlatTitle[] = [];
    const servicesFlat: FlatService[] = [];

    const cat = catQ.data;
    if (cat) {
      for (const t of cat.titles) {
        titles.push({ id: t.id, name: t.name, active: t.active });
        for (const s of t.services) servicesFlat.push(flattenService(s, t.id));
      }
      for (const s of cat.uncategorised) servicesFlat.push(flattenService(s, null));
    }

    const employees: FlatEmployee[] = (empQ.data ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      bookable: !!e.branches?.some(
        (b) => b.agent_id === agentId && b.active && b.can_receive_bookings,
      ),
    }));

    const titleById = new Map(titles.map((t) => [t.id, t]));
    const serviceById = new Map(servicesFlat.map((s) => [s.id, s]));
    const variationById = new Map<number, FlatVariation>();
    for (const s of servicesFlat) for (const v of s.variations) variationById.set(v.id, v);
    const employeeById = new Map(employees.map((e) => [e.id, e]));

    const serviceName = (id?: number | null) =>
      id == null ? "" : serviceById.get(id)?.name ?? `Service #${id}`;
    const variationName = (id?: number | null) =>
      id == null ? "" : variationById.get(id)?.name ?? `Variation #${id}`;
    const titleName = (id?: number | null) =>
      id == null ? "" : titleById.get(id)?.name ?? `Category #${id}`;
    const employeeName = (id?: number | null) =>
      id == null ? "" : employeeById.get(id)?.name ?? `Employee #${id}`;

    const targetLabel: CatalogRefs["targetLabel"] = (rule) => {
      if (rule.variation_id != null) {
        const v = variationById.get(rule.variation_id);
        const parent = v ? serviceById.get(v.serviceId) : undefined;
        return parent ? `${parent.name} · ${v!.name}` : variationName(rule.variation_id);
      }
      if (rule.service_id != null) return serviceName(rule.service_id);
      if (rule.title_id != null) return `${titleName(rule.title_id)} (category)`;
      return "All services";
    };

    return {
      loading: catQ.isLoading || empQ.isLoading,
      services: servicesFlat,
      titles,
      employees,
      serviceOptions: servicesFlat.filter((s) => s.active),
      variationOptions: servicesFlat.flatMap((s) => s.variations.filter((v) => v.active)),
      bookableEmployees: employees.filter((e) => e.bookable),
      serviceName,
      variationName,
      titleName,
      employeeName,
      targetLabel,
    };
  }, [catQ.data, catQ.isLoading, empQ.data, empQ.isLoading, agentId]);
}

function flattenService(
  s: { id: number; name: string; active: boolean; variations: { id: number; name: string; active: boolean }[] },
  titleId: number | null,
): FlatService {
  return {
    id: s.id,
    name: s.name,
    titleId,
    active: s.active,
    variations: (s.variations ?? []).map((v) => ({
      id: v.id, name: v.name, active: v.active, serviceId: s.id,
    })),
  };
}
