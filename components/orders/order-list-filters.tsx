"use client";

import { Search } from "lucide-react";
import { orderStatuses, searchCustomers } from "@/lib/data/stub-data";
import type { Customer, OrderStatus } from "@/lib/types";
import {
  FilterDropdown,
  FILTER_CONTROL_CLASS as CONTROL_CLASS,
} from "@/components/ui/filter-dropdown";

export type BalanceFilter = "all" | "paid" | "due" | "overdue";
export type StatusFilter = "all" | OrderStatus;
export type DeliveryFilter =
  | "all"
  | "dueToday"
  | "dueTomorrow"
  | "dueWeek"
  | "overdue"
  | "custom";

export interface DeliveryCustomRange {
  from: string;
  to: string;
}

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...orderStatuses.map((s) => ({ value: s as StatusFilter, label: s })),
];

const BALANCE_FILTER_OPTIONS: { value: BalanceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "due", label: "Due" },
  { value: "overdue", label: "Overdue" },
];

const DELIVERY_FILTER_OPTIONS: { value: DeliveryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "dueToday", label: "Due Today" },
  { value: "dueTomorrow", label: "Due Tomorrow" },
  { value: "dueWeek", label: "Due This Week" },
  { value: "overdue", label: "Overdue" },
  { value: "custom", label: "Custom Range" },
];

export function OrderListFilters({
  query,
  onQueryChange,
  balanceFilter,
  onBalanceFilterChange,
  statusFilter,
  onStatusFilterChange,
  deliveryFilter,
  onDeliveryFilterChange,
  deliveryCustomRange,
  onDeliveryCustomRangeChange,
  onClearFilters,
  onSelectCustomer,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  balanceFilter: BalanceFilter;
  onBalanceFilterChange: (filter: BalanceFilter) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  deliveryFilter: DeliveryFilter;
  onDeliveryFilterChange: (filter: DeliveryFilter) => void;
  deliveryCustomRange: DeliveryCustomRange;
  onDeliveryCustomRangeChange: (range: DeliveryCustomRange) => void;
  onClearFilters: () => void;
  onSelectCustomer: (customer: Customer) => void;
}) {
  const customerSuggestions = searchCustomers(query);
  const hasActiveFilters =
    query.trim() !== "" ||
    statusFilter !== "all" ||
    balanceFilter !== "all" ||
    deliveryFilter !== "all";

  function handleSelect(customer: Customer) {
    onQueryChange("");
    onSelectCustomer(customer);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-[450px]">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by order no, phone, or customer..."
          className="h-11 w-full rounded-lg border border-border bg-white pl-10 pr-3.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
        />
        {query.trim() && customerSuggestions.length > 0 && (
          <ul className="absolute z-10 mt-2 w-full overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft">
            {customerSuggestions.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseDown={() => handleSelect(c)}
                  className="block w-full px-4 py-3 text-left text-sm hover:bg-surface"
                >
                  <span className="font-medium text-ink">{c.name}</span>
                  <span className="text-ink-muted"> — {c.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FilterDropdown
        prefix="Status"
        value={statusFilter}
        options={STATUS_FILTER_OPTIONS}
        onChange={onStatusFilterChange}
        minWidthClass="min-w-[190px]"
      />

      <FilterDropdown
        prefix="Payment"
        value={balanceFilter}
        options={BALANCE_FILTER_OPTIONS}
        onChange={onBalanceFilterChange}
        minWidthClass="min-w-[170px]"
      />

      <FilterDropdown
        prefix="Delivery"
        value={deliveryFilter}
        options={DELIVERY_FILTER_OPTIONS}
        onChange={onDeliveryFilterChange}
        minWidthClass="min-w-[170px]"
      />

      {deliveryFilter === "custom" && (
        <>
          <input
            type="date"
            value={deliveryCustomRange.from}
            onChange={(e) =>
              onDeliveryCustomRangeChange({
                ...deliveryCustomRange,
                from: e.target.value,
              })
            }
            className={`${CONTROL_CLASS} px-3`}
          />
          <span className="text-sm text-ink-faint">to</span>
          <input
            type="date"
            value={deliveryCustomRange.to}
            onChange={(e) =>
              onDeliveryCustomRangeChange({
                ...deliveryCustomRange,
                to: e.target.value,
              })
            }
            className={`${CONTROL_CLASS} px-3`}
          />
        </>
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="flex h-11 items-center px-1 text-sm font-medium text-primary hover:text-primary-dark hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
