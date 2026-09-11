"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import {
  deleteUntouchedOrderAction,
  getOrderByIdAction,
  getOrdersForCustomerListAction,
  getOrdersListPageAction,
} from "@/app/(shell)/orders/actions";
import type { Customer, Order } from "@/lib/types";

import {
  OrderListFilters,
  type BalanceFilter,
  type DeliveryCustomRange,
  type DeliveryFilter,
  type StatusFilter,
  type UrgentFilter,
} from "@/components/orders/order-list-filters";
import {
  OrdersTable,
  type OrdersSortDir,
  type OrdersSortKey,
} from "@/components/orders/orders-table";
import { OrderDetailsDrawer } from "@/components/orders/order-details-drawer";
import { cn } from "@/lib/utils";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import { useDebouncedValue } from "@/components/ui/use-debounced-value";
import { downloadCsv } from "@/lib/csv";
import { ExportCsvButton } from "@/components/ui/export-csv-button";

const PAGE_SIZE = 10;
const ORDERS_VIEW_KEY = "tailorsaas:orders-view";
type OrdersView = "classic" | "modern";

function OrdersPageContent() {
  const { hasPermission } = useCurrentUser();
  const { t } = useLanguage();
  const canCreate = hasPermission("orders.create");
  const canEdit = hasPermission("orders.edit");
  const canViewPayments = hasPermission("orders.viewPayments");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [urgentFilter, setUrgentFilter] = useState<UrgentFilter>("all");
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>("all");
  const [deliveryCustomRange, setDeliveryCustomRange] =
    useState<DeliveryCustomRange>({ from: "", to: "" });
  const [orderDateRange, setOrderDateRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<OrdersSortKey>("orderDate");
  const [sortDir, setSortDir] = useState<OrdersSortDir>("desc");
  const [refreshTick, setRefreshTick] = useState(0);
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [, setOpeningOrderId] = useState<string | null>(null);
  const [pendingOpenOrderId, setPendingOpenOrderId] = useState<string | null>(null);
  const [openingNewOrderHref, setOpeningNewOrderHref] = useState<string | null>(null);
  const [showCreatedToast, setShowCreatedToast] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ordersView, setOrdersView] = useState<OrdersView>("classic");

  // Phase 5A: orders + customers now come from Server Actions (both reads
  // and writes go through app/(shell)/orders/actions.ts and
  // app/(shell)/customers/actions.ts against the same server-side copy of
  // the mock arrays), not direct client-side lib/data/stub-data.ts calls.
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrderCount, setTotalOrderCount] = useState(0);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [customersById, setCustomersById] = useState<Record<string, Customer>>({});
  // Hide stale rows while filters, pagination, or saved changes are loading.
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ORDERS_VIEW_KEY);
      if (saved === "classic" || saved === "modern") setOrdersView(saved);
    } catch {
      // Preference is optional.
    }
  }, []);

  function handleOrdersViewChange(view: OrdersView) {
    setOrdersView(view);
    try {
      window.localStorage.setItem(ORDERS_VIEW_KEY, view);
    } catch {
      // Preference persistence must not block the page.
    }
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getOrdersListPageAction({
      page,
      pageSize: PAGE_SIZE,
      sortKey,
      sortDir,
      searchQuery: debouncedSearchQuery,
      orderDateFrom: orderDateRange.from || undefined,
      orderDateTo: orderDateRange.to || undefined,
      balanceFilter,
      statusFilter,
      urgentFilter,
      deliveryFilter,
      deliveryFrom: deliveryFilter === "custom" ? deliveryCustomRange.from || undefined : undefined,
      deliveryTo: deliveryFilter === "custom" ? deliveryCustomRange.to || undefined : undefined,
      todayIso: new Date().toISOString().slice(0, 10),
    })
      .then((result) => {
        if (cancelled) return;
        setOrders(result.orders);
        setTotalOrderCount(result.totalCount);
        setCustomersById({});
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load orders."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    refreshTick,
    page,
    sortKey,
    sortDir,
    debouncedSearchQuery,
    orderDateRange.from,
    orderDateRange.to,
    balanceFilter,
    statusFilter,
    urgentFilter,
    deliveryFilter,
    deliveryCustomRange.from,
    deliveryCustomRange.to,
  ]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerOrders([]);
      return;
    }
    let cancelled = false;
    getOrdersForCustomerListAction(selectedCustomer.id)
      .then((result) => {
        if (!cancelled) setCustomerOrders(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load customer orders."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCustomer, refreshTick]);

  // New Order redirects here with ?created=1 (and optionally &orderId=... if
  // "View Order" was clicked from the success modal) on success. Read via
  // the browser URL (not useSearchParams) so this page doesn't need a
  // Suspense boundary just for a one-off toast; params are stripped
  // immediately so refreshing doesn't re-show/re-open anything.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const created = params.get("created") === "1";
    const orderId = params.get("orderId");
    if (created) {
      setShowCreatedToast(true);
      if (orderId) setPendingOpenOrderId(orderId);
      window.history.replaceState({}, "", "/orders");
      const timer = setTimeout(() => setShowCreatedToast(false), 4000);
      return () => clearTimeout(timer);
    }

    // Phase 7F: "View Order" links from the new Payments page arrive as
    // /orders?view=<id> — just opens the Order Details drawer on that
    // order, no toast, same "read once then strip the param" convention as
    // the created-toast case above.
    const viewOrderId = params.get("view");
    if (viewOrderId) {
      setPendingOpenOrderId(viewOrderId);
      window.history.replaceState({}, "", "/orders");
      return;
    }

    const balance = params.get("balance");
    const delivery = params.get("delivery");
    const status = params.get("status");
    if (
      balance === "paid" ||
      balance === "due" ||
      balance === "overdue"
    ) {
      setBalanceFilter(balance);
    }
    if (
      delivery === "dueToday" ||
      delivery === "dueTomorrow" ||
      delivery === "dueWeek" ||
      delivery === "overdue"
    ) {
      setDeliveryFilter(delivery);
    }
    if (status) {
      setStatusFilter((current) =>
        ["Pending", "In Progress", "Ready", "Delayed", "Delivered", "Cancelled"].includes(status)
          ? (status as StatusFilter)
          : current
      );
    }
    if (balance || delivery || status) {
      window.history.replaceState({}, "", "/orders");
    }
  }, []);

  useEffect(() => {
    if (!pendingOpenOrderId || isLoading) return;

    let cancelled = false;
    setOpeningOrderId(pendingOpenOrderId);
    getOrderByIdAction(pendingOpenOrderId)
      .then((order) => {
        if (cancelled) return;
        if (order) setDetailsOrder(order);
        setPendingOpenOrderId(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(getErrorMessage(error, "Failed to open the selected order."));
        setPendingOpenOrderId(null);
      })
      .finally(() => {
        if (!cancelled) setOpeningOrderId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [pendingOpenOrderId, isLoading]);

  function handleOpenOrder(order: Order) {
    setOpeningOrderId(order.id);
    getOrderByIdAction(order.id)
      .then((fullOrder) => {
        setDetailsOrder(fullOrder ?? order);
        setLoadError(null);
      })
      .catch((error) => {
        setLoadError(getErrorMessage(error, "Failed to open the selected order."));
      })
      .finally(() => setOpeningOrderId(null));
  }

  function handleStatusChanged() {
    setRefreshTick((t) => t + 1);
  }

  async function handleDeleteOrder(order: Order) {
    if (!window.confirm(`Delete order ${order.orderNumber}? This works only before production or payment activity starts. If this is the shop's last issued order number, it will become available for reuse. Existing order numbers will stay the same.`)) return;
    const result = await deleteUntouchedOrderAction(order.id);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    if (detailsOrder?.id === order.id) setDetailsOrder(null);
    setRefreshTick((tick) => tick + 1);
  }

  // Phase 7C: OrderDetailsDrawer calls this after a payment is recorded or
  // voided — advance_paid/balance/payment_status all change via the ledger
  // trigger, so the drawer needs the freshly re-fetched Order, and the
  // underlying OrdersTable/BalanceBadge need the same refreshTick bump
  // handleStatusChanged already uses for any other in-place
  // order mutation.
  function handleOrderUpdated(updatedOrder: Order) {
    setDetailsOrder(updatedOrder);
    setOrders((current) =>
      current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
    );
    setCustomerOrders((current) =>
      current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
    );
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

  function handleUrgentFilterChange(filter: UrgentFilter) {
    setUrgentFilter(filter);
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
    setUrgentFilter("all");
    setDeliveryFilter("all");
    setDeliveryCustomRange({ from: "", to: "" });
    setOrderDateRange({ from: "", to: "" });
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(totalOrderCount / PAGE_SIZE));
  const pagedOrders = orders;
  const selectedCustomerNewOrderHref = selectedCustomer
    ? `/orders/new?customerId=${selectedCustomer.id}`
    : "";
  const rangeStart = totalOrderCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalOrderCount);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2
  );

  async function handleExportOrders() {
    const exportOrders = selectedCustomer
      ? customerOrders
      : (
          await getOrdersListPageAction({
            page: 1,
            pageSize: 10000,
            sortKey,
            sortDir,
            searchQuery,
            orderDateFrom: orderDateRange.from || undefined,
            orderDateTo: orderDateRange.to || undefined,
            balanceFilter,
            statusFilter,
            urgentFilter,
            deliveryFilter,
            deliveryFrom: deliveryFilter === "custom" ? deliveryCustomRange.from || undefined : undefined,
            deliveryTo: deliveryFilter === "custom" ? deliveryCustomRange.to || undefined : undefined,
            todayIso,
          })
        ).orders;
    const headers = [
      "Order No",
      "Customer",
      "Phone",
      "Order Date",
      "Delivery Date",
      "Items",
      "Status",
      ...(canViewPayments ? ["Total", "Paid", "Balance"] : []),
    ];
    const rows = exportOrders.map((order) => {
      const customer = customersById[order.customerId] ?? order.customerSnapshot;
      const base = [
        order.orderNumber,
        customer?.name ?? "Unknown",
        customer?.phone ?? "",
        order.orderDate,
        order.deliveryDate,
        order.items.map((item) => `${item.particular} x${item.qty}`).join("; "),
        order.status,
      ];
      if (!canViewPayments) return base;
      return [
        ...base,
        order.totalAmount,
        order.advancePaid,
        order.balance,
      ];
    });

    downloadCsv(
      selectedCustomer
        ? `orders-${selectedCustomer.customerNumber}-${todayIso}.csv`
        : `orders-${todayIso}.csv`,
      headers,
      rows
    );
  }

  function handleSelectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
  }

  function clearSelection() {
    setSelectedCustomer(null);
    setSearchQuery("");
    setBalanceFilter("all");
    setStatusFilter("all");
    setUrgentFilter("all");
    setDeliveryFilter("all");
    setDeliveryCustomRange({ from: "", to: "" });
    setPage(1);
  }

  const isClassicOrdersView = ordersView === "classic";

  return (
    <div className={cn(
      "mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8 2xl:max-w-[1760px]",
      isClassicOrdersView && "max-w-none bg-[#f5f8ff] p-2 sm:px-3 sm:py-2 lg:px-4 2xl:max-w-none"
    )}>
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
            className="ml-1 flex h-6 w-6 items-center justify-center rounded text-ink-faint transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className={cn(
        "mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border-soft bg-white px-5 py-4 shadow-soft sm:px-6",
        isClassicOrdersView && "mb-2 rounded-lg border-[#c9d7ea] px-3 py-2 shadow-[0_2px_8px_rgba(30,64,175,0.06)]"
      )}>
        <div>
          <h1 className={cn("text-[28px] font-bold tracking-tight text-ink", isClassicOrdersView && "text-lg")}>{t("orders.title")}</h1>
          <p className={cn("mt-0.5 text-sm font-medium text-ink-muted", isClassicOrdersView && "text-xs")}>
            {t("orders.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border bg-surface-muted p-0.5 text-xs font-semibold">
            {(["classic", "modern"] as OrdersView[]).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => handleOrdersViewChange(view)}
                className={cn(
                  "h-8 px-3 transition-colors",
                  ordersView === view
                    ? "rounded bg-white text-primary shadow-sm"
                    : "text-ink-muted hover:text-ink"
                )}
              >
                {view === "classic" ? "Classic Compact View" : "Modern View"}
              </button>
            ))}
          </div>
          <ExportCsvButton
            onClick={handleExportOrders}
            disabled={isLoading || (selectedCustomer ? customerOrders.length === 0 : totalOrderCount === 0)}
            label={t("reports.exportCsv")}
          />
          {canCreate && (
            <Link
              href="/orders/new"
              onClick={() => setOpeningNewOrderHref("/orders/new")}
              aria-busy={openingNewOrderHref === "/orders/new"}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark",
                isClassicOrdersView && "rounded-md px-3 text-xs"
              )}
            >
              {openingNewOrderHref === "/orders/new" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>
                {openingNewOrderHref === "/orders/new" ? "Opening..." : t("orders.newOrder")}
              </span>
              {openingNewOrderHref !== "/orders/new" && (
                <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold">
                  Alt N
                </span>
              )}
            </Link>
          )}
        </div>
      </div>

      {loadError && (
        <div className="mb-5">
          <LoadError message={loadError} onRetry={() => setRefreshTick((t) => t + 1)} />
        </div>
      )}

      {!selectedCustomer && (
        <><OrderListFilters
          query={searchQuery}
          onQueryChange={handleQueryChange}
          balanceFilter={balanceFilter}
          onBalanceFilterChange={handleBalanceFilterChange}
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
          urgentFilter={urgentFilter}
          onUrgentFilterChange={handleUrgentFilterChange}
          deliveryFilter={deliveryFilter}
          onDeliveryFilterChange={handleDeliveryFilterChange}
          deliveryCustomRange={deliveryCustomRange}
          onDeliveryCustomRangeChange={handleDeliveryCustomRangeChange}
          orderDateRange={orderDateRange}
          onOrderDateRangeChange={(range) => { setOrderDateRange(range); setPage(1); }}
          onClearFilters={handleClearFilters}
          onSelectCustomer={handleSelectCustomer}
          compact={isClassicOrdersView}
        /></>
      )}

      {isLoading ? (
        <LoadingState label="Loading orders..." />
      ) : selectedCustomer ? (
        <div>
          <div className={cn(
            "mb-4 flex items-center justify-between rounded-xl border border-border-soft bg-white p-5 shadow-soft",
            isClassicOrdersView && "mb-2 rounded-lg border-[#c9d7ea] p-3 shadow-[0_2px_8px_rgba(30,64,175,0.06)]"
          )}>
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
                  href={selectedCustomerNewOrderHref}
                  onClick={() => setOpeningNewOrderHref(selectedCustomerNewOrderHref)}
                  aria-busy={openingNewOrderHref === selectedCustomerNewOrderHref}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark",
                    isClassicOrdersView && "rounded-md px-3 py-1.5 text-xs"
                  )}
                >
                  {openingNewOrderHref === selectedCustomerNewOrderHref ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {openingNewOrderHref === selectedCustomerNewOrderHref
                    ? "Opening..."
                    : t("orders.newOrder")}
                  {openingNewOrderHref !== selectedCustomerNewOrderHref && (
                    <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold">
                      Alt N
                    </span>
                  )}
                </Link>
              )}
              <button
                onClick={clearSelection}
                className={cn(
                  "rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink",
                  isClassicOrdersView && "rounded-md px-3 py-1.5 text-xs"
                )}
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
            customersById={customersById}
            editableStatus
            onStatusChange={handleStatusChanged}
            onRowClick={handleOpenOrder}
            showActions={canEdit}
            onDelete={handleDeleteOrder}
            compact={isClassicOrdersView}
          />
        </div>
      ) : (
        <>
          <OrdersTable
            orders={pagedOrders}
            customersById={customersById}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            editableStatus
            onStatusChange={handleStatusChanged}
            onRowClick={handleOpenOrder}
            showActions={canEdit}
            onDelete={handleDeleteOrder}
            compact={isClassicOrdersView}
          />
          {totalOrderCount > 0 && (
            <div className={cn("mt-5 flex items-center justify-between text-sm", isClassicOrdersView && "mt-2 text-xs")}>
              <span className="text-ink-muted">
                {t("common.showing")} {rangeStart} {t("common.to")} {rangeEnd}{" "}
                {t("common.of")} {totalOrderCount} {t("orders.ordersLabel")}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink transition-colors hover:enabled:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageNumbers.map(
                  (n, index) => (
                    <span key={`${n}-${index}`} className="contents">
                      {index > 0 && n - pageNumbers[index - 1] > 1 && (
                        <span className="px-1 text-ink-faint">...</span>
                      )}
                    <button
                      onClick={() => setPage(n)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                        n === page
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-white text-ink hover:bg-surface-muted"
                      )}
                    >
                      {n}
                    </button>
                    </span>
                  )
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink transition-colors hover:enabled:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
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
        customer={detailsOrder ? customersById[detailsOrder.customerId] ?? detailsOrder.customerSnapshot : undefined}
        onClose={() => setDetailsOrder(null)}
        onStatusChange={handleStatusChanged}
        onOrderUpdated={handleOrderUpdated}
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
