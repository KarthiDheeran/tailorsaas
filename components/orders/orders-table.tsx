"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ChevronsUpDown, Inbox } from "lucide-react";
import type { Order, OrderStatus } from "@/lib/types";
import {
  getCustomerById,
  orderStatuses,
  updateOrderStatus,
} from "@/lib/data/stub-data";
import { hasPermission, type Permission } from "@/lib/permissions";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

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
  const { effectivePermissions } = useCurrentUser();
  const { t } = useLanguage();
  const style = ORDER_STATUS_STYLES[order.status];
  const availableStatuses = getAvailableOrderStatuses(effectivePermissions);

  // No status this user is allowed to set — fall back to a read-only chip
  // rather than an editor with an empty menu.
  if (availableStatuses.length === 0) {
    return <OrderStatusChip status={order.status} />;
  }

  function handleSelect(status: OrderStatus, e: MouseEvent) {
    e.stopPropagation();
    updateOrderStatus(order.id, status);
    setOpen(false);
    onStatusChange();
  }

  return (
    <div className="relative inline-block">
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
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <ul className="absolute left-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border-soft bg-white shadow-soft">
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
        </>
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
export function formatDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
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
  const amount = `₹${order.balance.toLocaleString("en-IN")}`;
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
  sortKey,
  sortDir,
  onSort,
  editableStatus = false,
  onStatusChange,
  onRowClick,
}: {
  orders: Order[];
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
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <Inbox className="mb-1 h-6 w-6 text-ink-faint" />
        <p className="text-sm text-ink-muted">{t("orders.noOrdersYet")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
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
            const customer = getCustomerById(order.customerId);
            const itemsSummary = order.items
              .map((i) => `${i.particular} x${i.qty}`)
              .join(", ");
            return (
              <tr
                key={order.id}
                onClick={() => onRowClick?.(order)}
                className="cursor-pointer border-t border-border-soft transition-colors hover:bg-surface"
              >
                <td className="whitespace-nowrap px-5 py-3 font-semibold text-primary">
                  {order.orderNumber}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  {customer ? (
                    <Link
                      href={`/customers/${customer.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-ink hover:text-primary hover:underline"
                    >
                      {customer.name}
                    </Link>
                  ) : (
                    <div className="text-ink">{t("common.unknown")}</div>
                  )}
                  {customer && (
                    <div className="text-xs text-ink-muted">{customer.phone}</div>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {formatDate(order.orderDate)}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {formatDate(order.deliveryDate)}
                </td>
                <td className="px-5 py-3 text-ink-muted">{itemsSummary}</td>
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
                    <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                      ₹{order.totalAmount.toLocaleString("en-IN")}
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
