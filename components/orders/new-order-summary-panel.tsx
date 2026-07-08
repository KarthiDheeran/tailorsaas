"use client";

import Link from "next/link";
import { Repeat, User } from "lucide-react";
import type { Customer, Order } from "@/lib/types";
import {
  getCustomerMeasurements,
  getGarmentMeasurementsForCustomer,
} from "@/lib/data/stub-data";
import { getCustomerDetail } from "@/lib/customers";
import { BalanceBadge, OrderStatusChip, formatDate } from "@/components/orders/orders-table";
import { countFilledFields } from "@/components/orders/garment-measurement-modal";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <h3 className="mb-3 text-[17px] font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

export function NewOrderSummaryPanel({
  customer,
  onRepeatOrder,
}: {
  customer: Customer | null;
  onRepeatOrder: (order: Order) => void;
}) {
  const { hasPermission } = useCurrentUser();
  const canViewPayments = hasPermission("orders.viewPayments");
  const { t } = useLanguage();

  if (!customer) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border-soft bg-white p-5 text-sm text-ink-muted">
        <User className="h-4 w-4 shrink-0 text-ink-faint" />
        {t("orders.enterPhoneToLookup")}
      </div>
    );
  }

  const detail = getCustomerDetail(customer);
  const measurements = getCustomerMeasurements(customer.id);
  const filledMeasurementCount = measurements
    ? Object.values(measurements.values).filter((v) => v.trim() !== "").length
    : 0;
  // Per-garment-type saved records (e.g. "Blouse: 9 fields saved") take
  // priority since they're the more specific, garment-scoped source; only
  // fall back to the generic customer baseline when none exist yet.
  const garmentMeasurements = getGarmentMeasurementsForCustomer(customer.id);
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <Card title={t("orders.customerSummary")}>
        <div className="space-y-1.5 text-sm">
          <p className="font-semibold text-ink">{customer.name}</p>
          <p className="text-ink-muted">{customer.phone}</p>
          <p className="text-ink-muted">{customer.area || "—"}</p>
          <div className="flex items-center justify-between pt-2">
            <span className="text-ink-muted">{t("orders.totalOrders")}</span>
            <span className="font-medium text-ink">{detail.orders.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">{t("orders.lastOrder")}</span>
            <span className="font-medium text-ink">
              {detail.lastOrderDate ? formatDate(detail.lastOrderDate) : "—"}
            </span>
          </div>
          {canViewPayments && (
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t("orders.outstandingBalance")}</span>
              <span className="font-medium text-ink">
                ₹{detail.outstandingBalance.toLocaleString("en-IN")}
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
          {detail.orders.length > 0 && (
            <button
              type="button"
              onClick={() => onRepeatOrder(detail.orders[0])}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
            >
              <Repeat className="h-3.5 w-3.5" />
              {t("orders.repeatLastOrder")}
            </button>
          )}
        </div>
      </Card>

      <Card title={t("orders.savedMeasurements")}>
        {garmentMeasurements.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {garmentMeasurements.map((gm) => {
              const count = countFilledFields({
                garmentType: gm.garmentType,
                values: gm.values,
                fitNotes: gm.fitNotes ?? "",
                notes: gm.notes ?? "",
              });
              return (
                <li
                  key={gm.garmentType}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="font-medium text-ink">{gm.garmentType}</span>
                  <span className="text-ink-muted">
                    {count} {t("orders.fieldsSaved")}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : filledMeasurementCount > 0 ? (
          <p className="text-sm text-ink-muted">
            {filledMeasurementCount} {t("orders.fieldsSaved")}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">{t("orders.noSavedMeasurements")}</p>
        )}
      </Card>

      {detail.orders.length > 0 && (
        <Card title={t("orders.previousOrders")}>
          <div className="space-y-3">
            {detail.orders.map((o) => (
              <div
                key={o.id}
                className="space-y-1.5 border-b border-border-soft pb-3 text-sm last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-primary">
                    {o.orderNumber}
                  </span>
                  <span className="text-ink-muted">{formatDate(o.orderDate)}</span>
                </div>
                <p className="break-words text-ink-muted">
                  {o.items.map((i) => `${i.particular} x${i.qty}`).join(", ")}
                </p>
                {canViewPayments && (
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Total</span>
                    <span className="font-medium text-ink">
                      ₹{o.totalAmount.toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <OrderStatusChip status={o.status} />
                  {canViewPayments && (
                    <BalanceBadge order={o} todayIso={todayIso} />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRepeatOrder(o)}
                  className="flex items-center gap-1.5 pt-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Repeat className="h-3 w-3" />
                  Repeat Order
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
