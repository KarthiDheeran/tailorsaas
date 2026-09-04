"use client";

import type { ReactNode } from "react";
import { formatDate } from "@/components/orders/orders-table";
import { PaymentTypeChip } from "@/components/orders/payment-history-list";
import { useLanguage } from "@/components/i18n/language-provider";
import type { PaymentRow } from "@/lib/reports";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

function money(n: number) {
  return formatCurrency(n);
}

// Phase 7F: extracted from components/reports/payments-report-view.tsx so
// the new dedicated Payments page (operational, gated on
// orders.viewPayments) and Reports' Payments tab (analysis, gated on
// reports.view) share one table instead of two copies of the same markup —
// they render the exact same PaymentRow shape from lib/reports.ts's
// getPaymentsReport either way. `renderActions` is omitted on the
// read-only Reports tab (per its own no-new-mutations rule), passed on the
// Payments page for View Order/Void.
//
// Phase 7G: showNotes/showRecordedBy default to true (Reports' own usage
// passes neither, so it keeps every column exactly as before) — the
// Payments page passes both false, since its trimmed "transaction
// activity" column set (Date/Customer/Order No/Amount/Mode/Type/Status/
// Actions) is deliberately narrower than Reports' analytical one, per the
// two screens now being explicitly differentiated.
export function PaymentLedgerTable({
  rows,
  emptyMessage,
  renderActions,
  showNotes = true,
  showRecordedBy = true,
  showCollectedBy = false,
}: {
  rows: PaymentRow[];
  emptyMessage: string;
  renderActions?: (row: PaymentRow) => ReactNode;
  showNotes?: boolean;
  showRecordedBy?: boolean;
  showCollectedBy?: boolean;
}) {
  const { t } = useLanguage();

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <p className="text-sm text-ink-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">{t("common.date")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("reports.orderNo")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("orders.customer")}</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">{t("common.amount")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("orders.paymentMode")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("reports.paymentType")}</th>
            {showCollectedBy && <th className="whitespace-nowrap px-5 py-3">Collected By</th>}
            {showNotes && <th className="px-5 py-3">{t("common.notes")}</th>}
            <th className="whitespace-nowrap px-5 py-3">{t("common.status")}</th>
            {showRecordedBy && (
              <th className="whitespace-nowrap px-5 py-3">{t("reports.recordedBy")}</th>
            )}
            {renderActions && (
              <th className="whitespace-nowrap px-5 py-3 text-right">
                {t("common.actions")}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {rows.map((row) => (
            <tr
              key={row.payment.id}
              className={cn(
                "border-t border-border-soft",
                row.payment.voided && "opacity-60"
              )}
            >
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {formatDate(row.payment.paymentDate)}
              </td>
              <td className="whitespace-nowrap px-5 py-3 font-semibold text-primary">
                {row.orderNumber}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink">
                {row.customer?.name ?? "Unknown"}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                {money(row.payment.amount)}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {row.payment.paymentMode}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                <PaymentTypeChip type={row.payment.paymentType} />
              </td>
              {showCollectedBy && <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{row.payment.receivedByOperatorName ?? "—"}</td>}
              {showNotes && (
                <td className="px-5 py-3 text-ink-muted">
                  {row.payment.notes || "—"}
                </td>
              )}
              <td className="whitespace-nowrap px-5 py-3">
                {row.payment.voided ? (
                  <span className="inline-block rounded-full bg-chip-info px-2.5 py-0.5 text-xs font-semibold text-chip-info-fg">
                    {t("orders.voided")}
                    {row.payment.voidReason ? ` — ${row.payment.voidReason}` : ""}
                  </span>
                ) : (
                  <span className="inline-block rounded-full bg-chip-mint px-2.5 py-0.5 text-xs font-semibold text-chip-mint-fg">
                    {t("common.active")}
                  </span>
                )}
              </td>
              {showRecordedBy && (
                <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                  {row.recordedByName ?? "—"}
                </td>
              )}
              {renderActions && (
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  {renderActions(row)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
