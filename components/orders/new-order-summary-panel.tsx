"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarDays,
  ExternalLink,
  History,
  MapPin,
  Phone,
  ReceiptText,
  Repeat,
  ShoppingBag,
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
    <div className="rounded-2xl border border-[#DCE5EA] bg-white p-4 shadow-[0_4px_14px_rgba(15,23,42,0.06)]">
      <h3 className="mb-3 flex items-center gap-2.5 text-[21px] font-bold tracking-tight text-[#111827]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#0F766E]">
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
  const visibleRecentOrders = showAllPreviousOrders
    ? recentOrders
    : recentOrders.slice(0, 2);

  return (
    <div className="space-y-3">
      <Card
        title={t("orders.customerSummary")}
        icon={<UserRound className="h-5 w-5" aria-hidden="true" />}
      >
        <div className="flex items-center gap-3 rounded-xl bg-[#F8FAFC] p-2.5">
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-[#ECFDF5] text-xl font-bold text-[#0F766E]">
            {customer.name.trim().charAt(0).toUpperCase() || <UserRound className="h-6 w-6" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[19px] font-bold text-[#111827]">{customer.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[#64748B]">
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{customer.phone}</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[#64748B]">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{customer.area || "-"}</span>
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-2.5">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#64748B]">
              <ShoppingBag className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
              <span>{t("orders.totalOrders")}</span>
            </div>
            <p className="mt-1 text-[22px] font-bold leading-none text-[#111827]">{detail.orders.length}</p>
          </div>
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-2.5">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#64748B]">
              <CalendarDays className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
              <span>{t("orders.lastOrder")}</span>
            </div>
            <p className="mt-1 whitespace-nowrap text-[15px] font-semibold leading-none text-[#111827]">
              {detail.lastOrderDate ? formatDate(detail.lastOrderDate) : "-"}
            </p>
          </div>
          {canViewPayments && (
            <div className="col-span-2 rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-2.5">
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#64748B]">
                <WalletCards className="h-3.5 w-3.5 text-[#C2410C]" aria-hidden="true" />
                <span>{t("orders.outstandingBalance")}</span>
              </div>
              <p className={`mt-1 text-[22px] font-extrabold leading-none ${detail.outstandingBalance > 0 ? "text-[#C2410C]" : "text-[#15803D]"}`}>
                {formatCurrency(detail.outstandingBalance)}
              </p>
            </div>
          )}
        </div>

        <div className="mt-3">
          <Link
            href={`/customers/${customer.id}`}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#0F766E] bg-white px-4 text-[15px] font-semibold text-[#0F766E] transition-colors hover:bg-[#ECFDF5] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/30"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("common.viewProfile")}
          </Link>
        </div>
      </Card>

      {recentOrders.length > 0 && (
        <Card
          title={t("orders.previousOrders")}
          icon={<History className="h-5 w-5" aria-hidden="true" />}
        >
          {repeatCopyMessage && (
            <p className="mb-3 rounded-xl border border-[#BBF7D0] bg-[#ECFDF5] px-3 py-2 text-sm font-medium text-[#15803D]">
              {repeatCopyMessage}
            </p>
          )}
          <div className={`space-y-2.5 ${showAllPreviousOrders ? "max-h-[min(52vh,620px)] overflow-y-auto pr-1" : ""}`}>
            {visibleRecentOrders.map((o) => (
              <div
                key={o.id}
                className="rounded-xl border border-[#E2E8F0] bg-white p-3 text-sm transition-all duration-200 hover:border-[#B7E3DC] hover:bg-[#F8FFFD] hover:shadow-[0_4px_12px_rgba(15,118,110,0.08)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-bold text-[#0F766E]">
                    <ReceiptText className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{o.orderNumber}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[13px] text-[#64748B]">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatDate(o.orderDate)}
                  </span>
                </div>
                <p className="mt-2 flex items-start gap-1.5 break-words text-[14px] leading-5 text-[#475569]">
                  <ShoppingBag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F766E]" aria-hidden="true" />
                  {o.items.map((i) => `${i.particular} x${i.qty}`).join(", ")}
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <span className="block text-[13px] text-[#64748B]">Total</span>
                    <span className="text-[18px] font-bold text-[#111827]">
                    {formatCurrency(o.totalAmount)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRepeatOrder(o)}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#ECFDF5] px-3 text-[13px] font-semibold text-[#0F766E] transition-colors hover:bg-[#D1FAE5] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/30"
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
              className="mt-3 inline-flex h-9 items-center rounded-lg px-2 text-[13px] font-semibold text-[#0F766E] transition-colors hover:bg-[#ECFDF5] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/30"
            >
              {showAllPreviousOrders ? "Show less" : `View all (${recentOrders.length})`}
            </button>
          )}
        </Card>
      )}
    </div>
  );
}
