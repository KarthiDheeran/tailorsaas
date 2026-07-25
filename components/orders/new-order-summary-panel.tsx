"use client";

import Link from "next/link";
import { useState } from "react";
import { Repeat, User } from "lucide-react";
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-white p-4 shadow-soft">
      <h3 className="mb-2.5 text-[17px] font-semibold text-ink">{title}</h3>
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
}: {
  customer: Customer | null;
  detail: CustomerDetail | undefined;
  onRepeatOrder: (order: Order) => void;
  repeatCopyMessage?: string | null;
  newCustomerPending?: boolean;
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
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-soft bg-white p-5 text-sm text-ink-muted">
        <User className="h-4 w-4 shrink-0 text-ink-faint" />
        {t("orders.enterPhoneToLookup")}
      </div>
    );
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
  const visibleRecentOrders = showAllPreviousOrders
    ? recentOrders
    : recentOrders.slice(0, 2);

  return (
    <div className="space-y-4">
      <Card title={t("orders.customerSummary")}>
        <div className="space-y-1.5 text-sm">
          <p className="font-semibold text-ink">{customer.name}</p>
          <p className="text-ink-muted">{customer.phone}</p>
          <p className="text-ink-muted">{customer.area || "-"}</p>
          <div className="flex items-center justify-between pt-2">
            <span className="text-ink-muted">{t("orders.totalOrders")}</span>
            <span className="font-medium text-ink">{detail.orders.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">{t("orders.lastOrder")}</span>
            <span className="font-medium text-ink">
              {detail.lastOrderDate ? formatDate(detail.lastOrderDate) : "-"}
            </span>
          </div>
          {canViewPayments && (
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t("orders.outstandingBalance")}</span>
              <span className="font-medium text-ink">
                {formatCurrency(detail.outstandingBalance)}
              </span>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href={`/customers/${customer.id}`}
            className="rounded-lg border border-border bg-white px-3 py-2 text-center text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            {t("common.viewProfile")}
          </Link>
        </div>
      </Card>

      {recentOrders.length > 0 && (
        <Card title={t("orders.previousOrders")}>
          {repeatCopyMessage && (
            <p className="mb-3 rounded-lg bg-chip-mint px-3 py-2 text-xs font-medium text-chip-mint-fg">
              {repeatCopyMessage}
            </p>
          )}
          <div className="space-y-3">
            {visibleRecentOrders.map((o) => (
              <div
                key={o.id}
                className="space-y-1.5 border-b border-border-soft pb-3 text-sm last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-primary">
                    {o.orderNumber}
                  </span>
                  <span className="shrink-0 text-ink-muted">
                    {formatDate(o.orderDate)}
                  </span>
                </div>
                <p className="break-words text-ink-muted">
                  {o.items.map((i) => `${i.particular} x${i.qty}`).join(", ")}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Total</span>
                  <span className="font-medium text-ink">
                    {formatCurrency(o.totalAmount)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRepeatOrder(o)}
                  className="flex items-center gap-1.5 pt-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Repeat className="h-3 w-3" />
                  Use This Order
                </button>
              </div>
            ))}
          </div>
          {recentOrders.length > 2 && (
            <button
              type="button"
              onClick={() => setShowAllPreviousOrders((current) => !current)}
              className="mt-3 text-xs font-semibold text-primary hover:underline"
            >
              {showAllPreviousOrders ? "Show less" : `View all (${recentOrders.length})`}
            </button>
          )}
        </Card>
      )}
    </div>
  );
}
