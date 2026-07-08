"use client";

import { useMemo, useState } from "react";
import { IndianRupee, Repeat, UserPlus, Wallet } from "lucide-react";
import { CustomerStatusBadge } from "@/components/customers/status-badge";
import { formatDate } from "@/components/orders/orders-table";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ReportActions } from "@/components/reports/report-actions";
import { ReportStatCard } from "@/components/reports/report-stat-card";
import { downloadCsv } from "@/lib/csv";
import { getCustomerAreas } from "@/lib/customers";
import {
  getCustomersReport,
  getDateRangeForPreset,
  type DateRange,
  type DateRangePreset,
} from "@/lib/reports";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";

function money(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function CustomersReportView({ todayIso }: { todayIso: string }) {
  const { hasPermission } = useCurrentUser();
  const canViewPayments = hasPermission("orders.viewPayments");
  const { t } = useLanguage();
  const [preset, setPreset] = useState<DateRangePreset>("all");
  const [customRange, setCustomRange] = useState<DateRange>({
    from: todayIso,
    to: todayIso,
  });
  const [area, setArea] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [hasBalanceOnly, setHasBalanceOnly] = useState(false);
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [inactiveOnly, setInactiveOnly] = useState(false);

  const areas = useMemo(() => getCustomerAreas(), []);
  const range = getDateRangeForPreset(preset, todayIso, customRange);
  const report = useMemo(
    () =>
      getCustomersReport(
        {
          range,
          area: area || undefined,
          customerQuery,
          hasBalanceOnly,
          repeatOnly,
          inactiveOnly,
        },
        todayIso
      ),
    [range.from, range.to, area, customerQuery, hasBalanceOnly, repeatOnly, inactiveOnly, todayIso]
  );

  function handleExport() {
    downloadCsv(
      `customers-report-${todayIso}.csv`,
      ["Customer", "Phone", "Area", "Total Orders", "Total Spent", "Outstanding Balance", "Last Order Date", "Status"],
      report.rows.map((r) => [
        r.customer.name,
        r.customer.phone,
        r.customer.area,
        r.totalOrders,
        r.totalSpent,
        r.outstandingBalance,
        r.lastOrderDate ?? "",
        r.status,
      ])
    );
  }

  const toggles: { key: string; label: string; value: boolean; set: (v: boolean) => void }[] = [
    { key: "hasBalance", label: t("customers.hasBalance"), value: hasBalanceOnly, set: setHasBalanceOnly },
    { key: "repeat", label: t("reports.repeatCustomers"), value: repeatOnly, set: setRepeatOnly },
    { key: "inactive", label: t("reports.inactive"), value: inactiveOnly, set: setInactiveOnly },
  ];

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
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint print:hidden"
          >
            <option value="">{t("reports.allAreas")}</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            placeholder={t("reports.searchNameOrPhone")}
            className="h-9 w-48 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint print:hidden"
          />
          {toggles.map((toggle) => (
            <button
              key={toggle.key}
              type="button"
              onClick={() => toggle.set(!toggle.value)}
              className={cn(
                "h-9 rounded-lg border px-3 text-sm font-medium transition-colors print:hidden",
                toggle.value
                  ? "border-primary bg-primary-tint text-primary"
                  : "border-border bg-white text-ink-muted hover:bg-surface"
              )}
            >
              {toggle.label}
            </button>
          ))}
        </div>
        <ReportActions onExport={handleExport} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportStatCard
          label={t("reports.newCustomers")}
          value={String(report.summary.newCustomers)}
          sublabel={t("reports.firstOrderInRange")}
          icon={UserPlus}
        />
        <ReportStatCard
          label={t("reports.repeatCustomers")}
          value={String(report.summary.repeatCustomers)}
          icon={Repeat}
        />
        {canViewPayments && (
          <ReportStatCard
            label={t("reports.customersWithBalance")}
            value={String(report.summary.customersWithBalance)}
            icon={Wallet}
          />
        )}
        {canViewPayments && (
          <ReportStatCard
            label={t("reports.avgLifetimeValue")}
            value={money(Math.round(report.summary.avgLifetimeValue))}
            icon={IndianRupee}
          />
        )}
      </div>

      {report.rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
          <p className="text-sm text-ink-muted">{t("reports.noCustomersMatch")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
          <table className="w-full text-left">
            <thead className="text-[13px] font-semibold text-ink-muted">
              <tr className="border-b border-border-soft">
                <th className="whitespace-nowrap px-5 py-3">{t("orders.customer")}</th>
                <th className="whitespace-nowrap px-5 py-3">{t("common.phone")}</th>
                <th className="whitespace-nowrap px-5 py-3">{t("common.area")}</th>
                <th className="whitespace-nowrap px-5 py-3 text-right">{t("customers.totalOrders")}</th>
                {canViewPayments && (
                  <>
                    <th className="whitespace-nowrap px-5 py-3 text-right">{t("reports.totalSpent")}</th>
                    <th className="whitespace-nowrap px-5 py-3 text-right">{t("customers.outstandingBalance")}</th>
                  </>
                )}
                <th className="whitespace-nowrap px-5 py-3">{t("reports.lastOrderDate")}</th>
                <th className="whitespace-nowrap px-5 py-3">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {report.rows.map((row) => (
                <tr key={row.customer.id} className="border-t border-border-soft">
                  <td className="whitespace-nowrap px-5 py-3">
                    <div className="text-ink">{row.customer.name}</div>
                    <div className="text-xs text-ink-muted">{row.customer.customerNumber}</div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                    {row.customer.phone}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                    {row.customer.area}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                    {row.totalOrders}
                  </td>
                  {canViewPayments && (
                    <>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-ink">
                        {money(row.totalSpent)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                        {money(row.outstandingBalance)}
                      </td>
                    </>
                  )}
                  <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                    {row.lastOrderDate ? formatDate(row.lastOrderDate) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <CustomerStatusBadge status={row.status} />
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
