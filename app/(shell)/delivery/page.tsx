"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  FileText,
  IndianRupee,
  Search,
  Truck,
} from "lucide-react";
import {
  getDeliveryDeskOrdersAction,
  markOrderDeliveredAction,
  type DeliveryDeskOrder,
} from "@/app/(shell)/delivery/actions";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { ContactActions } from "@/components/dashboard/contact-actions";
import { RecordPaymentModal } from "@/components/orders/record-payment-modal";
import {
  BalanceBadge,
  formatDate,
  OrderStatusChip,
} from "@/components/orders/orders-table";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";

type DeliveryFilter = "all" | "ready" | "due" | "balance" | "clear";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return `₹${Math.round(Number(value)).toLocaleString("en-IN")}`;
}

function customerLabel(row: DeliveryDeskOrder) {
  return row.customer?.name ?? row.order.customerSnapshot?.name ?? "Unknown customer";
}

function customerPhone(row: DeliveryDeskOrder) {
  return row.customer?.phone ?? row.order.customerSnapshot?.phone ?? "";
}

function itemsLabel(order: Order) {
  const pieces = order.items.reduce((sum, item) => sum + item.qty, 0);
  const garments = Array.from(new Set(order.items.map((item) => item.particular))).join(", ");
  return `${pieces} pc${pieces === 1 ? "" : "s"}${garments ? ` - ${garments}` : ""}`;
}

function DeliveryStatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
  tone: "green" | "amber" | "red" | "blue";
}) {
  const tones = {
    green: "bg-chip-mint text-chip-mint-fg",
    amber: "bg-chip-peach text-chip-peach-fg",
    red: "bg-chip-red text-chip-red-fg",
    blue: "bg-chip-blue text-chip-blue-fg",
  };
  return (
    <div className="rounded-lg border border-border-soft bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase text-ink-faint">{label}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function DeliveryDeskContent() {
  const { hasPermission } = useCurrentUser();
  const canRecordPayment = hasPermission("orders.recordPayment");
  const canMarkDelivered = hasPermission("orders.edit");
  const canPrintReceipt = hasPermission("orders.printCustomerReceipt");
  const today = todayIso();

  const [rows, setRows] = useState<DeliveryDeskOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DeliveryFilter>("all");
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    getDeliveryDeskOrdersAction(today)
      .then((result) => {
        if (cancelled) return;
        setRows(result);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load delivery desk."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [today]);

  const stats = useMemo(() => {
    const ready = rows.filter((row) => row.order.status === "Ready");
    const dueOrOverdue = rows.filter((row) => row.order.deliveryDate <= today);
    const balanceDue = rows.reduce((sum, row) => sum + Math.max(0, row.order.balance), 0);
    const canDeliver = ready.filter((row) => row.order.balance <= 0);
    return {
      ready: ready.length,
      dueOrOverdue: dueOrOverdue.length,
      balanceDue,
      canDeliver: canDeliver.length,
    };
  }, [rows, today]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const order = row.order;
      if (filter === "ready" && order.status !== "Ready") return false;
      if (filter === "due" && order.deliveryDate > today) return false;
      if (filter === "balance" && order.balance <= 0) return false;
      if (filter === "clear" && !(order.status === "Ready" && order.balance <= 0)) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        order.orderNumber,
        customerLabel(row),
        customerPhone(row),
        row.customer?.area ?? order.customerSnapshot?.area ?? "",
        order.items.map((item) => item.particular).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, query, filter, today]);

  function replaceOrder(order: Order) {
    setRows((current) =>
      current.map((row) => (row.order.id === order.id ? { ...row, order } : row))
    );
  }

  function removeOrder(orderId: string) {
    setRows((current) => current.filter((row) => row.order.id !== orderId));
  }

  function markDelivered(orderId: string) {
    setPendingOrderId(orderId);
    startTransition(async () => {
      const result = await markOrderDeliveredAction(orderId);
      setPendingOrderId(null);
      if (!result.success) {
        window.alert(result.error);
        return;
      }
      removeOrder(result.data.id);
    });
  }

  return (
    <div className="mx-auto max-w-7xl p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold text-ink">Delivery Desk</h1>
          <p className="text-sm text-ink-muted">
            Settle balances and hand over ready customer orders.
          </p>
        </div>
        <Link
          href="/orders"
          className="flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <ClipboardList className="h-4 w-4" />
          Orders
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DeliveryStatCard icon={Truck} label="Ready for handover" value={String(stats.ready)} tone="green" />
        <DeliveryStatCard icon={ClipboardList} label="Due or overdue" value={String(stats.dueOrOverdue)} tone="amber" />
        <DeliveryStatCard icon={IndianRupee} label="Balance to collect" value={money(stats.balanceDue)} tone="red" />
        <DeliveryStatCard icon={CheckCircle2} label="Clear to deliver" value={String(stats.canDeliver)} tone="blue" />
      </div>

      <div className="mb-4 rounded-lg border border-border-soft bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search order, customer, phone, area, or garment"
              className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["ready", "Ready"],
              ["due", "Due"],
              ["balance", "Balance"],
              ["clear", "Clear"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key as DeliveryFilter)}
                className={cn(
                  "h-10 rounded-lg border px-3 text-sm font-semibold transition-colors",
                  filter === key
                    ? "border-primary bg-primary-tint text-primary"
                    : "border-border bg-white text-ink-muted hover:bg-surface hover:text-ink"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loadError && <LoadError message={loadError} />}
      {!loaded ? (
        <LoadingState label="Loading delivery desk..." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-soft bg-white shadow-sm">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-surface text-left text-xs font-semibold uppercase text-ink-faint">
              <tr>
                <th className="px-5 py-3">Order</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Items</th>
                <th className="px-5 py-3">Delivery</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-right">Balance</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-ink-muted">
                    No delivery desk orders match this view.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const order = row.order;
                  const phone = customerPhone(row);
                  const canDeliverNow = order.status === "Ready" && order.balance <= 0;
                  const deliverDisabled = !canMarkDelivered || !canDeliverNow || pendingOrderId === order.id || isPending;
                  return (
                    <tr key={order.id} className="align-top hover:bg-surface/60">
                      <td className="px-5 py-4">
                        <Link
                          href={`/orders?view=${order.id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <div className="mt-1 text-xs text-ink-faint">
                          Ordered {formatDate(order.orderDate)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-ink">{customerLabel(row)}</div>
                        <div className="mt-1 text-xs text-ink-faint">{phone || "No phone"}</div>
                      </td>
                      <td className="max-w-[220px] px-5 py-4 text-ink-muted">
                        {itemsLabel(order)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-ink">{formatDate(order.deliveryDate)}</div>
                        {order.deliveryDate < today && (
                          <div className="mt-1 text-xs font-semibold text-chip-red-fg">Overdue</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <OrderStatusChip status={order.status} />
                      </td>
                      <td className="px-5 py-4 text-right font-medium text-ink">
                        {money(order.totalAmount)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <BalanceBadge order={order} todayIso={today} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {phone && (
                            <ContactActions
                              phone={phone}
                              message={`Hello ${customerLabel(row)}, your order ${order.orderNumber} is ready for delivery.`}
                            />
                          )}
                          {canPrintReceipt && (
                            <Link
                              href={`/orders/${order.id}/customer-receipt`}
                              target="_blank"
                              title="Receipt"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Link>
                          )}
                          {canRecordPayment && order.balance > 0 && (
                            <button
                              type="button"
                              onClick={() => setPaymentOrder(order)}
                              className="h-8 rounded-lg border border-border px-3 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                            >
                              Collect
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={deliverDisabled}
                            title={
                              !canMarkDelivered
                                ? "No permission"
                                : order.status !== "Ready"
                                  ? "Order is not ready"
                                  : order.balance > 0
                                    ? "Collect balance first"
                                    : "Mark delivered"
                            }
                            onClick={() => markDelivered(order.id)}
                            className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            Delivered
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {paymentOrder && (
        <RecordPaymentModal
          order={paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onRecorded={({ order }) => {
            replaceOrder(order);
            setPaymentOrder(null);
          }}
        />
      )}
    </div>
  );
}

export default function DeliveryPage() {
  return (
    <RequirePermission permission="orders.view">
      <DeliveryDeskContent />
    </RequirePermission>
  );
}
