"use client";

import { Search } from "lucide-react";
import { FilterDropdown } from "@/components/ui/filter-dropdown";

export type BalanceFilter = "all" | "has" | "none";
export type ActivityFilter = "all" | "recent" | "inactive";

export interface CustomerFilterState {
  query: string;
  area: string; // "" = All
  balance: BalanceFilter;
  activity: ActivityFilter;
}

const BALANCE_OPTIONS: { value: BalanceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "has", label: "Has Balance" },
  { value: "none", label: "No Balance" },
];

const ACTIVITY_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "recent", label: "Recent" },
  { value: "inactive", label: "Inactive" },
];

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

  const areaOptions = [
    { value: "", label: "All" },
    ...areas.map((a) => ({ value: a, label: a })),
  ];

  const hasActiveFilters =
    filters.query.trim() !== "" ||
    filters.area !== "" ||
    filters.balance !== "all" ||
    filters.activity !== "all";

  function handleClear() {
    onChange({ query: "", area: "", balance: "all", activity: "all" });
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-[450px]">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
          placeholder="Search by name, phone, or customer no..."
          className="h-11 w-full rounded-lg border border-border bg-white pl-10 pr-3.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
        />
      </div>

      <FilterDropdown
        prefix="Area"
        value={filters.area}
        options={areaOptions}
        onChange={(v) => set("area", v)}
        minWidthClass="min-w-[170px]"
      />

      <FilterDropdown
        prefix="Balance"
        value={filters.balance}
        options={BALANCE_OPTIONS}
        onChange={(v) => set("balance", v)}
        minWidthClass="min-w-[170px]"
      />

      <FilterDropdown
        prefix="Activity"
        value={filters.activity}
        options={ACTIVITY_OPTIONS}
        onChange={(v) => set("activity", v)}
        minWidthClass="min-w-[170px]"
      />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClear}
          className="flex h-11 items-center px-1 text-sm font-medium text-primary hover:text-primary-dark hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
