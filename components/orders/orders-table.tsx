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

export const ORDER_STATUS_STYLES: Record<OrderStatus, { bg: string; fg: string }> = {
  "In Progress": { bg: "bg-chip-blue", fg: "text-chip-blue-fg" },
  Ready: { bg: "bg-chip-purple", fg: "text-chip-purple-fg" },
  Delivered: { bg: "bg-chip-mint", fg: "text-chip-mint-fg" },
  Delayed: { bg: "bg-chip-red", fg: "text-chip-red-fg" },
  Cancelled: { bg: "bg-chip-info", fg: "text-chip-info-fg" },
};

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const style = ORDER_STATUS_STYLES[status];
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${style.bg} ${style.fg}`}
    >
      {status}
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
  const style = ORDER_STATUS_STYLES[order.status];

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
        {order.status}
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
            {orderStatuses.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={(e) => handleSelect(s, e)}
                  className="block w-full px-3 py-2 text-left text-xs font-medium text-ink hover:bg-surface"
                >
                  {s}
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
  if (order.balance <= 0) {
    return (
      <span className="inline-block rounded-full bg-chip-mint px-3 py-1 text-xs font-semibold text-chip-mint-fg">
        Paid
      </span>
    );
  }
  const isOverdue = order.deliveryDate < todayIso;
  const amount = `₹${order.balance.toLocaleString("en-IN")}`;
  if (isOverdue) {
    return (
      <span className="inline-block rounded-full bg-chip-red px-3 py-1 text-xs font-semibold text-chip-red-fg">
        {amount} overdue
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-chip-peach px-3 py-1 text-xs font-semibold text-chip-peach-fg">
      {amount} due
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

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <Inbox className="mb-1 h-6 w-6 text-ink-faint" />
        <p className="text-sm text-ink-muted">No orders yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">Order No</th>
            <th className="whitespace-nowrap px-5 py-3">Customer</th>
            <th className="whitespace-nowrap px-5 py-3">
              {sortKey && onSort ? (
                <SortableHeader
                  label="Order Date"
                  sortKey="orderDate"
                  activeKey={sortKey}
                  dir={sortDir ?? "desc"}
                  onSort={onSort}
                />
              ) : (
                "Order Date"
              )}
            </th>
            <th className="whitespace-nowrap px-5 py-3">
              {sortKey && onSort ? (
                <SortableHeader
                  label="Delivery Date"
                  sortKey="deliveryDate"
                  activeKey={sortKey}
                  dir={sortDir ?? "desc"}
                  onSort={onSort}
                />
              ) : (
                "Delivery Date"
              )}
            </th>
            <th className="px-5 py-3">Items</th>
            <th className="whitespace-nowrap px-5 py-3">Order Status</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">Total</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">Balance</th>
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
                    <div className="text-ink">Unknown</div>
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
                <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                  ₹{order.totalAmount.toLocaleString("en-IN")}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <BalanceBadge order={order} todayIso={todayIso} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
