"use client";

import { Phone, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CustomerFilterState {
  phoneQuery: string;
  nameQuery: string;
  area: string;
  hasBalance: boolean;
  recentOnly: boolean;
  inactiveOnly: boolean;
}

const TOGGLES = [
  { key: "hasBalance", label: "Has Pending Balance" },
  { key: "recentOnly", label: "Recent Customers" },
  { key: "inactiveOnly", label: "Inactive Customers" },
] as const;

export function CustomerFilters({
  filters,
  areas,
  onChange,
}: {
  filters: CustomerFilterState;
  areas: string[];
  onChange: (next: CustomerFilterState) => void;
}) {
  function set<K extends keyof CustomerFilterState>(
    key: K,
    value: CustomerFilterState[K]
  ) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-xs">
        <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          value={filters.phoneQuery}
          onChange={(e) => set("phoneQuery", e.target.value)}
          placeholder="Search by phone..."
          className="h-11 w-full rounded-lg border border-border bg-white pl-10 pr-3.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
        />
      </div>
      <div className="relative w-full max-w-xs">
        <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          value={filters.nameQuery}
          onChange={(e) => set("nameQuery", e.target.value)}
          placeholder="Search by name..."
          className="h-11 w-full rounded-lg border border-border bg-white pl-10 pr-3.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
        />
      </div>
      <select
        value={filters.area}
        onChange={(e) => set("area", e.target.value)}
        className="h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
      >
        <option value="">All Areas</option>
        {areas.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-2">
        {TOGGLES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => set(key, !filters[key])}
            className={cn(
              "h-11 rounded-lg border px-4 text-sm font-medium transition-colors",
              filters[key]
                ? "border-primary bg-primary-tint text-primary"
                : "border-border bg-white text-ink-muted hover:bg-surface"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
