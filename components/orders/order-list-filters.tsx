"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { orderStatuses } from "@/lib/constants";
import { searchCustomersAction } from "@/app/(shell)/customers/actions";
import type { Customer, OrderStatus } from "@/lib/types";
import {
  FilterDropdown,
  FILTER_CONTROL_CLASS as CONTROL_CLASS,
} from "@/components/ui/filter-dropdown";
import { useLanguage } from "@/components/i18n/language-provider";
import { ORDER_STATUS_LABEL_KEYS } from "@/components/orders/orders-table";
import type { TranslationKey } from "@/lib/i18n/translations";

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

// Option label lookups are built inside the component (via t()) rather than
// as module-scope constants, so switching language re-renders them — only
// the value lists are fixed here.
const STATUS_FILTER_VALUES: StatusFilter[] = ["all", ...orderStatuses];
const BALANCE_FILTER_VALUES: BalanceFilter[] = ["all", "paid", "due", "overdue"];
const DELIVERY_FILTER_VALUES: DeliveryFilter[] = [
  "all",
  "dueToday",
  "dueTomorrow",
  "dueWeek",
  "overdue",
  "custom",
];

const BALANCE_FILTER_LABEL_KEYS: Record<BalanceFilter, TranslationKey> = {
  all: "common.all",
  paid: "common.paid",
  due: "orders.due",
  overdue: "orders.overdue",
};

const DELIVERY_FILTER_LABEL_KEYS: Record<DeliveryFilter, TranslationKey> = {
  all: "common.all",
  dueToday: "orders.dueToday",
  dueTomorrow: "orders.dueTomorrow",
  dueWeek: "orders.dueWeek",
  overdue: "orders.overdue",
  custom: "orders.customRange",
};

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
  orderDateRange,
  onOrderDateRangeChange,
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
  orderDateRange: DeliveryCustomRange;
  onOrderDateRangeChange: (range: DeliveryCustomRange) => void;
  onClearFilters: () => void;
  onSelectCustomer: (customer: Customer) => void;
}) {
  const { t } = useLanguage();
  const statusOptions = STATUS_FILTER_VALUES.map((s) => ({
    value: s,
    label: s === "all" ? t("common.all") : t(ORDER_STATUS_LABEL_KEYS[s]),
  }));
  const balanceOptions = BALANCE_FILTER_VALUES.map((v) => ({
    value: v,
    label: t(BALANCE_FILTER_LABEL_KEYS[v]),
  }));
  const deliveryOptions = DELIVERY_FILTER_VALUES.map((v) => ({
    value: v,
    label: t(DELIVERY_FILTER_LABEL_KEYS[v]),
  }));
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setCustomerSuggestions([]);
      return;
    }
    let cancelled = false;
    searchCustomersAction(query).then((results) => {
      if (!cancelled) setCustomerSuggestions(results);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const hasActiveFilters =
    query.trim() !== "" ||
    statusFilter !== "all" ||
    balanceFilter !== "all" ||
    deliveryFilter !== "all" ||
    orderDateRange.from !== "" ||
    orderDateRange.to !== "";

  function handleSelect(customer: Customer) {
    onQueryChange("");
    onSelectCustomer(customer);
  }

  return (
    <div className="mb-6 flex flex-wrap items-end gap-2.5 rounded-xl border border-border-soft bg-white/90 p-3 shadow-soft">
      <div className="relative w-full sm:w-[340px] lg:flex-1 lg:min-w-[280px] lg:max-w-[380px]">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t("orders.searchPlaceholder")}
          className="h-11 w-full rounded-lg border border-border bg-input-fill pl-10 pr-3.5 text-sm font-medium text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary-tint"
        />
        {query.trim() && customerSuggestions.length > 0 && (
          <ul className="absolute z-10 mt-2 w-full overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft">
            {customerSuggestions.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseDown={() => handleSelect(c)}
                  className="block w-full px-4 py-3 text-left text-sm hover:bg-surface-muted"
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
        prefix={t("orders.filterStatus")}
        value={statusFilter}
        options={statusOptions}
        onChange={onStatusFilterChange}
        minWidthClass="min-w-[140px]"
      />

      <FilterDropdown
        prefix={t("orders.filterPayment")}
        value={balanceFilter}
        options={balanceOptions}
        onChange={onBalanceFilterChange}
        minWidthClass="min-w-[145px]"
      />

      <FilterDropdown
        prefix={t("orders.filterDelivery")}
        value={deliveryFilter}
        options={deliveryOptions}
        onChange={onDeliveryFilterChange}
        minWidthClass="min-w-[145px]"
      />

      <label className="w-[145px] text-xs font-semibold text-ink-muted">Order from<input type="date" value={orderDateRange.from} onChange={(event) => onOrderDateRangeChange({ ...orderDateRange, from: event.target.value })} className={`${CONTROL_CLASS} mt-1 w-full px-2`} /></label>
      <label className="w-[145px] text-xs font-semibold text-ink-muted">Order to<input type="date" value={orderDateRange.to} onChange={(event) => onOrderDateRangeChange({ ...orderDateRange, to: event.target.value })} className={`${CONTROL_CLASS} mt-1 w-full px-2`} /></label>

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
          <span className="text-sm text-ink-faint">{t("common.to")}</span>
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
          {t("common.clearFilters")}
        </button>
      )}
    </div>
  );
}
