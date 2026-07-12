"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Banknote,
  Calculator,
  CreditCard,
  IndianRupee,
  Plus,
  Printer,
  Smartphone,
  X,
} from "lucide-react";
import {
  createExpenseAction,
  getDailyClosingAction,
  getFinancialAdjustmentsAction,
  getExpensesAction,
  getExpenseTotalAction,
  getPaymentsLedgerAction,
  getPendingDuesOrdersAction,
  voidExpenseAction,
  type DailyClosingSummary,
  type FinancialAdjustmentLedgerRow,
} from "@/app/(shell)/payments/actions";
import { PaymentLedgerTable } from "@/components/payments/payment-ledger-table";
import { PendingDuesTable } from "@/components/payments/pending-dues-table";
import { FinancialAdjustmentsTable } from "@/components/payments/financial-adjustments-table";
import { PaymentsTabs, type PaymentsTab } from "@/components/payments/payments-tabs";
import { formatDate } from "@/components/orders/orders-table";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { ReportStatCard } from "@/components/reports/report-stat-card";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import {
  getDateRangeForPreset,
  type DateRange,
  type DateRangePreset,
  type PaymentsReport,
} from "@/lib/reports";
import { expenseCategories, paymentModes } from "@/lib/constants";
import type {
  Expense,
  ExpenseCategory,
  Order,
  OrderFinancialAdjustmentType,
  PaymentMode,
  PaymentType,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";

const PAYMENT_TYPES: PaymentType[] = ["Advance", "Partial", "Final"];
const ADJUSTMENT_TYPES: OrderFinancialAdjustmentType[] = [
  "Discount",
  "Extra Charge",
  "Refund",
];
// Phase 7G: a deliberately simpler date-filter set than Reports' full
// six-preset range — this page is a daily operational ledger, not an
// analysis tool, so "All Time" and a custom range don't belong here.
const PAYMENT_PAGE_PRESETS: DateRangePreset[] = ["today", "yesterday", "thisWeek", "thisMonth"];

const EMPTY_REPORT: PaymentsReport = {
  totalCollected: 0,
  byMode: [],
  outstandingBalance: 0,
  overdueBalance: 0,
  rows: [],
};

function money(n: number) {
  return `₹${Math.round(Number(n)).toLocaleString("en-IN")}`;
}

// Phase 7F/7G: a dedicated, day-to-day operational screen — separate from
// Reports' Payments tab (analysis: Total Collected/Outstanding/Overdue
// cards, Export CSV/Print, the full 6-preset date range, read-only). This
// page defaults to "Today", offers only Today/Yesterday/This Week/This
// Month, has no Outstanding/Overdue-style analytical cards and no
// Export/Print. Row actions are read-only (View Order only) — payment
// recording/correction happens from the Order Detail screen. It reuses the exact same
// lib/reports.ts#getPaymentsReport selector and the same
// PaymentLedgerTable — see app/(shell)/payments/actions.ts and
// components/payments/payment-ledger-table.tsx.
function PaymentsPageContent() {
  const { t } = useLanguage();
  const { hasPermission } = useCurrentUser();
  const canViewPayments = hasPermission("orders.viewPayments");
  const canViewExpenses = hasPermission("expenses.view");
  const canManageExpenses = hasPermission("expenses.manage");
  const canPrintPaymentReceipts = hasPermission("orders.printCustomerReceipt");
  const todayIso = new Date().toISOString().slice(0, 10);

  const [preset, setPreset] = useState<DateRangePreset>("today");
  const [customRange, setCustomRange] = useState<DateRange>({
    from: todayIso,
    to: todayIso,
  });
  const [paymentMode, setPaymentMode] = useState<PaymentMode | "">("");
  const [paymentType, setPaymentType] = useState<PaymentType | "">("");
  const [query, setQuery] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [report, setReport] = useState<PaymentsReport>(EMPTY_REPORT);
  // Phase 7G: the 4 operational summary cards are a fixed "how's today
  // going" pulse — always scoped to today's date, independent of whatever
  // date range/mode/type/search the table below is currently filtered to,
  // so switching the table to "Yesterday" doesn't make "Today Collected"
  // lie. Fetched via the same getPaymentsLedgerAction, just with its own
  // always-today range and no other filters.
  const [todayReport, setTodayReport] = useState<PaymentsReport>(EMPTY_REPORT);
  const [dailyClosing, setDailyClosing] = useState<DailyClosingSummary | null>(null);
  // Pending Dues tab rows. The summary card total is derived from these rows
  // too, so receivables are not fetched twice.
  const [pendingDuesOrders, setPendingDuesOrders] = useState<Order[]>([]);
  const [adjustments, setAdjustments] = useState<FinancialAdjustmentLedgerRow[]>([]);
  const [adjustmentType, setAdjustmentType] = useState<OrderFinancialAdjustmentType | "">("");
  const [adjustmentMode, setAdjustmentMode] = useState<PaymentMode | "">("");
  const [adjustmentQuery, setAdjustmentQuery] = useState("");
  const [adjustmentsMigrationMissing, setAdjustmentsMigrationMissing] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [todayExpenses, setTodayExpenses] = useState(0);
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory | "">("");
  const [expenseMode, setExpenseMode] = useState<PaymentMode | "">("");
  const [expenseQuery, setExpenseQuery] = useState("");
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseRefreshKey, setExpenseRefreshKey] = useState(0);
  const [expensesMigrationMissing, setExpensesMigrationMissing] = useState(false);
  const [tab, setTab] = useState<PaymentsTab>(canViewPayments ? "collections" : "expenses");
  const [loadError, setLoadError] = useState<string | null>(null);
  // Each flips true once (never back) after its own fetch's first
  // resolution — combined below into isLoading gates so the page doesn't
  // paint empty tables/zeroed stat cards before the first real fetch lands.
  const [reportLoaded, setReportLoaded] = useState(false);
  const [todayReportLoaded, setTodayReportLoaded] = useState(false);
  const [dailyClosingLoaded, setDailyClosingLoaded] = useState(false);
  const [pendingDuesOrdersLoaded, setPendingDuesOrdersLoaded] = useState(false);
  const [adjustmentsLoaded, setAdjustmentsLoaded] = useState(false);
  const [expensesLoaded, setExpensesLoaded] = useState(false);
  const [todayExpensesLoaded, setTodayExpensesLoaded] = useState(false);

  const range = getDateRangeForPreset(preset, todayIso, customRange);

  useEffect(() => {
    if (!canViewPayments && canViewExpenses && tab !== "expenses") {
      setTab("expenses");
    }
    if (!canViewExpenses && tab === "expenses") {
      setTab("collections");
    }
  }, [canViewPayments, canViewExpenses, tab]);

  useEffect(() => {
    if (!canViewPayments) return;
    let cancelled = false;
    getPaymentsLedgerAction(
      {
        range,
        paymentMode: paymentMode || undefined,
        paymentType: paymentType || undefined,
        customerQuery: query,
      },
      todayIso
    ).then((result) => {
      if (!cancelled && result) setReport(result);
      if (!cancelled) setLoadError(null);
    }).catch((error) => {
      if (!cancelled) {
        setLoadError(getErrorMessage(error, "Failed to load payment collections."));
      }
    }).finally(() => {
      if (!cancelled) setReportLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewPayments, range.from, range.to, paymentMode, paymentType, query, todayIso, refreshTick]);

  useEffect(() => {
    if (!canViewPayments) return;
    let cancelled = false;
    getPaymentsLedgerAction({ range: { from: todayIso, to: todayIso } }, todayIso).then(
      (result) => {
        if (!cancelled && result) setTodayReport(result);
        if (!cancelled) setLoadError(null);
      }
    ).catch((error) => {
      if (!cancelled) {
        setLoadError(getErrorMessage(error, "Failed to load today's collections."));
      }
    }).finally(() => {
      if (!cancelled) setTodayReportLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewPayments, todayIso, refreshTick]);

  useEffect(() => {
    if (!canViewPayments) return;
    let cancelled = false;
    getDailyClosingAction(todayIso).then((result) => {
      if (!cancelled) setDailyClosing(result);
      if (!cancelled) setLoadError(null);
    }).catch((error) => {
      if (!cancelled) {
        setLoadError(getErrorMessage(error, "Failed to load daily closing."));
      }
    }).finally(() => {
      if (!cancelled) setDailyClosingLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [canViewPayments, todayIso, refreshTick, expenseRefreshKey]);

  useEffect(() => {
    if (!canViewPayments) return;
    let cancelled = false;
    getPendingDuesOrdersAction().then((result) => {
      if (!cancelled && result !== null) setPendingDuesOrders(result);
      if (!cancelled) setLoadError(null);
    }).catch((error) => {
      if (!cancelled) {
        setLoadError(getErrorMessage(error, "Failed to load pending due orders."));
      }
    }).finally(() => {
      if (!cancelled) setPendingDuesOrdersLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [canViewPayments, refreshTick]);

  useEffect(() => {
    if (!canViewPayments) return;
    let cancelled = false;
    getFinancialAdjustmentsAction({
      from: range.from,
      to: range.to,
      adjustmentType: adjustmentType || undefined,
      paymentMode: adjustmentMode || undefined,
      query: adjustmentQuery,
      includeVoided: true,
    }).then((result) => {
      if (cancelled) return;
      setAdjustmentsMigrationMissing(result === null);
      setAdjustments(result ?? []);
      setLoadError(null);
    }).catch((error) => {
      if (!cancelled) {
        setLoadError(getErrorMessage(error, "Failed to load financial adjustments."));
      }
    }).finally(() => {
      if (!cancelled) setAdjustmentsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    canViewPayments,
    range.from,
    range.to,
    adjustmentType,
    adjustmentMode,
    adjustmentQuery,
    refreshTick,
  ]);

  useEffect(() => {
    if (!canViewExpenses) return;
    let cancelled = false;
    getExpensesAction({
      from: range.from,
      to: range.to,
      category: expenseCategory || undefined,
      paymentMode: expenseMode || undefined,
      query: expenseQuery,
      includeVoided: true,
    }).then((result) => {
      if (cancelled) return;
      setExpensesMigrationMissing(result === null);
      setExpenses(result ?? []);
      setLoadError(null);
    }).catch((error) => {
      if (!cancelled) {
        setLoadError(getErrorMessage(error, "Failed to load expenses."));
      }
    }).finally(() => {
      if (!cancelled) setExpensesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    canViewExpenses,
    range.from,
    range.to,
    expenseCategory,
    expenseMode,
    expenseQuery,
    expenseRefreshKey,
  ]);

  useEffect(() => {
    if (!canViewExpenses) return;
    let cancelled = false;
    getExpenseTotalAction({
      from: todayIso,
      to: todayIso,
    }).then((result) => {
      if (cancelled) return;
      setExpensesMigrationMissing(result === null);
      setTodayExpenses(result ?? 0);
      setLoadError(null);
    }).catch((error) => {
      if (!cancelled) {
        setLoadError(getErrorMessage(error, "Failed to load today's expenses."));
      }
    }).finally(() => {
      if (!cancelled) setTodayExpensesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [canViewExpenses, todayIso, expenseRefreshKey]);

  const todayCollected = todayReport.totalCollected;
  const cashToday = todayReport.byMode.find((b) => b.mode === "Cash")?.amount ?? 0;
  const upiToday = todayReport.byMode.find((b) => b.mode === "UPI")?.amount ?? 0;
  const pendingDues = pendingDuesOrders.reduce(
    (sum, order) => sum + Number(order.balance),
    0
  );

  const isLoading =
    (canViewPayments &&
      !(
        reportLoaded &&
        todayReportLoaded &&
        dailyClosingLoaded &&
        pendingDuesOrdersLoaded &&
        adjustmentsLoaded
      )) ||
    (canViewExpenses && !(expensesLoaded && todayExpensesLoaded));

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-ink">{t("payments.title")}</h1>
        <p className="text-sm text-ink-muted">{t("payments.subtitle")}</p>
      </div>

      {loadError && (
        <div className="mb-5">
          <LoadError
            message={loadError}
            onRetry={() => {
              setRefreshTick((key) => key + 1);
              setExpenseRefreshKey((key) => key + 1);
            }}
          />
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading payments..." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {canViewPayments && (
              <>
                <ReportStatCard
                  label={t("payments.todayCollected")}
                  value={money(todayCollected)}
                  icon={IndianRupee}
                />
                <ReportStatCard
                  label={t("payments.cashToday")}
                  value={money(cashToday)}
                  icon={Banknote}
                />
                <ReportStatCard
                  label={t("payments.upiToday")}
                  value={money(upiToday)}
                  icon={Smartphone}
                />
                <ReportStatCard
                  label={t("payments.pendingDues")}
                  value={money(pendingDues)}
                  icon={AlertCircle}
                />
              </>
            )}
            {canViewExpenses && (
              <ReportStatCard
                label={t("payments.expensesToday")}
                value={money(todayExpenses)}
                icon={Banknote}
              />
            )}
          </div>

          {canViewPayments && dailyClosing && (
            <DailyClosingPanel summary={dailyClosing} />
          )}

          <PaymentsTabs
            active={tab}
            onChange={setTab}
            canViewPayments={canViewPayments}
            canViewExpenses={canViewExpenses}
          />

          {tab === "pending-dues" && <PendingDuesTable orders={pendingDuesOrders} />}

          {tab === "adjustments" && (
            <>
              {adjustmentsMigrationMissing && (
                <div className="mb-5 rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
                  Financial adjustments are ready in the app, but the database migration has not been applied yet.
                  Apply <span className="font-semibold text-ink">supabase/migrations/0018_order_financial_adjustments.sql</span> to start seeing discounts, refunds, and extra charges here.
                </div>
              )}

              <div className="mb-5 flex flex-wrap items-center gap-2">
                <DateRangeFilter
                  preset={preset}
                  custom={customRange}
                  onPresetChange={setPreset}
                  onCustomChange={setCustomRange}
                  presets={PAYMENT_PAGE_PRESETS}
                />
                <select
                  value={adjustmentType}
                  onChange={(e) =>
                    setAdjustmentType(e.target.value as OrderFinancialAdjustmentType | "")
                  }
                  className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                >
                  <option value="">All Adjustment Types</option>
                  {ADJUSTMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <select
                  value={adjustmentMode}
                  onChange={(e) => setAdjustmentMode(e.target.value as PaymentMode | "")}
                  className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                >
                  <option value="">All Refund Modes</option>
                  {paymentModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
                <input
                  value={adjustmentQuery}
                  onChange={(e) => setAdjustmentQuery(e.target.value)}
                  placeholder="Search order, customer, reason, or notes"
                  className="h-9 w-72 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
                />
              </div>

              <FinancialAdjustmentsTable rows={adjustments} />
            </>
          )}

          {tab === "collections" && (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <DateRangeFilter
                  preset={preset}
                  custom={customRange}
                  onPresetChange={setPreset}
                  onCustomChange={setCustomRange}
                  presets={PAYMENT_PAGE_PRESETS}
                />
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode | "")}
                  className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                >
                  <option value="">{t("payments.allCollectionModes")}</option>
                  {paymentModes.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as PaymentType | "")}
                  className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                >
                  <option value="">{t("payments.allCollectionTypes")}</option>
                  {PAYMENT_TYPES.map((pt) => (
                    <option key={pt} value={pt}>
                      {pt}
                    </option>
                  ))}
                </select>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("payments.searchPlaceholder")}
                  className="h-9 w-56 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
                />
              </div>

              <PaymentLedgerTable
                rows={report.rows}
                emptyMessage={t("payments.noEntriesMatch")}
                showNotes={false}
                showRecordedBy={false}
                renderActions={(row) => (
                  <div className="flex items-center justify-end gap-3">
                    {canPrintPaymentReceipts && !row.payment.voided && (
                      <Link
                        href={`/orders/${row.payment.orderId}/print/payment/${row.payment.id}`}
                        title="Print payment receipt"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    <Link
                      href={`/orders?view=${row.payment.orderId}`}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {t("payments.viewOrder")}
                    </Link>
                  </div>
                )}
              />
            </>
          )}

          {tab === "expenses" && canViewExpenses && (
            <>
              {expensesMigrationMissing && (
                <div className="mb-5 rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
                  Expenses are ready in the app, but the database migration has not been applied yet.
                  Apply <span className="font-semibold text-ink">supabase/migrations/0010_expenses.sql</span> to start saving expense records.
                </div>
              )}

              <div className="mb-5 flex flex-wrap items-center gap-2">
                <DateRangeFilter
                  preset={preset}
                  custom={customRange}
                  onPresetChange={setPreset}
                  onCustomChange={setCustomRange}
                  presets={PAYMENT_PAGE_PRESETS}
                />
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory | "")}
                  className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                >
                  <option value="">{t("payments.allExpenseCategories")}</option>
                  {expenseCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <select
                  value={expenseMode}
                  onChange={(e) => setExpenseMode(e.target.value as PaymentMode | "")}
                  className="h-9 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
                >
                  <option value="">{t("payments.allExpenseModes")}</option>
                  {paymentModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
                <input
                  value={expenseQuery}
                  onChange={(e) => setExpenseQuery(e.target.value)}
                  placeholder={t("payments.expenseSearchPlaceholder")}
                  className="h-9 w-56 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
                />
                {canManageExpenses && !expensesMigrationMissing && (
                  <button
                    type="button"
                    onClick={() => setShowExpenseForm(true)}
                    className="ml-auto flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-primary-dark"
                  >
                    <Plus className="h-4 w-4" />
                    {t("payments.addExpense")}
                  </button>
                )}
              </div>

              <ExpenseLedgerTable
                rows={expenses}
                canManage={canManageExpenses && !expensesMigrationMissing}
                onVoided={() => setExpenseRefreshKey((key) => key + 1)}
              />
            </>
          )}
        </>
      )}

      {showExpenseForm && (
        <ExpenseDrawer
          todayIso={todayIso}
          onClose={() => setShowExpenseForm(false)}
          onSaved={() => {
            setShowExpenseForm(false);
            setExpenseRefreshKey((key) => key + 1);
          }}
        />
      )}
    </div>
  );
}

function DailyClosingPanel({ summary }: { summary: DailyClosingSummary }) {
  const cashCollected = summary.byMode.find((row) => row.mode === "Cash")?.collected ?? 0;
  const digitalCollected = summary.totalCollected - cashCollected;
  const visibleRows = summary.byMode.filter(
    (row) => row.collected > 0 || (row.expenses ?? 0) > 0
  );

  return (
    <section className="mb-6 border border-border-soft bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft px-5 py-4">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">Daily Closing</h2>
          <p className="text-sm text-ink-muted">
            Cash, digital collections, expenses, and net position for today.
          </p>
        </div>
        <div className="rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-ink-muted">
          {formatDate(summary.date)}
        </div>
      </div>

      <div className="grid grid-cols-1 border-b border-border-soft md:grid-cols-4">
        <ClosingMetric
          icon={IndianRupee}
          label="Total Received"
          value={money(summary.totalCollected)}
        />
        <ClosingMetric
          icon={Banknote}
          label="Cash in Hand"
          value={summary.cashInHand === null ? money(cashCollected) : money(summary.cashInHand)}
          sublabel={summary.expensesAvailable ? "Cash received minus cash expenses" : "Cash received today"}
        />
        <ClosingMetric
          icon={CreditCard}
          label="Digital Net"
          value={summary.digitalNet === null ? money(digitalCollected) : money(summary.digitalNet)}
          sublabel="UPI, card, bank, cheque, GPay"
        />
        <ClosingMetric
          icon={Calculator}
          label="Net After Expenses"
          value={summary.netTotal === null ? "Pending" : money(summary.netTotal)}
          warning={summary.netTotal !== null && summary.netTotal < 0}
          sublabel={
            summary.expensesAvailable
              ? `${money(summary.totalExpenses ?? 0)} expenses today`
              : "Expenses unavailable"
          }
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-[13px] font-semibold text-ink-muted">
            <tr className="border-b border-border-soft">
              <th className="whitespace-nowrap px-5 py-3">Mode</th>
              <th className="whitespace-nowrap px-5 py-3 text-right">Received</th>
              <th className="whitespace-nowrap px-5 py-3 text-right">Expenses</th>
              <th className="whitespace-nowrap px-5 py-3 text-right">Net</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-ink-muted">
                  No collections or expenses recorded today.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.mode} className="border-t border-border-soft">
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-ink">
                    {row.mode}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                    {money(row.collected)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-ink-muted">
                    {row.expenses === null ? "-" : money(row.expenses)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-5 py-3 text-right font-semibold",
                      row.net !== null && row.net < 0 ? "text-chip-red-fg" : "text-ink"
                    )}
                  >
                    {row.net === null ? "-" : money(row.net)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClosingMetric({
  icon: Icon,
  label,
  value,
  sublabel,
  warning,
}: {
  icon: typeof IndianRupee;
  label: string;
  value: string;
  sublabel?: string;
  warning?: boolean;
}) {
  return (
    <div className="flex gap-3 border-b border-border-soft px-5 py-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          warning ? "bg-chip-red text-chip-red-fg" : "bg-primary-tint text-primary"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-muted">{label}</div>
        <div
          className={cn(
            "text-[22px] font-semibold",
            warning ? "text-chip-red-fg" : "text-ink"
          )}
        >
          {value}
        </div>
        {sublabel && <div className="mt-0.5 text-xs text-ink-faint">{sublabel}</div>}
      </div>
    </div>
  );
}

function ExpenseLedgerTable({
  rows,
  canManage,
  onVoided,
}: {
  rows: Expense[];
  canManage: boolean;
  onVoided: () => void;
}) {
  const { t } = useLanguage();

  async function handleVoid(expense: Expense) {
    const reason = window.prompt(t("payments.voidExpenseReason"));
    if (!reason) return;
    const result = await voidExpenseAction(expense.id, reason);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    onVoided();
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-soft py-16 text-center">
        <p className="text-sm text-ink-muted">{t("payments.noExpensesMatch")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-white shadow-soft">
      <table className="w-full text-left">
        <thead className="text-[13px] font-semibold text-ink-muted">
          <tr className="border-b border-border-soft">
            <th className="whitespace-nowrap px-5 py-3">{t("common.date")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("payments.expenseCategory")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("payments.vendor")}</th>
            <th className="px-5 py-3">{t("payments.description")}</th>
            <th className="whitespace-nowrap px-5 py-3 text-right">{t("common.amount")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("orders.paymentMode")}</th>
            <th className="whitespace-nowrap px-5 py-3">{t("common.status")}</th>
            {canManage && (
              <th className="whitespace-nowrap px-5 py-3 text-right">{t("common.actions")}</th>
            )}
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {rows.map((expense) => (
            <tr
              key={expense.id}
              className={cn("border-t border-border-soft", expense.voided && "opacity-60")}
            >
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {formatDate(expense.expenseDate)}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink">{expense.category}</td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {expense.vendor || "-"}
              </td>
              <td className="px-5 py-3 text-ink">
                <div className="font-medium">{expense.description}</div>
                {expense.notes && <div className="text-xs text-ink-muted">{expense.notes}</div>}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-right text-ink">
                {money(expense.amount)}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-ink-muted">
                {expense.paymentMode}
              </td>
              <td className="whitespace-nowrap px-5 py-3">
                {expense.voided ? (
                  <span className="inline-block rounded-full bg-chip-info px-2.5 py-0.5 text-xs font-semibold text-chip-info-fg">
                    {t("orders.voided")}
                    {expense.voidReason ? ` - ${expense.voidReason}` : ""}
                  </span>
                ) : (
                  <span className="inline-block rounded-full bg-chip-mint px-2.5 py-0.5 text-xs font-semibold text-chip-mint-fg">
                    {t("common.active")}
                  </span>
                )}
              </td>
              {canManage && (
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  {!expense.voided && (
                    <button
                      type="button"
                      onClick={() => handleVoid(expense)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface"
                    >
                      {t("payments.voidExpense")}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseDrawer({
  todayIso,
  onClose,
  onSaved,
}: {
  todayIso: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [expenseDate, setExpenseDate] = useState(todayIso);
  const [category, setCategory] = useState<ExpenseCategory>("Fabric");
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Cash");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsedAmount = Number(amount);
    if (!description.trim()) {
      setError(t("payments.expenseDescriptionRequired"));
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError(t("orders.amountRequired"));
      return;
    }

    setSaving(true);
    const result = await createExpenseAction({
      expenseDate,
      category,
      vendor,
      description,
      amount: parsedAmount,
      paymentMode,
      notes,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-soft px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">{t("payments.addExpense")}</h2>
            <p className="text-sm text-ink-muted">{t("payments.expenseDrawerSubtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">{t("common.date")}</span>
              <input
                type="date"
                max={todayIso}
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">{t("payments.expenseCategory")}</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              >
                {expenseCategories.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">{t("payments.description")}</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              placeholder={t("payments.expenseDescriptionPlaceholder")}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">{t("payments.vendor")}</span>
            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              placeholder={t("payments.vendorPlaceholder")}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">{t("common.amount")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-muted">{t("orders.paymentMode")}</span>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
              >
                {paymentModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">{t("common.notes")}</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint"
            />
          </label>

          {error && (
            <div className="rounded-lg bg-chip-red px-3 py-2 text-sm font-medium text-chip-red-fg">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-soft px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface hover:text-ink"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {saving ? t("payments.savingExpense") : t("payments.saveExpense")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <RequirePermission anyOf={["orders.viewPayments", "expenses.view"]}>
      <PaymentsPageContent />
    </RequirePermission>
  );
}
