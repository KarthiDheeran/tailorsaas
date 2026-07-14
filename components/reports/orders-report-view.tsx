"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Ban, CalendarClock, Clock, Receipt, Wallet } from "lucide-react";
import { OrdersTable } from "@/components/orders/orders-table";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ReportActions } from "@/components/reports/report-actions";
import { ReportStatCard } from "@/components/reports/report-stat-card";
import { downloadCsv } from "@/lib/csv";
import {
  getOrdersReportAction,
  getReportGarmentTypesAction,
} from "@/app/(shell)/reports/actions";
import {
  getDateRangeForPreset,
  type DateRange,
  type DateRangePreset,
  type OrderBalanceFilter,
  type OrderDeliveryFilter,
  type OrdersReport,
} from "@/lib/reports";
import { useLanguage } from "@/components/i18n/language-provider";

const EMPTY_REPORT: OrdersReport = {
  summary: {
    totalOrders: 0,
    balanceDueOrders: 0,
    overdueOrders: 0,
    dueSoonDeliveries: 0,
    avgDeliveryDays: 0,
    cancelledOrders: 0,
    delayedOrders: 0,
  },
  orders: [],
};

export function OrdersReportView({ todayIso }: { todayIso: string }) {
  const { t } = useLanguage();
  const [preset, setPreset] = useState<DateRangePreset>("all");
  const [customRange, setCustomRange] = useState<DateRange>({
    from: todayIso,
    to: todayIso,
  });
  const [balanceStatus, setBalanceStatus] = useState<OrderBalanceFilter>("all");
  const [deliveryStatus, setDeliveryStatus] = useState<OrderDeliveryFilter>("all");
  const [garmentType, setGarmentType] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");

  // Phase 6E: both fetched via Server Actions now — see sales-report-view.tsx's
  // comment for why this is an effect + state instead of useMemo. Garment
  // types are independent of the report filters, so they only fetch once.
  const [garmentTypes, setGarmentTypes] = useState<string[]>([]);
  const [report, setReport] = useState<OrdersReport>(EMPTY_REPORT);

  useEffect(() => {
    let cancelled = false;
    getReportGarmentTypesAction().then((result) => {
      if (!cancelled) setGarmentTypes(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const range = getDateRangeForPreset(preset, todayIso, customRange);

  useEffect(() => {
    let cancelled = false;
    getOrdersReportAction(
      {
        range,
        balanceStatus,
        deliveryStatus,
        garmentType: garmentType || undefined,
        customerQuery,
      },
      todayIso
    ).then((result) => {
      if (!cancelled && result) setReport(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, balanceStatus, deliveryStatus, garmentType, customerQuery, todayIso]);

  function handleExport() {
    downloadCsv(
      `orders-report-${todayIso}.csv`,
      ["Order No", "Customer", "Order Date", "Delivery Date", "Items", "Total", "Balance"],
      report.orders.map((o) => [
        o.orderNumber,
        o.customerSnapshot?.name ?? "Unknown",
        o.orderDate,
        o.deliveryDate,
        o.items.map((i) => `${i.particular} x${i.qty}`).join("; "),
        o.totalAmount,
        o.balance,
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
            value={balanceStatus}
            onChange={(e) => setBalanceStatus(e.target.value as OrderBalanceFilter)}
            className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint print:hidden"
          >
            <option value="all">{t("reports.allBalanceStatus")}</option>
            <option value="paid">{t("common.paid")}</option>
            <option value="balanceDue">{t("reports.balanceDue")}</option>
            <option value="overdue">{t("reports.overdue")}</option>
          </select>
          <select
            value={deliveryStatus}
            onChange={(e) => setDeliveryStatus(e.target.value as OrderDeliveryFilter)}
            className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint print:hidden"
          >
            <option value="all">{t("reports.allDeliveries")}</option>
            <option value="overdue">{t("reports.deliveryOverdue")}</option>
            <option value="dueSoon">{t("reports.dueIn7Days")}</option>
          </select>
          <select
            value={garmentType}
            onChange={(e) => setGarmentType(e.target.value)}
            className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint print:hidden"
          >
            <option value="">{t("reports.allGarments")}</option>
            {garmentTypes.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <input
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            placeholder={t("reports.searchCustomer")}
            className="h-9 w-48 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint print:hidden"
          />
        </div>
        <ReportActions onExport={handleExport} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportStatCard
          label={t("reports.totalOrders")}
          value={String(report.summary.totalOrders)}
          icon={Receipt}
        />
        <ReportStatCard
          label={t("reports.balanceDue")}
          value={String(report.summary.balanceDueOrders)}
          icon={Wallet}
        />
        <ReportStatCard
          label={t("reports.overdue")}
          value={String(report.summary.overdueOrders)}
          icon={AlertTriangle}
          tone={report.summary.overdueOrders > 0 ? "warning" : "default"}
        />
        <ReportStatCard
          label={t("reports.dueIn7Days")}
          value={String(report.summary.dueSoonDeliveries)}
          icon={CalendarClock}
        />
        <ReportStatCard
          label="Avg Delivery Time"
          value={`${Math.round(report.summary.avgDeliveryDays)} days`}
          icon={Clock}
        />
        <ReportStatCard
          label="Delayed Orders"
          value={String(report.summary.delayedOrders)}
          icon={AlertTriangle}
          tone={report.summary.delayedOrders > 0 ? "warning" : "default"}
        />
        <ReportStatCard
          label="Cancelled Orders"
          value={String(report.summary.cancelledOrders)}
          icon={Ban}
          tone={report.summary.cancelledOrders > 0 ? "warning" : "default"}
        />
      </div>

      <OrdersTable orders={report.orders} />
    </div>
  );
}
