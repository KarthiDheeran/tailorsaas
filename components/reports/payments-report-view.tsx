"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, IndianRupee, Wallet } from "lucide-react";
import { formatDate } from "@/components/orders/orders-table";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ReportActions } from "@/components/reports/report-actions";
import { ReportStatCard } from "@/components/reports/report-stat-card";
import { downloadCsv } from "@/lib/csv";
import {
  getDateRangeForPreset,
  getPaymentsReport,
  type DateRange,
  type DateRangePreset,
} from "@/lib/reports";
import { paymentModes } from "@/lib/data/stub-data";
import type { PaymentMode } from "@/lib/types";
import { cn } from "@/lib/utils";

function money(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function PaymentsReportView({ todayIso }: { todayIso: string }) {
  const [preset, setPreset] = useState<DateRangePreset>("thisMonth");
  const [customRange, setCustomRange] = useState<DateRange>({
    from: todayIso,
    to: todayIso,
  });
  const [paymentMode, setPaymentMode] = useState<PaymentMode | "">("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);

  const range = getDateRangeForPreset(preset, todayIso, customRange);
  const report = useMemo(
    () =>
      getPaymentsReport(
        {
          range,
          paymentMode: paymentMode || undefined,
          customerQuery,
          pendingOnly,
          overdueOnly,
        },
        todayIso
      ),
    [range.from, range.to, paymentMode, customerQuery, pendingOnly, overdueOnly, todayIso]
  );

  function handleExport() {
    downloadCsv(
      `payments-report-${todayIso}.csv`,
      ["Date", "Customer", "Order No", "Amount Collected", "Payment Mode", "Balance"],
      report.rows.map((r) => [
        r.order.orderDate,
        r.customer?.name ?? "Unknown",
        r.order.orderNumber,
        r.amountCollected,
        r.order.paymentMode,
        r.order.balance,
      ])
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter
            preset={preset}
            custom={customRange}
            onPresetChange={setPreset}
            onCustomChange={setCustomRange}
          />
          <select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode | "")}
            className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint print:hidden"
          >
            <option value="">All Payment Modes</option>
            {paymentModes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            placeholder="Search customer..."
            className="h-9 w-48 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint print:hidden"
          />
          <button
            type="button"
            onClick={() => setPendingOnly((v) => !v)}
            className={cn(
              "h-9 rounded-lg border px-3 text-sm font-medium transition-colors print:hidden",
              pendingOnly
                ? "border-primary bg-primary-tint text-primary"
                : "border-border bg-white text-ink-muted hover:bg-surface"
            )}
          >
            Pending Only
          </button>
          <button
            type="button"
            onClick={() => setOverdueOnly((v) => !v)}
            className={cn(
              "h-9 rounded-lg border px-3 text-sm font-medium transition-colors print:hidden",
              overdueOnly
                ? "border-primary bg-primary-tint text-primary"
                : "border-border bg-white text-ink-muted hover:bg-surface"
            )}
          >
            Overdue Only
          </button>
        </div>
        <ReportActions onExport={handleExport} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ReportStatCard
          label="Total Collected"
          value={money(report.totalCollected)}
          icon={IndianRupee}
        />
        <ReportStatCard
          label="Outstanding Balance"
          value={money(report.outstandingBalance)}
          icon={Wallet}
        />
        <ReportStatCard
          label="Overdue Balance"
          value={money(report.overdueBalance)}
          icon={AlertTriangle}
          tone={report.overdueBalance > 0 ? "warning" : "default"}
        />
      </div>

      {report.byMode.length > 0 && (
        <div className="mb-6 rounded-xl border border-border-soft bg-white p-5 shadow-soft">
          <p className="mb-3 text-[13px] font-medium text-ink-muted">
            Collected by Payment Mode
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {report.byMode.map((b) => (
              <div key={b.mode} className="flex items-baseline gap-2">
                <span className="text-sm text-ink-muted">{b.mode}</span>
                <span className="font-semibold text-ink">{money(b.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
          <p className="text-sm text-ink-muted">No payments match these filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
          <table className="w-full text-left">
            <thead className="text-[13px] font-semibold text-ink-muted">
              <tr className="border-b border-border-soft">
                <th className="whitespace-nowrap px-5 py-3">Date</th>
                <th className="whitespace-nowrap px-5 py-3">Customer</th>
                <th className="whitespace-nowrap px-5 py-3">Order No</th>
                <th className="whitespace-nowrap px-5 py-3 text-right">Amount Collected</th>
                <th className="whitespace-nowrap px-5 py-3">Payment Mode</th>
                <th className="whitespace-nowrap px-5 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {report.rows.map((row) => (
                <tr key={row.order.id} className="border-t border-border-soft">
                  <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                    {formatDate(row.order.orderDate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-ink">
                    {row.customer?.name ?? "Unknown"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-semibold text-primary">
                    {row.order.orderNumber}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                    {money(row.amountCollected)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                    {row.order.paymentMode}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                    {money(row.order.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
