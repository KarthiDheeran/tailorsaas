"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  Banknote,
  Calculator,
  ChevronDown,
  CreditCard,
  IndianRupee,
  Plus,
  Printer,
  X,
} from "lucide-react";
import {
  createExpenseAction,
  getPaymentsPageInitialDataAction,
  voidExpenseAction,
  type DailyClosingSummary,
  type FinancialAdjustmentLedgerRow,
} from "@/app/(shell)/payments/actions";
import { PaymentLedgerTable } from "@/components/payments/payment-ledger-table";
import { PendingDuesTable } from "@/components/payments/pending-dues-table";
import { FinancialAdjustmentsTable } from "@/components/payments/financial-adjustments-table";
import { PaymentsTabs, type PaymentsTab } from "@/components/payments/payments-tabs";
import { formatDate } from "@/components/orders/orders-table";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import {
  type DateRange,
  type PaymentsReport,
} from "@/lib/reports";
import { expenseCategories, paymentModes } from "@/lib/constants";
import type {
  Expense,
  ExpenseCategory,
  ExpenseSource,
  ExpenseScope,
  Order,
  OrderFinancialAdjustmentType,
  PaymentMode,
  PaymentType,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { getErrorMessage, LoadError } from "@/components/ui/load-error";
import { LoadingState } from "@/components/ui/loading-state";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { downloadCsv } from "@/lib/csv";
import { formatCurrency } from "@/lib/currency";
import type { StaffOption } from "@/lib/data/staff-db";

const PAYMENT_TYPES: PaymentType[] = ["Advance", "Partial", "Final"];
const ADJUSTMENT_TYPES: OrderFinancialAdjustmentType[] = [
  "Discount",
  "Extra Charge",
  "Refund",
];
const EXPENSE_SOURCES: ExpenseSource[] = [
  "Manual Expense",
  "Staff Payment",
  "Inventory Purchase",
];
// Phase 7G: a deliberately simpler date-filter set than Reports' full
// six-preset range — this page is a daily operational ledger, not an
// analysis tool, so "All Time" and a custom range don't belong here.
const EMPTY_REPORT: PaymentsReport = {
  totalCollected: 0,
  byMode: [],
  outstandingBalance: 0,
  overdueBalance: 0,
  rows: [],
};

function money(n: number) {
  return formatCurrency(n);
}

function FinanceDateRange({ range, onChange }: { range: DateRange; onChange: (range: DateRange) => void }) {
  return <div className="flex h-9 items-center gap-2">
    <label className="flex h-9 items-center overflow-hidden rounded-lg border border-border bg-white"><span className="border-r border-border bg-surface-muted px-2 text-xs font-semibold text-ink-muted">From</span><input aria-label="Income from date" type="date" value={range.from} max={range.to} onChange={(event) => onChange({ ...range, from: event.target.value })} className="h-full border-0 bg-white px-2 text-sm text-ink outline-none" /></label>
    <label className="flex h-9 items-center overflow-hidden rounded-lg border border-border bg-white"><span className="border-r border-border bg-surface-muted px-2 text-xs font-semibold text-ink-muted">To</span><input aria-label="Income to date" type="date" value={range.to} min={range.from} onChange={(event) => onChange({ ...range, to: event.target.value })} className="h-full border-0 bg-white px-2 text-sm text-ink outline-none" /></label>
  </div>;
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
  const canViewPayments = hasPermission("finance.income.view");
  const canViewExpenses = hasPermission("expenses.view");
  const canManageExpenses = hasPermission("expenses.manage");
  const canPrintPaymentReceipts = hasPermission("orders.printCustomerReceipt");
  const todayIso = new Date().toISOString().slice(0, 10);

  const [customRange, setCustomRange] = useState<DateRange>({
    from: todayIso,
    to: todayIso,
  });
  const [paymentMode, setPaymentMode] = useState<PaymentMode | "">("");
  const [paymentType, setPaymentType] = useState<PaymentType | "">("");
  const [collectorStaffId, setCollectorStaffId] = useState("");
  const [collectors, setCollectors] = useState<StaffOption[]>([]);
  const [query, setQuery] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [report, setReport] = useState<PaymentsReport>(EMPTY_REPORT);
  // Phase 7G: the 4 operational summary cards are a fixed "how's today
  // going" pulse — always scoped to today's date, independent of whatever
  // date range/mode/type/search the table below is currently filtered to,
  // so switching the table to "Yesterday" doesn't make "Today Collected"
  // lie. Fetched in the bundled page payload with its own always-today range.
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
  const [expenseSource, setExpenseSource] = useState<ExpenseSource | "">("");
  const [expenseScope, setExpenseScope] = useState<ExpenseScope | "">("");
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory | "">("");
  const [expenseMode, setExpenseMode] = useState<PaymentMode | "">("");
  const [expenseQuery, setExpenseQuery] = useState("");
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseRefreshKey, setExpenseRefreshKey] = useState(0);
  const [expensesMigrationMissing, setExpensesMigrationMissing] = useState(false);
  const [tab, setTab] = useState<PaymentsTab>(canViewPayments ? "collections" : "expenses");
  const [loadError, setLoadError] = useState<string | null>(null);
  // First paint is bundled into one server action; later filter changes refresh in place.
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);

  const range = customRange;
  const rangeFrom = range.from;
  const rangeTo = range.to;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (tabParam === "collections" || tabParam === "expenses") {
      setTab(tabParam);
      window.history.replaceState({}, "", "/payments");
    } else if (tabParam) {
      setTab(canViewPayments ? "collections" : "expenses");
      window.history.replaceState({}, "", "/payments");
    }
  }, [canViewPayments]);

  useEffect(() => {
    if (!canViewPayments && canViewExpenses && tab !== "expenses") {
      setTab("expenses");
    }
    if (!canViewExpenses && tab === "expenses") {
      setTab("collections");
    }
  }, [canViewPayments, canViewExpenses, tab]);

  useEffect(() => {
    let cancelled = false;
    setLoadingResults(true);
    getPaymentsPageInitialDataAction(
      {
        activeTab: tab,
        range: { from: rangeFrom, to: rangeTo },
        paymentMode: paymentMode || undefined,
        paymentType: paymentType || undefined,
        collectorStaffId: collectorStaffId || undefined,
        customerQuery: query,
        adjustmentType: adjustmentType || undefined,
        adjustmentPaymentMode: adjustmentMode || undefined,
        adjustmentQuery,
        expenseSource: expenseSource || undefined,
        expenseScope: expenseScope || undefined,
        expenseCategory: expenseCategory || undefined,
        expensePaymentMode: expenseMode || undefined,
        expenseQuery,
      },
      todayIso
    )
      .then((result) => {
        if (cancelled) return;
        if (tab === "collections") setReport(result.report ?? EMPTY_REPORT);
        if (result.dailyClosing) setDailyClosing(result.dailyClosing);
        setCollectors(result.collectors);
        if (tab === "pending-dues") setPendingDuesOrders(result.pendingDuesOrders ?? []);
        if (tab === "adjustments") {
          setAdjustmentsMigrationMissing(canViewPayments && result.adjustments === null);
          setAdjustments(result.adjustments ?? []);
        }
        if (tab === "expenses") {
          setExpensesMigrationMissing(canViewExpenses && result.expenses === null);
          setExpenses(result.expenses ?? []);
        }
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Failed to load payments."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInitialLoaded(true);
          setLoadingResults(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    canViewPayments,
    canViewExpenses,
    tab,
    rangeFrom,
    rangeTo,
    paymentMode,
    paymentType,
    collectorStaffId,
    query,
    adjustmentType,
    adjustmentMode,
    adjustmentQuery,
    expenseSource,
    expenseScope,
    expenseCategory,
    expenseMode,
    expenseQuery,
    todayIso,
    refreshTick,
    expenseRefreshKey,
  ]);

  const isLoading = !initialLoaded;

  function handleExportCollections() {
    downloadCsv(
      `payment-collections-${range.from}-to-${range.to}.csv`,
      [
        "Payment Date",
        "Order No",
        "Customer",
        "Amount",
        "Payment Mode",
        "Payment Type",
        "Collected By",
        "Status",
        "Void Reason",
      ],
      report.rows.map((row) => [
        row.payment.paymentDate,
        row.orderNumber,
        row.customer?.name ?? "Unknown",
        row.payment.amount,
        row.payment.paymentMode,
        row.payment.paymentType,
        row.payment.receivedByOperatorName ?? "",
        row.payment.voided ? "Voided" : "Active",
        row.payment.voidReason ?? "",
      ])
    );
  }

  function handleExportPendingDues() {
    downloadCsv(
      `pending-dues-${todayIso}.csv`,
      [
        "Order No",
        "Customer",
        "Phone",
        "Delivery Date",
        "Total Bill",
        "Paid",
        "Balance Due",
        "Status",
      ],
      pendingDuesOrders.map((order) => [
        order.orderNumber,
        order.customerSnapshot?.name ?? "Unknown",
        order.customerSnapshot?.phone ?? "",
        order.deliveryDate,
        order.totalAmount,
        order.advancePaid,
        order.balance,
        order.deliveryDate < todayIso ? "Overdue" : "Due",
      ])
    );
  }

  function handleExportAdjustments() {
    downloadCsv(
      `financial-adjustments-${range.from}-to-${range.to}.csv`,
      [
        "Date",
        "Order No",
        "Customer",
        "Type",
        "Amount",
        "Reason",
        "Notes",
        "Mode",
        "Status",
        "Void Reason",
      ],
      adjustments.map((row) => [
        row.adjustment.adjustmentDate,
        row.orderNumber,
        row.customer?.name ?? "Unknown",
        row.adjustment.adjustmentType,
        row.adjustment.adjustmentType === "Extra Charge"
          ? row.adjustment.amount
          : -row.adjustment.amount,
        row.adjustment.reason,
        row.adjustment.notes ?? "",
        row.adjustment.paymentMode ?? "",
        row.adjustment.voided ? "Voided" : "Active",
        row.adjustment.voidReason ?? "",
      ])
    );
  }

  function handleExportExpenses() {
    downloadCsv(
      `expenses-${range.from}-to-${range.to}.csv`,
      [
        "Date",
        "Source",
        "Reference",
        "Category",
        "Vendor",
        "Description",
        "Amount",
        "Payment Mode",
        "Notes",
        "Status",
        "Void Reason",
      ],
      expenses.map((expense) => [
        expense.expenseDate,
        expense.source ?? "Manual Expense",
        expense.reference ?? "",
        expense.category,
        expense.vendor ?? "",
        expense.description,
        expense.amount,
        expense.paymentMode,
        expense.notes ?? "",
        expense.voided ? "Voided" : "Active",
        expense.voidReason ?? "",
      ])
    );
  }

  return (
    <div className="w-full max-w-none bg-[#f5f8ff] p-2 pb-4 sm:px-3 sm:py-2 lg:px-4 [&_table_td]:!px-2 [&_table_td]:!py-1.5 [&_table_th]:!px-2 [&_table_th]:!py-1.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#c9d7ea] bg-white px-3 py-2 shadow-[0_2px_8px_rgba(30,64,175,0.06)]">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink">{t("payments.title")}</h1>
          <p className="mt-0.5 text-xs font-medium text-ink-muted">{t("payments.subtitle")}</p>
        </div>
        <span className="rounded-md border border-primary/20 bg-primary-tint px-3 py-1.5 text-xs font-bold text-primary">Classic Compact View</span>
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
          {canViewPayments && dailyClosing && (
            <DailyClosingPanel summary={dailyClosing} />
          )}

          <PaymentsTabs
            active={tab}
            onChange={setTab}
            canViewPayments={canViewPayments}
            canViewExpenses={canViewExpenses}
          />

          <div className={cn("mb-2 overflow-hidden rounded-full transition-all", loadingResults ? "h-5 bg-primary-tint" : "h-0")} aria-live="polite" aria-label={loadingResults ? "Loading finance results" : undefined}>
            {loadingResults && <div className="flex h-full items-center gap-2 px-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15"><span className="block h-full w-2/5 animate-pulse rounded-full bg-primary" /></span><span className="text-[11px] font-semibold text-primary">Loading results…</span></div>}
          </div>

          {tab === "pending-dues" && (
            <>
              <div className="mb-2 flex justify-end">
                <ExportCsvButton
                  onClick={handleExportPendingDues}
                  disabled={pendingDuesOrders.length === 0}
                  label={t("reports.exportCsv")}
                />
              </div>
              <PendingDuesTable orders={pendingDuesOrders} />
            </>
          )}

          {tab === "adjustments" && (
            <>
              {adjustmentsMigrationMissing && (
                <div className="mb-5 rounded-xl border border-border-soft bg-white p-4 text-sm text-ink-muted shadow-soft">
                  Financial adjustments are ready in the app, but the database migration has not been applied yet.
                  Apply <span className="font-semibold text-ink">supabase/migrations/0018_order_financial_adjustments.sql</span> to start seeing discounts, refunds, and extra charges here.
                </div>
              )}

              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-white p-2">
                <FinanceDateRange range={customRange} onChange={setCustomRange} />
                <SelectShell className="w-56" size="sm">
                  <select
                    value={adjustmentType}
                    onChange={(e) =>
                      setAdjustmentType(e.target.value as OrderFinancialAdjustmentType | "")
                    }
                    className={selectClassName("h-9 text-sm leading-9")}
                  >
                    <option value="">All Adjustment Types</option>
                    {ADJUSTMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </SelectShell>
                <SelectShell className="w-52" size="sm">
                  <select
                    value={adjustmentMode}
                    onChange={(e) => setAdjustmentMode(e.target.value as PaymentMode | "")}
                    className={selectClassName("h-9 text-sm leading-9")}
                  >
                    <option value="">All Refund Modes</option>
                    {paymentModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </SelectShell>
                <input
                  value={adjustmentQuery}
                  onChange={(e) => setAdjustmentQuery(e.target.value)}
                  placeholder="Search order, customer, reason, or notes"
                  className="h-9 w-72 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
                />
                <ExportCsvButton
                  onClick={handleExportAdjustments}
                  disabled={adjustments.length === 0}
                  label={t("reports.exportCsv")}
                  className="ml-auto"
                />
              </div>

              <FinancialAdjustmentsTable rows={adjustments} />
            </>
          )}

          {tab === "collections" && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-white p-2">
                <FinanceDateRange range={customRange} onChange={setCustomRange} />
                <SelectShell className="w-56" size="sm">
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as PaymentMode | "")}
                    className={selectClassName("h-9 text-sm leading-9")}
                  >
                    <option value="">{t("payments.allCollectionModes")}</option>
                    {paymentModes.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </SelectShell>
                <SelectShell className="w-56" size="sm">
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as PaymentType | "")}
                    className={selectClassName("h-9 text-sm leading-9")}
                  >
                    <option value="">{t("payments.allCollectionTypes")}</option>
                    {PAYMENT_TYPES.map((pt) => (
                      <option key={pt} value={pt}>
                        {pt}
                      </option>
                    ))}
                  </select>
                </SelectShell>
                <SelectShell className="w-56" size="sm">
                  <select value={collectorStaffId} onChange={(event) => setCollectorStaffId(event.target.value)} className={selectClassName("h-9 text-sm leading-9")}>
                    <option value="">All Staff Collectors</option>
                    {collectors.map((member) => <option key={member.id} value={member.id}>{member.staffNumber} — {member.name}</option>)}
                  </select>
                </SelectShell>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("payments.searchPlaceholder")}
                  className="h-9 w-56 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
                />
                <ExportCsvButton
                  onClick={handleExportCollections}
                  disabled={report.rows.length === 0}
                  label={t("reports.exportCsv")}
                  className="ml-auto"
                />
              </div>

              <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-white px-3 py-2 shadow-[0_1px_4px_rgba(30,64,175,0.05)]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Filtered Income Total</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {collectorStaffId
                      ? collectors.find((member) => member.id === collectorStaffId)?.name ?? "Selected staff"
                      : "All staff collectors"}
                    {" · "}{formatDate(customRange.from)} to {formatDate(customRange.to)}
                  </p>
                </div>
                <div className="flex items-center gap-5 text-right">
                  <div><p className="text-[11px] font-semibold text-ink-muted">Transactions</p><p className="text-base font-bold text-ink">{report.rows.filter((row) => !row.payment.voided).length}</p></div>
                  <div><p className="text-[11px] font-semibold text-primary">Collected Amount</p><p className="text-xl font-bold text-primary">{money(report.totalCollected)}</p></div>
                </div>
              </div>

              <PaymentLedgerTable
                rows={report.rows}
                emptyMessage={t("payments.noEntriesMatch")}
                showNotes={false}
                showRecordedBy={false}
                showCollectedBy
                renderActions={(row) => (
                  <div className="flex items-center justify-end gap-3">
                    {canPrintPaymentReceipts && !row.payment.voided && (
                      <Link
                        href={`/orders/${row.payment.orderId}/print/payment/${row.payment.id}`}
                        title="Print payment receipt"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
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

              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-white p-2">
                <FinanceDateRange range={customRange} onChange={setCustomRange} />
                {canManageExpenses && <SelectShell className="w-40" size="sm">
                  <select value={expenseScope} onChange={(event) => setExpenseScope(event.target.value as ExpenseScope | "")} className={selectClassName("h-9 text-sm leading-9")}>
                    <option value="">All Expense Types</option>
                    <option value="Business">Business</option>
                    <option value="Personal">Personal</option>
                  </select>
                </SelectShell>}
                <SelectShell className="w-44" size="sm">
                  <select
                    value={expenseSource}
                    onChange={(e) => setExpenseSource(e.target.value as ExpenseSource | "")}
                    className={selectClassName("h-9 text-sm leading-9")}
                  >
                    <option value="">All Sources</option>
                    {EXPENSE_SOURCES.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </SelectShell>
                <SelectShell className="w-60" size="sm">
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory | "")}
                    className={selectClassName("h-9 text-sm leading-9")}
                  >
                    <option value="">{t("payments.allExpenseCategories")}</option>
                    {expenseCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </SelectShell>
                <SelectShell className="w-52" size="sm">
                  <select
                    value={expenseMode}
                    onChange={(e) => setExpenseMode(e.target.value as PaymentMode | "")}
                    className={selectClassName("h-9 text-sm leading-9")}
                  >
                    <option value="">{t("payments.allExpenseModes")}</option>
                    {paymentModes.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </SelectShell>
                <input
                  value={expenseQuery}
                  onChange={(e) => setExpenseQuery(e.target.value)}
                  placeholder={t("payments.expenseSearchPlaceholder")}
                  className="h-9 w-56 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-primary focus:ring-2 focus:ring-primary-tint"
                />
                <ExportCsvButton
                  onClick={handleExportExpenses}
                  disabled={expenses.length === 0}
                  label={t("reports.exportCsv")}
                  className={canManageExpenses && !expensesMigrationMissing ? "" : "ml-auto"}
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

              <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-white px-3 py-2 shadow-[0_1px_4px_rgba(30,64,175,0.05)]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Filtered Expense Total</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {expenseScope || "All expense types"}{" · "}{expenseSource || "All sources"}{expenseCategory ? ` · ${expenseCategory}` : ""}{" · "}{formatDate(customRange.from)} to {formatDate(customRange.to)}
                  </p>
                </div>
                <div className="flex items-center gap-5 text-right">
                  <div><p className="text-[11px] font-semibold text-ink-muted">Transactions</p><p className="text-base font-bold text-ink">{expenses.filter((expense) => !expense.voided).length}</p></div>
                  <div><p className="text-[11px] font-semibold text-primary">Business</p><p className="text-lg font-bold text-primary">{money(expenses.filter((expense) => !expense.voided && expense.expenseScope === "Business").reduce((sum, expense) => sum + Number(expense.amount), 0))}</p></div>
                  {canManageExpenses && <div><p className="text-[11px] font-semibold text-violet-700">Personal</p><p className="text-lg font-bold text-violet-700">{money(expenses.filter((expense) => !expense.voided && expense.expenseScope === "Personal").reduce((sum, expense) => sum + Number(expense.amount), 0))}</p></div>}
                  <div><p className="text-[11px] font-semibold text-ink">{canManageExpenses ? "Combined" : "Total"}</p><p className="text-xl font-bold text-ink">{money(expenses.filter((expense) => !expense.voided).reduce((sum, expense) => sum + Number(expense.amount), 0))}</p></div>
                </div>
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
    <section className="mb-2 rounded-lg border border-[#c9d7ea] bg-white shadow-[0_2px_8px_rgba(30,64,175,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div>
          <h2 className="text-sm font-bold text-ink">Period Summary</h2>
          <p className="text-xs text-ink-muted">
            Income, business expenses, personal expenses, and net business position for the selected period.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm font-semibold text-ink-muted">
          {formatDate(summary.fromDate)} to {formatDate(summary.toDate)}
        </div>
      </div>

      <div className="grid grid-cols-1 border-b border-border sm:grid-cols-2 xl:grid-cols-6">
        <ClosingMetric
          icon={IndianRupee}
          label="Total Received"
          value={money(summary.totalCollected)}
        />
        <ClosingMetric
          icon={Banknote}
          label="Cash in Hand"
          value={summary.cashInHand === null ? money(cashCollected) : money(summary.cashInHand)}
        />
        <ClosingMetric
          icon={CreditCard}
          label="Digital Net"
          value={summary.digitalNet === null ? money(digitalCollected) : money(summary.digitalNet)}
        />
        <ClosingMetric
          icon={Banknote}
          label="Business Expenses"
          value={summary.totalExpenses === null ? "Pending" : money(summary.totalExpenses)}
          warning={(summary.totalExpenses ?? 0) > 0}
        />
        <ClosingMetric
          icon={Banknote}
          label="Personal Expenses"
          value={summary.personalExpenses === null ? "Pending" : money(summary.personalExpenses)}
          warning={(summary.personalExpenses ?? 0) > 0}
        />
        <ClosingMetric
          icon={Calculator}
          label="Net Business Amount"
          value={summary.netTotal === null ? "Pending" : money(summary.netTotal)}
          warning={summary.netTotal !== null && summary.netTotal < 0}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-muted text-[14px] font-semibold text-ink-muted">
            <tr className="border-b border-border">
              <th className="whitespace-nowrap px-5 py-2.5">Mode</th>
              <th className="whitespace-nowrap px-5 py-2.5 text-right">Received</th>
              <th className="whitespace-nowrap px-5 py-2.5 text-right">Expenses</th>
              <th className="whitespace-nowrap px-5 py-2.5 text-right">Net</th>
            </tr>
          </thead>
          <tbody className="text-[15px]">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-ink-muted">
                  No collections or expenses recorded today.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.mode} className="border-t border-border-soft transition-colors hover:bg-surface-muted">
                  <td className="whitespace-nowrap px-5 py-2.5 font-medium text-ink">
                    {row.mode}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink">
                    {money(row.collected)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right text-ink-muted">
                    {row.expenses === null ? "-" : money(row.expenses)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-5 py-2.5 text-right font-bold",
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
  warning,
}: {
  icon: typeof IndianRupee;
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="flex gap-2 border-b border-border-soft px-3 py-2 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          warning ? "bg-warning-soft text-warning" : "bg-primary-tint text-primary"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-muted">{label}</div>
        <div
          className={cn(
            "text-lg font-bold",
            warning ? "text-warning" : "text-ink"
          )}
        >
          {value}
        </div>
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
            <th className="whitespace-nowrap px-5 py-3">Source</th>
            <th className="whitespace-nowrap px-5 py-3">Type</th>
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
              <td className="whitespace-nowrap px-5 py-3 text-ink">
                {expense.source ?? "Manual Expense"}
              </td>
              <td className="whitespace-nowrap px-5 py-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", expense.expenseScope === "Personal" ? "bg-violet-100 text-violet-700" : "bg-primary-tint text-primary")}>{expense.expenseScope}</span></td>
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
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface-muted"
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
  const [expenseScope, setExpenseScope] = useState<ExpenseScope>("Business");
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
      source: "Manual Expense",
      expenseScope,
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
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-muted">Expense Type</span>
            <SelectShell><select value={expenseScope} onChange={(event) => setExpenseScope(event.target.value as ExpenseScope)} className={selectClassName("h-11 text-sm leading-[44px]")}><option value="Business">Business</option><option value="Personal">Personal</option></select></SelectShell>
            <span className="text-xs text-ink-muted">Personal expenses are tracked separately and excluded from business closing totals.</span>
          </label>
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
              <SelectShell>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className={selectClassName("h-11 text-sm leading-[44px]")}
                >
                  {expenseCategories.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </SelectShell>
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
              <SelectShell>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className={selectClassName("h-11 text-sm leading-[44px]")}
                >
                  {paymentModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </SelectShell>
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
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink"
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

function SelectShell({
  children,
  className,
  size = "md",
}: {
  children: ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      {children}
      <ChevronDown
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted",
          size === "sm" && "h-3.5 w-3.5"
        )}
      />
    </div>
  );
}

function selectClassName(extra?: string): string {
  return cn(
    "w-full appearance-none rounded-lg border border-border bg-white py-0 pl-3 pr-10 text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-tint",
    extra
  );
}

export default function PaymentsPage() {
  return (
    <RequirePermission anyOf={["finance.income.view", "expenses.view"]}>
      <PaymentsPageContent />
    </RequirePermission>
  );
}
