"use client";

import { useMemo, useState } from "react";
import { IndianRupee, Receipt, ShoppingBag, TrendingUp } from "lucide-react";
import { formatDate } from "@/components/orders/orders-table";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ReportActions } from "@/components/reports/report-actions";
import { ReportStatCard } from "@/components/reports/report-stat-card";
import { downloadCsv } from "@/lib/csv";
import {
  getDateRangeForPreset,
  getSalesReport,
  type DateRange,
  type DateRangePreset,
} from "@/lib/reports";
import { paymentModes } from "@/lib/data/stub-data";
import type { PaymentMode } from "@/lib/types";

function money(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function SalesReportView({ todayIso }: { todayIso: string }) {
  const [preset, setPreset] = useState<DateRangePreset>("thisMonth");
  const [customRange, setCustomRange] = useState<DateRange>({
    from: todayIso,
    to: todayIso,
  });
  const [paymentMode, setPaymentMode] = useState<PaymentMode | "">("");

  const range = getDateRangeForPreset(preset, todayIso, customRange);
  const report = useMemo(
    () => getSalesReport(range, paymentMode || undefined),
    [range.from, range.to, paymentMode]
  );

  function handleExport() {
    downloadCsv(
      `sales-report-${todayIso}.csv`,
      ["Date", "Orders", "Gross Sales", "Amount Collected", "Balance Pending"],
      report.rows.map((r) => [
        r.date,
        r.orders,
        r.grossSales,
        r.amountCollected,
        r.balancePending,
      ])
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter
          preset={preset}
          custom={customRange}
          onPresetChange={setPreset}
          onCustomChange={setCustomRange}
        />
        <div className="flex items-center gap-2 print:hidden">
          <select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode | "")}
            className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
          >
            <option value="">All Payment Modes</option>
            {paymentModes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <ReportActions onExport={handleExport} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportStatCard
          label="Total Sales"
          value={money(report.totalSales)}
          sublabel="Order value created"
          icon={ShoppingBag}
        />
        <ReportStatCard
          label="Revenue Collected"
          value={money(report.revenueCollected)}
          sublabel="Money actually received"
          icon={IndianRupee}
        />
        <ReportStatCard
          label="Total Orders"
          value={String(report.totalOrders)}
          icon={Receipt}
        />
        <ReportStatCard
          label="Average Order Value"
          value={money(Math.round(report.avgOrderValue))}
          icon={TrendingUp}
        />
      </div>

      {report.rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
          <p className="text-sm text-ink-muted">No sales in this range.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
          <table className="w-full text-left">
            <thead className="text-[13px] font-semibold text-ink-muted">
              <tr className="border-b border-border-soft">
                <th className="whitespace-nowrap px-5 py-3">Date</th>
                <th className="whitespace-nowrap px-5 py-3 text-right">Orders</th>
                <th className="whitespace-nowrap px-5 py-3 text-right">Gross Sales</th>
                <th className="whitespace-nowrap px-5 py-3 text-right">Amount Collected</th>
                <th className="whitespace-nowrap px-5 py-3 text-right">Balance Pending</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {report.rows.map((row) => (
                <tr key={row.date} className="border-t border-border-soft">
                  <td className="whitespace-nowrap px-5 py-3 text-ink">
                    {formatDate(row.date)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                    {row.orders}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-ink">
                    {money(row.grossSales)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                    {money(row.amountCollected)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                    {money(row.balancePending)}
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
