"use client";

import Link from "next/link";
import { formatDate } from "@/components/orders/orders-table";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";
import type { Order } from "@/lib/types";

function money(n: number) {
  return formatCurrency(n);
}

// Both dates are already YYYY-MM-DD strings — diffed via Date.UTC (never
// Date/Intl locale parsing) for the same server/client hydration reason
// orders-table.tsx's formatDate avoids them.
function daysOverdue(deliveryDate: string, todayIso: string): number {
  const [dy, dm, dd] = deliveryDate.split("-").map(Number);
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(dy, dm - 1, dd)) / DAY_MS
  );
}

// Reuses the existing Order Details drawer's "View Order" route
// (/orders?view=<id>, see app/(shell)/orders/page.tsx) — payment recording
// happens only from the Order Detail screen (RecordPaymentModal, already
// wired in order-details-drawer.tsx), so this table is read-only.
export function PendingDuesTable({
  orders,
}: {
  orders: Order[];
}) {
  const { t } = useLanguage();
  const todayIso = new Date().toISOString().slice(0, 10);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <p className="text-sm text-ink-muted">{t("payments.noPendingDues")}</p>
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
            <th className="whitespace-nowrap px-5 py-3">{t("common.phone")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("orders.deliveryDate")}</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">{t("payments.totalBill")}</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">{t("payments.paid")}</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">{t("payments.balanceDue")}</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">{t("payments.daysOverdue")}</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {orders.map((order) => {
            const isOverdue = order.deliveryDate < todayIso;
            const days = isOverdue ? daysOverdue(order.deliveryDate, todayIso) : null;
            return (
              <tr key={order.id} className="border-t border-border-soft">
                <td className="whitespace-nowrap px-5 py-3 font-semibold text-primary">
                  {order.orderNumber}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink">
                  {order.customerSnapshot?.name ?? t("common.unknown")}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {order.customerSnapshot?.phone ?? "—"}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {formatDate(order.deliveryDate)}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                  {money(order.totalAmount)}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                  {money(order.advancePaid)}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <span
                    className={
                      isOverdue
                        ? "inline-block rounded-full bg-chip-red px-3 py-1 text-xs font-semibold text-chip-red-fg"
                        : "inline-block rounded-full bg-chip-peach px-3 py-1 text-xs font-semibold text-chip-peach-fg"
                    }
                  >
                    {money(order.balance)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                  {days !== null ? days : "-"}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/orders?view=${order.id}`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {t("payments.viewOrder")}
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
