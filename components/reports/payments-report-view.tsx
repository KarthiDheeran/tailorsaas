"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, IndianRupee, TrendingUp, Wallet } from "lucide-react";
import { PaymentLedgerTable } from "@/components/payments/payment-ledger-table";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ReportActions } from "@/components/reports/report-actions";
import { ReportSelectShell, reportSelectClassName } from "@/components/reports/report-select";
import { ReportStatCard } from "@/components/reports/report-stat-card";
import { useDebouncedValue } from "@/components/ui/use-debounced-value";
import { downloadCsv } from "@/lib/csv";
import {
  getPaymentsReportAction,
  getReportExpensesTotalAction,
} from "@/app/(shell)/reports/actions";
import {
  getDateRangeForPreset,
  type DateRange,
  type DateRangePreset,
  type PaymentsReport,
} from "@/lib/reports";
import { paymentModes } from "@/lib/constants";
import type { PaymentMode, PaymentType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/i18n/language-provider";
import { formatCurrency } from "@/lib/currency";

const PAYMENT_TYPES: PaymentType[] = ["Advance", "Partial", "Final"];

function money(n: number) {
  return formatCurrency(n);
}

const EMPTY_REPORT: PaymentsReport = {
  totalCollected: 0,
  byMode: [],
  outstandingBalance: 0,
  overdueBalance: 0,
  rows: [],
};

// Phase 7D: this tab is now a real per-payment-transaction ledger over the
// payments table (each row is one payment, not one order — see lib/
// reports.ts's getPaymentsReport) rather than the old order-level
// approximation. Voided payments stay in the table (marked, with their void
// reason) rather than being hidden — the more transparent, audit-consistent
// choice, matching how components/orders/payment-history-list.tsx already
// shows voided rows in the Order Details drawer — but they're excluded from
// every summary card and the by-mode breakdown, computed server-side in
// getPaymentsReport.
export function PaymentsReportView({ todayIso }: { todayIso: string }) {
  const { t } = useLanguage();
  const [preset, setPreset] = useState<DateRangePreset>("thisMonth");
  const [customRange, setCustomRange] = useState<DateRange>({
    from: todayIso,
    to: todayIso,
  });
  const [paymentMode, setPaymentMode] = useState<PaymentMode | "">("");
  const [paymentType, setPaymentType] = useState<PaymentType | "">("");
  const [customerQuery, setCustomerQuery] = useState("");
  const debouncedCustomerQuery = useDebouncedValue(customerQuery);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);

  const range = getDateRangeForPreset(preset, todayIso, customRange);
  // Phase 6E: fetched via a Server Action now — see sales-report-view.tsx's
  // comment for why this is an effect + state instead of useMemo.
  const [report, setReport] = useState<PaymentsReport>(EMPTY_REPORT);
  // Profit stat: Collections (report.totalCollected) minus Expenses in the
  // same date range. null (not 0) means the expenses migration isn't
  // applied yet — the Profit card just doesn't render in that case, same
  // convention as lib/dashboard.ts's optional stat cards.
  const [expensesTotal, setExpensesTotal] = useState<number | null>(0);

  useEffect(() => {
    let cancelled = false;
    getPaymentsReportAction(
      {
        range,
        paymentMode: paymentMode || undefined,
        paymentType: paymentType || undefined,
        customerQuery: debouncedCustomerQuery,
        pendingOnly,
        overdueOnly,
      },
      todayIso
    ).then((result) => {
      if (!cancelled && result) setReport(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    range.from,
    range.to,
    paymentMode,
    paymentType,
    debouncedCustomerQuery,
    pendingOnly,
    overdueOnly,
    todayIso,
  ]);

  useEffect(() => {
    let cancelled = false;
    getReportExpensesTotalAction(range).then((result) => {
      if (!cancelled) setExpensesTotal(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  function handleExport() {
    downloadCsv(
      `payments-report-${todayIso}.csv`,
      [
        "Payment Date",
        "Customer",
        "Order No",
        "Amount",
        "Payment Mode",
        "Payment Type",
        "Notes",
        "Voided",
        "Void Reason",
        "Recorded By",
      ],
      report.rows.map((r) => [
        r.payment.paymentDate,
        r.customer?.name ?? "Unknown",
        r.orderNumber,
        r.payment.amount,
        r.payment.paymentMode,
        r.payment.paymentType,
        r.payment.notes ?? "",
        r.payment.voided ? "Yes" : "No",
        r.payment.voidReason ?? "",
        r.recordedByName ?? "",
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
          <ReportSelectShell className="w-56">
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as PaymentMode | "")}
              className={reportSelectClassName()}
            >
              <option value="">{t("reports.allPaymentModes")}</option>
              {paymentModes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </ReportSelectShell>
          <ReportSelectShell className="w-56">
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value as PaymentType | "")}
              className={reportSelectClassName()}
            >
              <option value="">{t("reports.allPaymentTypes")}</option>
              {PAYMENT_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {pt}
                </option>
              ))}
            </select>
          </ReportSelectShell>
          <input
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            placeholder={t("reports.searchCustomer")}
            className="h-9 w-48 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint print:hidden"
          />
          <button
            type="button"
            onClick={() => setPendingOnly((v) => !v)}
            className={cn(
              "h-9 rounded-lg border px-3 text-sm font-medium transition-colors print:hidden",
              pendingOnly
                ? "border-primary bg-primary-tint text-primary"
                : "border-border bg-white text-ink-muted hover:bg-surface-muted"
            )}
          >
            {t("reports.pendingOnly")}
          </button>
          <button
            type="button"
            onClick={() => setOverdueOnly((v) => !v)}
            className={cn(
              "h-9 rounded-lg border px-3 text-sm font-medium transition-colors print:hidden",
              overdueOnly
                ? "border-primary bg-primary-tint text-primary"
                : "border-border bg-white text-ink-muted hover:bg-surface-muted"
            )}
          >
            {t("reports.overdueOnly")}
          </button>
        </div>
        <ReportActions onExport={handleExport} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportStatCard
          label={t("reports.totalCollected")}
          value={money(report.totalCollected)}
          icon={IndianRupee}
        />
        <ReportStatCard
          label={t("reports.outstandingBalance")}
          value={money(report.outstandingBalance)}
          icon={Wallet}
        />
        <ReportStatCard
          label={t("reports.overdueBalance")}
          value={money(report.overdueBalance)}
          icon={AlertTriangle}
          tone={report.overdueBalance > 0 ? "warning" : "default"}
        />
        {expensesTotal !== null && (
          <ReportStatCard
            label={t("reports.profit")}
            value={money(report.totalCollected - expensesTotal)}
            sublabel={t("reports.collectionsMinusExpenses")}
            icon={TrendingUp}
            tone={report.totalCollected - expensesTotal < 0 ? "warning" : "default"}
          />
        )}
      </div>

      {report.byMode.length > 0 && (
        <div className="mb-6 rounded-xl border border-border-soft bg-white p-5 shadow-soft">
          <p className="mb-3 text-[13px] font-medium text-ink-muted">
            {t("reports.collectedByPaymentMode")}
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

      <PaymentLedgerTable rows={report.rows} emptyMessage={t("reports.noPaymentsMatch")} />
    </div>
  );
}
