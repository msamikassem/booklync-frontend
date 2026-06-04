import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customers as customersApi } from "../../api";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export interface PickedCustomer { id: number; name: string; phone?: string | null; }

interface Props {
  value: PickedCustomer | null;
  onSelect: (c: PickedCustomer | null) => void;
  placeholder?: string;
}

/**
 * Typeahead over the tenant's customers (reuses the shared ['customers'] cache).
 * Self-contained: manages its own search box + dropdown, reports the picked
 * customer up via onSelect.
 */
export function CustomerPicker({ value, onSelect, placeholder = "Search customer…" }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersApi.list().then(d => d.customers ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? customers.filter(c => (c.name ?? "").toLowerCase().includes(q) || (c.phone ?? "").includes(q))
      : customers;
    return list.slice(0, 30);
  }, [customers, search]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none h-3.5 w-3.5" />
        <Input
          value={value ? (value.name || value.phone || `Customer #${value.id}`) : search}
          onChange={e => { setSearch(e.target.value); if (value) onSelect(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9 pr-8"
        />
        {value && (
          <button type="button" onClick={() => { onSelect(null); setSearch(""); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-lg leading-none">×</button>
        )}
      </div>
      {open && !value && (
        <div className="relative z-20">
          <div className="absolute top-1 left-0 right-0 bg-canvas border border-hairline rounded-lg shadow-md max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted">{search ? `No results for "${search}"` : "No customers yet"}</p>
            )}
            {filtered.map(c => (
              <button key={c.id} type="button"
                onMouseDown={() => { onSelect({ id: c.id, name: c.name, phone: c.phone }); setOpen(false); setSearch(""); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-surface-soft transition-colors">
                <div className="font-medium text-ink">{c.name}</div>
                {c.phone && <div className="text-xs text-muted">{c.phone}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
