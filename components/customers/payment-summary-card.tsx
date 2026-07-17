"use client";

import { formatDate } from "@/components/orders/orders-table";
import type { CustomerDetail } from "@/lib/customers-db";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";

function money(amount: number) {
  return formatCurrency(amount);
}

export function PaymentSummaryCard({ detail }: { detail: CustomerDetail }) {
  const { t } = useLanguage();
  const { totalOrdersValue, totalPaid, outstandingBalance, lastPaymentDate } =
    detail;

  const rows: { label: string; value: string; emphasis?: boolean }[] = [
    { label: t("customers.totalOrdersValue"), value: money(totalOrdersValue) },
    { label: t("customers.totalPaid"), value: money(totalPaid) },
    {
      label: t("customers.outstandingBalance"),
      value: money(outstandingBalance),
      emphasis: outstandingBalance > 0,
    },
    {
      label: t("customers.lastPaymentDate"),
      value: lastPaymentDate ? formatDate(lastPaymentDate) : "—",
    },
  ];

  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <h3 className="mb-4 text-[17px] font-semibold text-ink">
        {t("customers.paymentSummary")}
      </h3>
      <dl className="space-y-3">
        {rows.map(({ label, value, emphasis }) => (
          <div key={label} className="flex items-center justify-between">
            <dt className="text-[13px] text-ink-muted">{label}</dt>
            <dd
              className={
                emphasis
                  ? "text-sm font-semibold text-chip-peach-fg"
                  : "text-sm font-semibold text-ink"
              }
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
