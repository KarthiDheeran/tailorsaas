"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import {
  getAllOrders,
  getCustomerById,
  getOrderById,
  getOrdersForCustomer,
} from "@/lib/data/stub-data";
import type { Customer, Order } from "@/lib/types";

import {
  OrderListFilters,
  type BalanceFilter,
  type DeliveryCustomRange,
  type DeliveryFilter,
  type StatusFilter,
} from "@/components/orders/order-list-filters";
import {
  OrdersTable,
  type OrdersSortDir,
  type OrdersSortKey,
} from "@/components/orders/orders-table";
import { OrderDetailsDrawer } from "@/components/orders/order-details-drawer";
import { EditOrderDrawer } from "@/components/orders/edit-order-drawer";
import { cn } from "@/lib/utils";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";

const PAGE_SIZE = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// Same plain YYYY-MM-DD string date-math convention as lib/dashboard.ts
// (never Date/Intl formatting) so server/client rendering stays consistent.
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function OrdersPageContent() {
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const canCreate = hasPermission("orders.create");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("all");
  const [deliveryCustomRange, setDeliveryCustomRange] =
    useState<DeliveryCustomRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<OrdersSortKey>("orderDate");
  const [sortDir, setSortDir] = useState<OrdersSortDir>("desc");
  const [, setRefreshTick] = useState(0);
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [showCreatedToast, setShowCreatedToast] = useState(false);

  // New Order redirects here with ?created=1 (and optionally &orderId=... if
  // "View Order" was clicked from the success modal) on success. Read via
  // the browser URL (not useSearchParams) so this page doesn't need a
  // Suspense boundary just for a one-off toast; params are stripped
  // immediately so refreshing doesn't re-show/re-open anything.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const created = params.get("created") === "1";
    const orderId = params.get("orderId");
    if (!created) return;
    setShowCreatedToast(true);
    if (orderId) {
      const order = getOrderById(orderId);
      if (order) setDetailsOrder(order);
    }
    window.history.replaceState({}, "", "/orders");
    const timer = setTimeout(() => setShowCreatedToast(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  function handleStatusChanged() {
    setRefreshTick((t) => t + 1);
  }

  function handleEditOrder(order: Order) {
    setDetailsOrder(null);
    setEditingOrder(order);
  }

  function handleOrderSaved(updatedOrder: Order) {
    setEditingOrder(null);
    setDetailsOrder(updatedOrder);
    setRefreshTick((t) => t + 1);
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  function handleSort(key: OrdersSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  }

  function handleQueryChange(query: string) {
    setSearchQuery(query);
    setPage(1);
  }

  function handleBalanceFilterChange(filter: BalanceFilter) {
    setBalanceFilter(filter);
    setPage(1);
  }

  function handleStatusFilterChange(filter: StatusFilter) {
    setStatusFilter(filter);
    setPage(1);
  }

  function handleDeliveryFilterChange(filter: DeliveryFilter) {
    setDeliveryFilter(filter);
    setPage(1);
  }

  function handleDeliveryCustomRangeChange(range: DeliveryCustomRange) {
    setDeliveryCustomRange(range);
    setPage(1);
  }

  function handleClearFilters() {
    setSearchQuery("");
    setBalanceFilter("all");
    setStatusFilter("all");
    setDeliveryFilter("all");
    setDeliveryCustomRange({ from: "", to: "" });
    setPage(1);
  }

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredOrders = getAllOrders().filter((order) => {
    if (trimmedQuery) {
      const customer = getCustomerById(order.customerId);
      const matchesQuery =
        order.orderNumber.toLowerCase().includes(trimmedQuery) ||
        customer?.name.toLowerCase().includes(trimmedQuery) ||
        customer?.phone.includes(searchQuery.trim());
      if (!matchesQuery) return false;
    }
    if (balanceFilter === "paid" && order.balance > 0) return false;
    if (
      balanceFilter === "due" &&
      !(order.balance > 0 && order.deliveryDate >= todayIso)
    )
      return false;
    if (
      balanceFilter === "overdue" &&
      !(order.balance > 0 && order.deliveryDate < todayIso)
    )
      return false;
    if (statusFilter !== "all" && order.status !== statusFilter) return false;
    if (deliveryFilter === "dueToday" && order.deliveryDate !== todayIso)
      return false;
    if (
      deliveryFilter === "dueTomorrow" &&
      order.deliveryDate !== addDaysIso(todayIso, 1)
    )
      return false;
    if (
      deliveryFilter === "dueWeek" &&
      !(
        order.deliveryDate >= todayIso &&
        order.deliveryDate <= addDaysIso(todayIso, 7)
      )
    )
      return false;
    if (deliveryFilter === "overdue" && !(order.deliveryDate < todayIso))
      return false;
    if (deliveryFilter === "custom") {
      if (deliveryCustomRange.from && order.deliveryDate < deliveryCustomRange.from)
        return false;
      if (deliveryCustomRange.to && order.deliveryDate > deliveryCustomRange.to)
        return false;
    }
    return true;
  });

  const allOrders = [...filteredOrders].sort((a, b) => {
    const cmp = a[sortKey] < b[sortKey] ? -1 : a[sortKey] > b[sortKey] ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });
  const totalPages = Math.max(1, Math.ceil(allOrders.length / PAGE_SIZE));
  const pagedOrders = allOrders.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );
  const rangeStart = allOrders.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, allOrders.length);

  const customerOrders = selectedCustomer
    ? getOrdersForCustomer(selectedCustomer.id)
    : [];

  function handleSelectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
  }

  function clearSelection() {
    setSelectedCustomer(null);
    setSearchQuery("");
    setBalanceFilter("all");
    setStatusFilter("all");
    setDeliveryFilter("all");
    setDeliveryCustomRange({ from: "", to: "" });
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-7xl p-8">
      {showCreatedToast && (
        <div className="fixed right-8 top-6 z-50 flex items-center gap-2 rounded-lg border border-border-soft bg-white px-4 py-3 shadow-soft">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm font-medium text-ink">
            {t("orders.orderCreatedSuccess")}
          </span>
          <button
            type="button"
            onClick={() => setShowCreatedToast(false)}
            aria-label={t("orders.dismiss")}
            className="ml-1 flex h-6 w-6 items-center justify-center rounded text-ink-faint transition-colors hover:bg-surface hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">{t("orders.title")}</h1>
          <p className="text-sm text-ink-muted">
            {t("orders.subtitle")}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/orders/new"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            {t("orders.newOrder")}
          </Link>
        )}
      </div>

      {!selectedCustomer && (
        <OrderListFilters
          query={searchQuery}
          onQueryChange={handleQueryChange}
          balanceFilter={balanceFilter}
          onBalanceFilterChange={handleBalanceFilterChange}
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
          deliveryFilter={deliveryFilter}
          onDeliveryFilterChange={handleDeliveryFilterChange}
          deliveryCustomRange={deliveryCustomRange}
          onDeliveryCustomRangeChange={handleDeliveryCustomRangeChange}
          onClearFilters={handleClearFilters}
          onSelectCustomer={handleSelectCustomer}
        />
      )}

      {selectedCustomer ? (
        <div>
          <div className="mb-4 flex items-center justify-between rounded-xl border border-border-soft bg-white p-5 shadow-soft">
            <div>
              <p className="font-medium text-ink">{selectedCustomer.name}</p>
              <p className="text-sm text-ink-muted">
                {selectedCustomer.phone} · {selectedCustomer.area} ·{" "}
                {selectedCustomer.gender}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canCreate && (
                <Link
                  href={`/orders/new?customerId=${selectedCustomer.id}`}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
                >
                  <Plus className="h-4 w-4" />
                  {t("orders.newOrder")}
                </Link>
              )}
              <button
                onClick={clearSelection}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink"
              >
                {t("orders.backToAllOrders")}
              </button>
            </div>
          </div>
          <h2 className="mb-3 px-1 text-sm font-medium text-ink-muted">
            {t("orders.ordersFor")} {selectedCustomer.name}
          </h2>
          <OrdersTable
            orders={customerOrders}
            editableStatus
            onStatusChange={handleStatusChanged}
            onRowClick={setDetailsOrder}
          />
        </div>
      ) : (
        <>
          <OrdersTable
            orders={pagedOrders}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            editableStatus
            onStatusChange={handleStatusChanged}
            onRowClick={setDetailsOrder}
          />
          {allOrders.length > 0 && (
            <div className="mt-5 flex items-center justify-between text-sm">
              <span className="text-ink-muted">
                {t("common.showing")} {rangeStart} {t("common.to")} {rangeEnd}{" "}
                {t("common.of")} {allOrders.length} {t("orders.ordersLabel")}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink transition-colors hover:enabled:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (n) => (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                        n === page
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-white text-ink hover:bg-surface"
                      )}
                    >
                      {n}
                    </button>
                  )
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink transition-colors hover:enabled:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <OrderDetailsDrawer
        order={detailsOrder}
        onClose={() => setDetailsOrder(null)}
        onStatusChange={handleStatusChanged}
        onEdit={handleEditOrder}
      />
      <EditOrderDrawer
        key={editingOrder?.id ?? "none"}
        order={editingOrder}
        customer={
          editingOrder ? getCustomerById(editingOrder.customerId) : undefined
        }
        onCancel={() => setEditingOrder(null)}
        onSaved={handleOrderSaved}
      />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <RequirePermission permission="orders.view">
      <OrdersPageContent />
    </RequirePermission>
  );
}
