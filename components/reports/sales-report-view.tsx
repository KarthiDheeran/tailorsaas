"use client";

import { useEffect, useState } from "react";
import { IndianRupee, Receipt, ShoppingBag, TrendingUp } from "lucide-react";
import { formatDate } from "@/components/orders/orders-table";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ReportActions } from "@/components/reports/report-actions";
import { ReportStatCard } from "@/components/reports/report-stat-card";
import { downloadCsv } from "@/lib/csv";
import { getSalesReportAction } from "@/app/(shell)/reports/actions";
import {
  getDateRangeForPreset,
  type DateRange,
  type DateRangePreset,
  type SalesReport,
} from "@/lib/reports";
import { paymentModes } from "@/lib/constants";
import type { PaymentMode } from "@/lib/types";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";

function money(n: number) {
  return formatCurrency(n);
}

const EMPTY_REPORT: SalesReport = {
  totalSales: 0,
  revenueCollected: 0,
  totalOrders: 0,
  avgOrderValue: 0,
  rows: [],
  monthlyRows: [],
  garmentRows: [],
};

export function SalesReportView({ todayIso }: { todayIso: string }) {
  const { t } = useLanguage();
  const [preset, setPreset] = useState<DateRangePreset>("thisMonth");
  const [customRange, setCustomRange] = useState<DateRange>({
    from: todayIso,
    to: todayIso,
  });
  const [paymentMode, setPaymentMode] = useState<PaymentMode | "">("");

  const range = getDateRangeForPreset(preset, todayIso, customRange);
  // Phase 6E: fetched via a Server Action now — a useMemo can't await, so
  // this became an effect + state, same conversion every other client
  // component went through since Phase 5A.
  const [report, setReport] = useState<SalesReport>(EMPTY_REPORT);

  useEffect(() => {
    let cancelled = false;
    getSalesReportAction(range, paymentMode || undefined).then((result) => {
      if (!cancelled && result) setReport(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, paymentMode]);

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
            <option value="">{t("reports.allPaymentModes")}</option>
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
          label={t("reports.totalSales")}
          value={money(report.totalSales)}
          sublabel={t("reports.orderValueCreated")}
          icon={ShoppingBag}
        />
        <ReportStatCard
          label={t("reports.revenueCollected")}
          value={money(report.revenueCollected)}
          sublabel={t("reports.moneyActuallyReceived")}
          icon={IndianRupee}
        />
        <ReportStatCard
          label={t("reports.totalOrders")}
          value={String(report.totalOrders)}
          icon={Receipt}
        />
        <ReportStatCard
          label={t("reports.averageOrderValue")}
          value={money(Math.round(report.avgOrderValue))}
          icon={TrendingUp}
        />
      </div>

      {report.rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
          <p className="text-sm text-ink-muted">{t("reports.noSalesInRange")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <BreakdownTable
              title="Revenue by Month"
              columns={["Month", "Orders", "Sales", "Collected"]}
              rows={report.monthlyRows.map((row) => [
                row.month,
                row.orders,
                money(row.grossSales),
                money(row.amountCollected),
              ])}
            />
            <BreakdownTable
              title="Revenue by Garment Type"
              columns={["Garment", "Qty", "Sales"]}
              rows={report.garmentRows.map((row) => [
                row.garmentType,
                row.qty,
                money(row.grossSales),
              ])}
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
            <table className="w-full text-left">
              <thead className="text-[13px] font-semibold text-ink-muted">
                <tr className="border-b border-border-soft">
                  <th className="whitespace-nowrap px-5 py-3">{t("common.date")}</th>
                  <th className="whitespace-nowrap px-5 py-3 text-right">{t("reports.orders")}</th>
                  <th className="whitespace-nowrap px-5 py-3 text-right">{t("reports.grossSales")}</th>
                  <th className="whitespace-nowrap px-5 py-3 text-right">{t("reports.amountCollected")}</th>
                  <th className="whitespace-nowrap px-5 py-3 text-right">{t("reports.balancePending")}</th>
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
        </div>
      )}
    </div>
  );
}

function BreakdownTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <div className="border-b border-border-soft px-5 py-3 text-sm font-semibold text-ink">
        {title}
      </div>
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr>
            {columns.map((column, index) => (
              <th
                key={column}
                className={`whitespace-nowrap px-5 py-3 ${index > 0 ? "text-right" : ""}`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {rows.slice(0, 8).map((row) => (
            <tr key={String(row[0])} className="border-t border-border-soft">
              {row.map((cell, index) => (
                <td
                  key={`${row[0]}-${index}`}
                  className={`whitespace-nowrap px-5 py-3 ${index > 0 ? "text-right text-ink-muted" : "text-ink"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
