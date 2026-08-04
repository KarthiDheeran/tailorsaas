"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarDays,
  AlertTriangle,
  ExternalLink,
  History,
  MapPin,
  Phone,
  ReceiptText,
  Repeat,
  ShoppingBag,
  Truck,
  User,
  UserRound,
  WalletCards,
} from "lucide-react";
import type {
  Customer,
  Order,
} from "@/lib/types";
import type { CustomerDetail } from "@/lib/customers-db";
import { formatDate } from "@/components/orders/orders-table";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_4px_14px_rgba(15,23,42,0.06)]">
      <h3 className="mb-3 flex items-center gap-2.5 text-[21px] font-bold tracking-tight text-ink">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-tint text-primary">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </div>
  );
}

export function NewOrderSummaryPanel({
  customer,
  detail,
  onRepeatOrder,
  repeatCopyMessage,
  newCustomerPending = false,
  hideCustomerSummary = false,
}: {
  customer: Customer | null;
  detail: CustomerDetail | undefined;
  onRepeatOrder: (order: Order) => void;
  repeatCopyMessage?: string | null;
  newCustomerPending?: boolean;
  hideCustomerSummary?: boolean;
}) {
  const { hasPermission } = useCurrentUser();
  const canViewPayments = hasPermission("orders.viewPayments");
  const { t } = useLanguage();
  const [showAllPreviousOrders, setShowAllPreviousOrders] = useState(false);

  if (!customer) {
    if (newCustomerPending) {
      return (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-soft bg-white p-5 text-sm text-ink-muted">
          <User className="h-4 w-4 shrink-0 text-ink-faint" />
          New customer details will be saved with this order.
        </div>
      );
    }
    return null;
  }

  if (!detail) {
    return (
      <div className="rounded-xl border border-border-soft bg-white p-5 text-sm text-ink-muted shadow-soft">
        Loading customer summary...
      </div>
    );
  }

  const recentOrders = [...detail.orders]
    .filter((order) => order.status !== "Cancelled")
    .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1));
  const today = new Date().toISOString().slice(0, 10);
  const undeliveredOrders = detail.orders
    .filter((order) => order.status !== "Delivered" && order.status !== "Cancelled")
    .sort((a, b) => (a.deliveryDate < b.deliveryDate ? -1 : 1));
  const overdueUndeliveredOrders = undeliveredOrders.filter(
    (order) => Boolean(order.deliveryDate) && order.deliveryDate < today
  );
  const visibleRecentOrders = showAllPreviousOrders
    ? recentOrders
    : recentOrders.slice(0, 2);

  return (
    <div className="space-y-3">
      {undeliveredOrders.length > 0 && (
        <div
          role="alert"
          className={`rounded-2xl border p-4 shadow-[0_4px_14px_rgba(15,23,42,0.06)] ${
            overdueUndeliveredOrders.length > 0
              ? "border-warning/30 bg-warning-soft"
              : "border-info/30 bg-info-soft"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${overdueUndeliveredOrders.length > 0 ? "bg-warning-soft text-warning" : "bg-info-soft text-info"}`}>
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-ink">Previous Order Attention</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {overdueUndeliveredOrders.length > 0
                  ? `${overdueUndeliveredOrders.length} previous order${overdueUndeliveredOrders.length === 1 ? " is" : "s are"} past the promised delivery date.`
                  : `${undeliveredOrders.length} previous order${undeliveredOrders.length === 1 ? " is" : "s are"} not yet delivered.`}
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {undeliveredOrders.slice(0, 2).map((order) => {
              const overdue = Boolean(order.deliveryDate) && order.deliveryDate < today;
              return (
                <div key={order.id} className="rounded-xl border border-black/5 bg-white/75 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/orders?view=${order.id}`} className="min-w-0 truncate text-sm font-bold text-primary hover:underline">
                      {order.orderNumber}
                    </Link>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${overdue ? "bg-danger-soft text-danger" : "bg-chip-info text-ink"}`}>
                      {overdue ? "Delivery overdue" : order.status}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-[13px] leading-5 text-ink-muted">
                    {order.items.map((item) => `${item.particular} x${item.qty}`).join(", ")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-muted">
                    <span>Promised: {order.deliveryDate ? formatDate(order.deliveryDate) : "Not set"}</span>
                    {canViewPayments && order.balance > 0 && (
                      <span className="font-semibold text-warning">Due {formatCurrency(order.balance)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/orders?view=${undeliveredOrders[0].id}`} className="inline-flex h-9 items-center justify-center rounded-lg border border-primary bg-white px-3 text-[13px] font-semibold text-primary transition-colors hover:bg-primary-tint">
              View Previous Order
            </Link>
            <Link href="/delivery" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark">
              <Truck className="h-3.5 w-3.5" aria-hidden="true" />
              Open Delivery
            </Link>
          </div>
        </div>
      )}
      {!hideCustomerSummary && <Card
        title={t("orders.customerSummary")}
        icon={<UserRound className="h-5 w-5" aria-hidden="true" />}
      >
        <div className="flex items-center gap-3 rounded-xl bg-surface-muted p-2.5">
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-primary-tint text-xl font-bold text-primary">
            {customer.name.trim().charAt(0).toUpperCase() || <UserRound className="h-6 w-6" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[19px] font-bold text-ink">{customer.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{customer.phone}</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{customer.area || "-"}</span>
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border-soft bg-white p-2.5">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink-muted">
              <ShoppingBag className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>{t("orders.totalOrders")}</span>
            </div>
            <p className="mt-1 text-[22px] font-bold leading-none text-ink">
              {detail.totalOrdersCount ?? detail.orders.length}
            </p>
          </div>
          <div className="rounded-xl border border-border-soft bg-white p-2.5">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink-muted">
              <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>{t("orders.lastOrder")}</span>
            </div>
            <p className="mt-1 whitespace-nowrap text-[15px] font-semibold leading-none text-ink">
              {detail.lastOrderDate ? formatDate(detail.lastOrderDate) : "-"}
            </p>
          </div>
          {canViewPayments && (
            <div className="col-span-2 rounded-xl border border-warning/30 bg-warning-soft p-2.5">
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink-muted">
                <WalletCards className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                <span>{t("orders.outstandingBalance")}</span>
              </div>
              <p className={`mt-1 text-[22px] font-extrabold leading-none ${detail.outstandingBalance > 0 ? "text-warning" : "text-success"}`}>
                {formatCurrency(detail.outstandingBalance)}
              </p>
            </div>
          )}
        </div>

        <div className="mt-3">
          <Link
            href={`/customers/${customer.id}`}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-primary bg-white px-4 text-[15px] font-semibold text-primary transition-colors hover:bg-primary-tint focus:outline-none focus:ring-2 focus:ring-primary-tint"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("common.viewProfile")}
          </Link>
        </div>
      </Card>}

      {recentOrders.length > 0 && (
        <Card
          title={t("orders.previousOrders")}
          icon={<History className="h-5 w-5" aria-hidden="true" />}
        >
          {repeatCopyMessage && (
            <p className="mb-3 rounded-xl border border-success/30 bg-primary-tint px-3 py-2 text-sm font-medium text-success">
              {repeatCopyMessage}
            </p>
          )}
          <div className={`space-y-2.5 ${showAllPreviousOrders ? "max-h-[min(52vh,620px)] overflow-y-auto pr-1" : ""}`}>
            {visibleRecentOrders.map((o) => (
              <div
                key={o.id}
                className="rounded-xl border border-border-soft bg-white p-3 text-sm transition-all duration-200 hover:border-primary/30 hover:bg-surface-muted hover:shadow-[0_4px_12px_rgba(15,118,110,0.08)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-bold text-primary">
                    <ReceiptText className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{o.orderNumber}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[13px] text-ink-muted">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatDate(o.orderDate)}
                  </span>
                </div>
                <p className="mt-2 flex items-start gap-1.5 break-words text-[14px] leading-5 text-ink-muted">
                  <ShoppingBag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  {o.items.map((i) => `${i.particular} x${i.qty}`).join(", ")}
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <span className="block text-[13px] text-ink-muted">Total</span>
                    <span className="text-[18px] font-bold text-ink">
                    {formatCurrency(o.totalAmount)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRepeatOrder(o)}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary-tint px-3 text-[13px] font-semibold text-primary transition-colors hover:bg-primary-tint focus:outline-none focus:ring-2 focus:ring-primary-tint"
                  >
                    <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                    Use This Order
                  </button>
                </div>
              </div>
            ))}
          </div>
          {recentOrders.length > 2 && (
            <button
              type="button"
              onClick={() => setShowAllPreviousOrders((current) => !current)}
              className="mt-3 inline-flex h-9 items-center rounded-lg px-2 text-[13px] font-semibold text-primary transition-colors hover:bg-primary-tint focus:outline-none focus:ring-2 focus:ring-primary-tint"
            >
              {showAllPreviousOrders ? "Show less" : `View all (${recentOrders.length})`}
            </button>
          )}
        </Card>
      )}
    </div>
  );
}
