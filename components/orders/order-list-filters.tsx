"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { orderStatuses, searchCustomers } from "@/lib/data/stub-data";
import type { Customer, OrderStatus } from "@/lib/types";

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

const CONTROL_CLASS =
  "h-11 rounded-lg border border-border bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint";

// Closed control always shows "<prefix>: <current label>" (e.g. "Status: All"),
// but the open menu lists plain values only ("All", "In Progress", ...) — a
// native <select> can't show different text for its closed vs. open state,
// so this is a small custom button+menu dropdown instead.
function FilterDropdown<T extends string>({
  prefix,
  value,
  options,
  onChange,
  minWidthClass,
}: {
  prefix: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  // A floor, not a cap: the button has no fixed `w-*`, so it grows past this
  // to fit longer selected values instead of truncating them.
  minWidthClass: string;
}) {
  const [open, setOpen] = useState(false);
  const currentLabel = options.find((o) => o.value === value)?.label ?? value;

  function handleSelect(v: T) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${CONTROL_CLASS} ${minWidthClass} flex items-center justify-between gap-2`}
      >
        <span className="whitespace-nowrap">
          {prefix}: {currentLabel}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-faint" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="absolute left-0 z-20 mt-1 w-full min-w-max overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft">
            {options.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className="block w-full whitespace-nowrap px-3.5 py-2 text-left text-sm text-ink hover:bg-surface"
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

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
