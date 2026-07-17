"use client";

import Link from "next/link";
import { formatDate } from "@/components/orders/orders-table";
import type { FinancialAdjustmentLedgerRow } from "@/app/(shell)/payments/actions";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

function money(n: number) {
  return formatCurrency(n);
}

function signedAmount(row: FinancialAdjustmentLedgerRow) {
  const { adjustment } = row;
  if (adjustment.adjustmentType === "Discount") return `-${money(adjustment.amount)}`;
  if (adjustment.adjustmentType === "Extra Charge") return `+${money(adjustment.amount)}`;
  return `-${money(adjustment.amount)}`;
}

function typeClass(type: FinancialAdjustmentLedgerRow["adjustment"]["adjustmentType"]) {
  if (type === "Discount") return "bg-chip-mint text-chip-mint-fg";
  if (type === "Extra Charge") return "bg-chip-peach text-chip-peach-fg";
  return "bg-chip-blue text-chip-blue-fg";
}

export function FinancialAdjustmentsTable({
  rows,
}: {
  rows: FinancialAdjustmentLedgerRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <p className="text-sm text-ink-muted">No adjustments match these filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">Date</th>
            <th className="whitespace-nowrap px-5 py-3">Order No</th>
            <th className="whitespace-nowrap px-5 py-3">Customer</th>
            <th className="whitespace-nowrap px-5 py-3">Type</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">Amount</th>
            <th className="px-5 py-3">Reason</th>
            <th className="whitespace-nowrap px-5 py-3">Mode</th>
            <th className="whitespace-nowrap px-5 py-3">Status</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {rows.map((row) => {
            const { adjustment } = row;
            return (
              <tr
                key={adjustment.id}
                className={cn(
                  "border-t border-border-soft",
                  adjustment.voided && "opacity-60"
                )}
              >
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {formatDate(adjustment.adjustmentDate)}
                </td>
                <td className="whitespace-nowrap px-5 py-3 font-semibold text-primary">
                  {row.orderNumber}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink">
                  {row.customer?.name ?? "Unknown"}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeClass(
                      adjustment.adjustmentType
                    )}`}
                  >
                    {adjustment.adjustmentType}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-ink">
                  {signedAmount(row)}
                </td>
                <td className="min-w-48 px-5 py-3 text-ink-muted">
                  <div>{adjustment.reason}</div>
                  {adjustment.notes && (
                    <div className="text-xs text-ink-faint">{adjustment.notes}</div>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {adjustment.paymentMode ?? "—"}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  {adjustment.voided ? (
                    <span className="inline-block rounded-full bg-chip-info px-2.5 py-0.5 text-xs font-semibold text-chip-info-fg">
                      Voided{adjustment.voidReason ? ` - ${adjustment.voidReason}` : ""}
                    </span>
                  ) : (
                    <span className="inline-block rounded-full bg-chip-mint px-2.5 py-0.5 text-xs font-semibold text-chip-mint-fg">
                      Active
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <Link
                    href={`/orders?view=${row.orderId}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    View Order
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
