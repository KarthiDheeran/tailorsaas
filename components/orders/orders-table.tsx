"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ChevronsUpDown, Inbox } from "lucide-react";
import type { Customer, Order, OrderStatus } from "@/lib/types";
import { orderStatuses } from "@/lib/constants";
import { updateOrderStatusAction } from "@/app/(shell)/orders/actions";
import { hasPermission, type Permission } from "@/lib/permissions";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatCurrency } from "@/lib/currency";

// Status options an editor should offer, filtered by the current user's
// permissions: full range needs orders.edit; orders.changeStatus alone
// (Staff-like access) is restricted to In Progress/Ready; Cancelled is only
// ever offered with orders.cancel, regardless of the other two.
export function getAvailableOrderStatuses(
  permissions: Permission[]
): OrderStatus[] {
  let base: OrderStatus[];
  if (hasPermission(permissions, "orders.edit")) {
    base = [...orderStatuses];
  } else if (hasPermission(permissions, "orders.changeStatus")) {
    base = ["In Progress", "Ready"];
  } else {
    base = [];
  }
  if (!hasPermission(permissions, "orders.cancel")) {
    base = base.filter((s) => s !== "Cancelled");
  }
  return base;
}

export const ORDER_STATUS_STYLES: Record<OrderStatus, { bg: string; fg: string }> = {
  "In Progress": { bg: "bg-chip-blue", fg: "text-chip-blue-fg" },
  Ready: { bg: "bg-chip-purple", fg: "text-chip-purple-fg" },
  Delivered: { bg: "bg-chip-mint", fg: "text-chip-mint-fg" },
  Delayed: { bg: "bg-chip-red", fg: "text-chip-red-fg" },
  Cancelled: { bg: "bg-chip-info", fg: "text-chip-info-fg" },
};

// OrderStatus values are also used as data (stored/compared as-is) — this
// map is purely for display, translating the label without touching the
// underlying status string.
export const ORDER_STATUS_LABEL_KEYS: Record<OrderStatus, TranslationKey> = {
  "In Progress": "orders.inProgress",
  Ready: "orders.ready",
  Delivered: "orders.delivered",
  Delayed: "orders.delayed",
  Cancelled: "orders.cancelled",
};

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const { t } = useLanguage();
  const style = ORDER_STATUS_STYLES[status];
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${style.bg} ${style.fg}`}
    >
      {t(ORDER_STATUS_LABEL_KEYS[status])}
    </span>
  );
}

export function OrderStatusEditor({
  order,
  onStatusChange,
}: {
  order: Order;
  onStatusChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { effectivePermissions } = useCurrentUser();
  const { t } = useLanguage();
  const style = ORDER_STATUS_STYLES[order.status];
  const availableStatuses = getAvailableOrderStatuses(effectivePermissions);

  useEffect(() => {
    if (!open) return;

    function handleDocumentClick(event: globalThis.MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [open]);

  // No status this user is allowed to set — fall back to a read-only chip
  // rather than an editor with an empty menu.
  if (availableStatuses.length === 0) {
    return <OrderStatusChip status={order.status} />;
  }

  async function handleSelect(status: OrderStatus, e: MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    const result = await updateOrderStatusAction(order.id, status);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    onStatusChange();
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${style.bg} ${style.fg}`}
      >
        {t(ORDER_STATUS_LABEL_KEYS[order.status])}
      </button>
      {open && (
        <ul
          className="absolute left-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft"
          onClick={(e) => e.stopPropagation()}
        >
          {availableStatuses.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={(e) => handleSelect(s, e)}
                className="block w-full px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface"
              >
                {t(ORDER_STATUS_LABEL_KEYS[s])}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Deterministic string formatting (no Date object / Intl locale APIs) so
// server- and client-rendered HTML always match and React never re-hydrates
// with different text.
export function isIsoDateValue(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export function formatDate(iso: string) {
  if (!isIsoDateValue(iso)) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
}

export function formatOptionalDate(iso?: string | null) {
  return iso && isIsoDateValue(iso) ? formatDate(iso) : "";
}

export function BalanceBadge({ order, todayIso }: { order: Order; todayIso: string }) {
  const { t } = useLanguage();
  if (order.balance <= 0) {
    return (
      <span className="inline-block rounded-full bg-chip-mint px-3 py-1 text-xs font-semibold text-chip-mint-fg">
        {t("common.paid")}
      </span>
    );
  }
  const isOverdue = order.deliveryDate < todayIso;
  const amount = formatCurrency(order.balance);
  if (isOverdue) {
    return (
      <span className="inline-block rounded-full bg-chip-red px-3 py-1 text-xs font-semibold text-chip-red-fg">
        {amount} {t("orders.overdue")}
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-chip-peach px-3 py-1 text-xs font-semibold text-chip-peach-fg">
      {amount} {t("orders.due")}
    </span>
  );
}

// Recorded-amount-based status (Unpaid / Partially Paid / Paid) — distinct
// from BalanceBadge above, which is delivery-date-based ("Paid" / "₹X due" /
// "₹X overdue") and stays as-is everywhere it's already used (Orders table,
// Pending Dues, Dashboard). This one reflects only advancePaid/balance, so
// it's what changes immediately when a payment is recorded, independent of
// the delivery date.
export function getPaymentStatusLabel(
  order: Pick<Order, "advancePaid" | "balance">
): "Unpaid" | "Partially Paid" | "Paid" {
  if (order.balance <= 0) return "Paid";
  if (order.advancePaid <= 0) return "Unpaid";
  return "Partially Paid";
}

export function PaymentStatusBadge({
  order,
}: {
  order: Pick<Order, "advancePaid" | "balance">;
}) {
  const { t } = useLanguage();
  const status = getPaymentStatusLabel(order);
  if (status === "Paid") {
    return (
      <span className="inline-block rounded-full bg-chip-mint px-3 py-1 text-xs font-semibold text-chip-mint-fg">
        {t("common.paid")}
      </span>
    );
  }
  if (status === "Partially Paid") {
    return (
      <span className="inline-block rounded-full bg-chip-peach px-3 py-1 text-xs font-semibold text-chip-peach-fg">
        {t("orders.partiallyPaid")}
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-chip-red px-3 py-1 text-xs font-semibold text-chip-red-fg">
      {t("orders.unpaid")}
    </span>
  );
}

export type OrdersSortKey = "orderDate" | "deliveryDate";
export type OrdersSortDir = "asc" | "desc";

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: OrdersSortKey;
  activeKey: OrdersSortKey;
  dir: OrdersSortDir;
  onSort: (key: OrdersSortKey) => void;
}) {
  const isActive = sortKey === activeKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="inline-flex items-center gap-1 hover:text-ink"
    >
      {label}
      {isActive ? (
        dir === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUp className="h-3.5 w-3.5" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 text-ink-faint" />
      )}
    </button>
  );
}

export function OrdersTable({
  orders,
  customersById,
  sortKey,
  sortDir,
  onSort,
  editableStatus = false,
  onStatusChange,
  onRowClick,
}: {
  orders: Order[];
  // Optional: a caller that already has a fresher/fuller Customer record
  // (e.g. one just edited in the same session) can pass a lookup map here to
  // override the row's own snapshot. Callers that don't (e.g. Reports'
  // Orders tab, Phase 6E) simply omit this — the table falls back to each
  // order's own customerSnapshot (captured at creation time), so no
  // customers.view-gated fetch is ever required just to render this table.
  customersById?: Record<string, Customer>;
  sortKey?: OrdersSortKey;
  sortDir?: OrdersSortDir;
  onSort?: (key: OrdersSortKey) => void;
  editableStatus?: boolean;
  onStatusChange?: () => void;
  onRowClick?: (order: Order) => void;
}) {
  // ISO (UTC) date string — consistent between server and client renders,
  // unlike locale-formatted dates (see formatDate's hydration-mismatch note).
  const todayIso = new Date().toISOString().slice(0, 10);
  const { hasPermission } = useCurrentUser();
  const canViewPayments = hasPermission("orders.viewPayments");
  const { t } = useLanguage();

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-soft py-8 text-center">
        <Inbox className="h-5 w-5 text-ink-faint" />
        <p className="text-sm text-ink-muted">{t("orders.noOrdersYet")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="bg-slate-50/80 text-[13px] font-bold text-slate-700">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">{t("orders.orderNo")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("orders.customer")}</th>
            <th className="whitespace-nowrap px-5 py-3">
              {sortKey && onSort ? (
                <SortableHeader
                  label={t("orders.orderDate")}
                  sortKey="orderDate"
                  activeKey={sortKey}
                  dir={sortDir ?? "desc"}
                  onSort={onSort}
                />
              ) : (
                t("orders.orderDate")
              )}
            </th>
            <th className="whitespace-nowrap px-5 py-3">
              {sortKey && onSort ? (
                <SortableHeader
                  label={t("orders.deliveryDate")}
                  sortKey="deliveryDate"
                  activeKey={sortKey}
                  dir={sortDir ?? "desc"}
                  onSort={onSort}
                />
              ) : (
                t("orders.deliveryDate")
              )}
            </th>
            <th className="px-5 py-3">{t("orders.items")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("orders.orderStatus")}</th>
            {canViewPayments && (
              <>
                <th className="whitespace-nowrap px-5 py-3 text-right">{t("orders.total")}</th>
                <th className="whitespace-nowrap px-5 py-3 text-right">{t("orders.balance")}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {orders.map((order) => {
            // Falls back to the order's own customerSnapshot (captured at
            // creation time) rather than a live customer lookup, so this
            // table never needs a customers.view-gated fetch just to show a
            // name/phone — important for callers like the Reports Orders tab
            // that intentionally don't fetch customers separately (Phase 6E).
            const customer = customersById?.[order.customerId] ?? order.customerSnapshot;
            const itemsSummary = order.items
              .map((i) => `${i.particular} x${i.qty}`)
              .join(", ");
            return (
              <tr
                key={order.id}
                onClick={() => onRowClick?.(order)}
                className="cursor-pointer border-t border-border-soft transition-colors hover:bg-emerald-50/50"
              >
                <td className="whitespace-nowrap px-5 py-3 font-semibold text-primary">
                  {order.orderNumber}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  {customer ? (
                    <Link
                      href={`/customers/${order.customerId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-slate-800 hover:text-primary hover:underline"
                    >
                      {customer.name}
                    </Link>
                  ) : (
                    <div className="text-ink">{t("common.unknown")}</div>
                  )}
                  {customer && (
                    <div className="text-xs font-medium text-slate-500">{customer.phone}</div>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-600">
                  {formatDate(order.orderDate)}
                </td>
                <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-600">
                  {formatDate(order.deliveryDate)}
                </td>
                <td className="px-5 py-3 font-medium text-slate-700">{itemsSummary}</td>
                <td className="whitespace-nowrap px-5 py-3">
                  {editableStatus && onStatusChange ? (
                    <OrderStatusEditor
                      order={order}
                      onStatusChange={onStatusChange}
                    />
                  ) : (
                    <OrderStatusChip status={order.status} />
                  )}
                </td>
                {canViewPayments && (
                  <>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(order.totalAmount)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <BalanceBadge order={order} todayIso={todayIso} />
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
