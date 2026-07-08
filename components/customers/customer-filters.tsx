"use client";

import { Search } from "lucide-react";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { useLanguage } from "@/components/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

export type BalanceFilter = "all" | "has" | "none";
export type ActivityFilter = "all" | "recent" | "inactive";

export interface CustomerFilterState {
  query: string;
  area: string; // "" = All
  balance: BalanceFilter;
  activity: ActivityFilter;
}

const BALANCE_VALUES: BalanceFilter[] = ["all", "has", "none"];
const BALANCE_LABEL_KEYS: Record<BalanceFilter, TranslationKey> = {
  all: "common.all",
  has: "customers.hasBalance",
  none: "customers.noBalance",
};

const ACTIVITY_VALUES: ActivityFilter[] = ["all", "recent", "inactive"];
const ACTIVITY_LABEL_KEYS: Record<ActivityFilter, TranslationKey> = {
  all: "common.all",
  recent: "customers.recent",
  inactive: "customers.inactive",
};

export function CustomerFilters({
  filters,
  areas,
  onChange,
}: {
  filters: CustomerFilterState;
  areas: string[];
  onChange: (next: CustomerFilterState) => void;
}) {
  const { t } = useLanguage();

  function set<K extends keyof CustomerFilterState>(
    key: K,
    value: CustomerFilterState[K]
  ) {
    onChange({ ...filters, [key]: value });
  }

  const areaOptions = [
    { value: "", label: t("common.all") },
    ...areas.map((a) => ({ value: a, label: a })),
  ];
  const balanceOptions = BALANCE_VALUES.map((v) => ({
    value: v,
    label: t(BALANCE_LABEL_KEYS[v]),
  }));
  const activityOptions = ACTIVITY_VALUES.map((v) => ({
    value: v,
    label: t(ACTIVITY_LABEL_KEYS[v]),
  }));

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
          placeholder={t("customers.searchPlaceholder")}
          className="h-11 w-full rounded-lg border border-border bg-white pl-10 pr-3.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
        />
      </div>

      <FilterDropdown
        prefix={t("customers.filterArea")}
        value={filters.area}
        options={areaOptions}
        onChange={(v) => set("area", v)}
        minWidthClass="min-w-[170px]"
      />

      <FilterDropdown
        prefix={t("customers.filterBalance")}
        value={filters.balance}
        options={balanceOptions}
        onChange={(v) => set("balance", v)}
        minWidthClass="min-w-[170px]"
      />

      <FilterDropdown
        prefix={t("customers.filterActivity")}
        value={filters.activity}
        options={activityOptions}
        onChange={(v) => set("activity", v)}
        minWidthClass="min-w-[170px]"
      />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClear}
          className="flex h-11 items-center px-1 text-sm font-medium text-primary hover:text-primary-dark hover:underline"
        >
          {t("common.clearFilters")}
        </button>
      )}
    </div>
  );
}
