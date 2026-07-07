import { formatDate } from "@/components/orders/orders-table";
import type { CustomerDetail } from "@/lib/customers";

function money(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function PaymentSummaryCard({ detail }: { detail: CustomerDetail }) {
  const { totalOrdersValue, totalPaid, outstandingBalance, lastPaymentDate } =
    detail;

  const rows: { label: string; value: string; emphasis?: boolean }[] = [
    { label: "Total Orders Value", value: money(totalOrdersValue) },
    { label: "Total Paid", value: money(totalPaid) },
    {
      label: "Outstanding Balance",
      value: money(outstandingBalance),
      emphasis: outstandingBalance > 0,
    },
    {
      label: "Last Payment Date",
      value: lastPaymentDate ? formatDate(lastPaymentDate) : "—",
    },
  ];

  return (
    <div className="rounded-xl border border-border-soft bg-white p-5 shadow-soft">
      <h3 className="mb-4 text-[17px] font-semibold text-ink">
        Payment Summary
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
