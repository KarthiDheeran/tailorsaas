"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getServerCallerPermissions,
  requireServerPermission,
} from "@/lib/auth/require-server-permission";
import {
  createExpense,
  getExpenses,
  isMissingExpensesSchemaError,
  voidExpense,
  type ExpenseFilters,
} from "@/lib/data/expenses-db";
import {
  getAllOrderFinancialAdjustments,
  isMissingOrderFinancialAdjustmentsSchemaError,
} from "@/lib/data/order-financial-adjustments-db";
import { getAllOrders } from "@/lib/data/orders-db";
import { expenseCategories, paymentModes } from "@/lib/constants";
import { isReceivableOrder } from "@/lib/order-finance";
import { hasPermission } from "@/lib/permissions";
import type {
  CustomerSnapshot,
  Expense,
  ExpenseCategory,
  ExpenseSource,
  Order,
  OrderFinancialAdjustment,
  OrderFinancialAdjustmentType,
  PaymentMode,
  PaymentType,
} from "@/lib/types";
import {
  buildPaymentsReportFromSource,
  getPaymentsReportSourceData,
  getPaymentsReport,
  type DateRange,
  type PaymentsFilters,
  type PaymentsReport,
} from "@/lib/reports";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_EXPENSE_CATEGORIES = new Set<ExpenseCategory>(expenseCategories);
const VALID_EXPENSE_SOURCES = new Set<ExpenseSource>([
  "Manual Expense",
  "Staff Payment",
  "Inventory Purchase",
]);
const VALID_PAYMENT_MODES = new Set<PaymentMode>(paymentModes);

export interface DailyClosingModeRow {
  mode: PaymentMode;
  collected: number;
  expenses: number | null;
  net: number | null;
}

export interface DailyClosingSummary {
  date: string;
  totalCollected: number;
  totalExpenses: number | null;
  netTotal: number | null;
  cashInHand: number | null;
  digitalNet: number | null;
  byMode: DailyClosingModeRow[];
  expensesAvailable: boolean;
}

export interface FinancialAdjustmentFilters {
  from: string;
  to: string;
  adjustmentType?: OrderFinancialAdjustmentType;
  paymentMode?: PaymentMode;
  query?: string;
  includeVoided?: boolean;
}

export interface FinancialAdjustmentLedgerRow {
  adjustment: OrderFinancialAdjustment;
  orderId: string;
  orderNumber: string;
  customer: CustomerSnapshot | undefined;
}

export interface PaymentsPageInitialFilters {
  range: DateRange;
  paymentMode?: PaymentMode;
  paymentType?: PaymentType;
  customerQuery?: string;
  adjustmentType?: OrderFinancialAdjustmentType;
  adjustmentPaymentMode?: PaymentMode;
  adjustmentQuery?: string;
  expenseSource?: ExpenseSource;
  expenseCategory?: ExpenseCategory;
  expensePaymentMode?: PaymentMode;
  expenseQuery?: string;
}

export interface PaymentsPageInitialData {
  report: PaymentsReport | null;
  todayReport: PaymentsReport | null;
  dailyClosing: DailyClosingSummary | null;
  pendingDuesOrders: Order[] | null;
  adjustments: FinancialAdjustmentLedgerRow[] | null;
  expenses: Expense[] | null;
  todayExpenses: number | null;
}

// ---------------------------------------------------------------------------
// Phase 7F: the Payments page is a dedicated, day-to-day operational screen
// — gated on orders.viewPayments — distinct from Reports' Payments tab
// (gated on reports.view, an analysis-oriented view; see
// app/(shell)/reports/actions.ts's requireReportsView). Both call the exact
// same lib/reports.ts#getPaymentsReport selector, so there is no duplicated
// ledger-building logic between the two screens — only the permission gate
// and the route differ. Reads use the admin client the same way Reports
// does (see lib/supabase/admin.ts's comment): this is what lets "Recorded
// By" resolve correctly for any orders.viewPayments holder, even one
// without settings.manageUsers, which a plain authenticated client's RLS
// would otherwise block (see the Order Details drawer's Payment History,
// which deliberately skips that column for the same reason).
//
// Voiding a payment from this page reuses the existing voidPaymentAction in
// app/(shell)/orders/actions.ts as-is — no new mutation/RPC here.
// ---------------------------------------------------------------------------

export async function getPaymentsLedgerAction(
  filters: PaymentsFilters,
  todayIso: string
): Promise<PaymentsReport | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.viewPayments");
  if (!guard.ok) return null;
  return getPaymentsReport(createAdminClient(), filters, todayIso);
}

export async function getPaymentsPageInitialDataAction(
  filters: PaymentsPageInitialFilters,
  todayIso: string
): Promise<PaymentsPageInitialData> {
  const empty: PaymentsPageInitialData = {
    report: null,
    todayReport: null,
    dailyClosing: null,
    pendingDuesOrders: null,
    adjustments: null,
    expenses: null,
    todayExpenses: null,
  };

  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (!permissions) return empty;
  if (
    !ISO_DATE.test(todayIso) ||
    !ISO_DATE.test(filters.range.from) ||
    !ISO_DATE.test(filters.range.to)
  ) {
    throw new Error("A valid date range is required.");
  }

  const canViewPayments = hasPermission(permissions, "orders.viewPayments");
  const canViewExpenses = hasPermission(permissions, "expenses.view");
  const admin = createAdminClient();

  let report: PaymentsReport | null = null;
  let todayReport: PaymentsReport | null = null;
  let dailyClosing: DailyClosingSummary | null = null;
  let pendingDuesOrders: Order[] | null = null;
  let adjustments: FinancialAdjustmentLedgerRow[] | null = null;

  if (canViewPayments) {
    const source = await getPaymentsReportSourceData(admin);
    report = buildPaymentsReportFromSource(
      source,
      {
        range: filters.range,
        paymentMode: filters.paymentMode,
        paymentType: filters.paymentType,
        customerQuery: filters.customerQuery,
      },
      todayIso
    );
    todayReport = buildPaymentsReportFromSource(
      source,
      { range: { from: todayIso, to: todayIso } },
      todayIso
    );
    pendingDuesOrders = source.allOrders
      .filter(isReceivableOrder)
      .sort((a, b) => (a.deliveryDate < b.deliveryDate ? -1 : 1));
    adjustments = source.financialAdjustmentsAvailable
      ? filterFinancialAdjustmentRows(source.allAdjustments, source.allOrders, {
          from: filters.range.from,
          to: filters.range.to,
          adjustmentType: filters.adjustmentType,
          paymentMode: filters.adjustmentPaymentMode,
          query: filters.adjustmentQuery,
          includeVoided: true,
        })
      : null;
  }

  let expenses: Expense[] | null = null;
  let todayExpenses: number | null = null;
  let todaysExpenseRows: Expense[] | null = null;
  if (canViewExpenses) {
    try {
      expenses = await getExpenses(admin, {
        from: filters.range.from,
        to: filters.range.to,
        source: filters.expenseSource,
        category: filters.expenseCategory,
        paymentMode: filters.expensePaymentMode,
        query: filters.expenseQuery,
        includeVoided: true,
      });
      todaysExpenseRows =
        filters.range.from === todayIso &&
        filters.range.to === todayIso &&
        !filters.expenseSource &&
        !filters.expenseCategory &&
        !filters.expensePaymentMode &&
        !filters.expenseQuery
          ? expenses
          : await getExpenses(admin, { from: todayIso, to: todayIso });
      todayExpenses = todaysExpenseRows.reduce(
        (sum, expense) => sum + Number(expense.amount),
        0
      );
    } catch (error) {
      if (!isMissingExpensesSchemaError(error)) throw error;
    }
  }

  if (canViewPayments && todayReport) {
    dailyClosing = buildDailyClosingSummary(todayIso, todayReport, todaysExpenseRows);
  }

  return {
    report,
    todayReport,
    dailyClosing,
    pendingDuesOrders,
    adjustments,
    expenses,
    todayExpenses,
  };
}

export async function getDailyClosingAction(todayIso: string): Promise<DailyClosingSummary | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.viewPayments");
  if (!guard.ok) return null;
  if (!ISO_DATE.test(todayIso)) throw new Error("A valid date is required.");

  const permissions = await getServerCallerPermissions(supabase);
  const canViewExpenses = hasPermission(permissions, "expenses.view");
  const admin = createAdminClient();

  const payments = await getPaymentsReport(
    admin,
    { range: { from: todayIso, to: todayIso } },
    todayIso
  );
  const collectedByMode = new Map(payments.byMode.map((row) => [row.mode, row.amount]));

  let expensesByMode: Map<PaymentMode, number> | null = null;
  let totalExpenses: number | null = null;
  let expensesAvailable = false;

  if (canViewExpenses) {
    try {
      const expenses = await getExpenses(admin, { from: todayIso, to: todayIso });
      expensesByMode = new Map<PaymentMode, number>();
      for (const expense of expenses) {
        expensesByMode.set(
          expense.paymentMode,
          (expensesByMode.get(expense.paymentMode) ?? 0) + Number(expense.amount)
        );
      }
      totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
      expensesAvailable = true;
    } catch (error) {
      if (!isMissingExpensesSchemaError(error)) throw error;
    }
  }

  const byMode: DailyClosingModeRow[] = paymentModes.map((mode) => {
    const collected = collectedByMode.get(mode) ?? 0;
    const expenses = expensesByMode?.get(mode) ?? 0;
    return {
      mode,
      collected,
      expenses: expensesByMode ? expenses : null,
      net: expensesByMode ? collected - expenses : null,
    };
  });

  const netTotal = totalExpenses === null ? null : payments.totalCollected - totalExpenses;
  const cashRow = byMode.find((row) => row.mode === "Cash");
  const digitalNet =
    netTotal === null || cashRow?.net === null || cashRow?.net === undefined
      ? null
      : netTotal - cashRow.net;

  return {
    date: todayIso,
    totalCollected: payments.totalCollected,
    totalExpenses,
    netTotal,
    cashInHand: cashRow?.net ?? null,
    digitalNet,
    byMode,
    expensesAvailable,
  };
}

// Shared by both the "Pending Dues" summary card and the Pending Dues tab's
// table, so the two can never drift: same definition/formula as the
// Dashboard's existing "Outstanding Balance" stat (lib/dashboard.ts's
// outstandingBalanceTotal) — every order with balance > 0, no date/filter
// scoping. Sorted oldest-delivery-date-first, so the most overdue orders
// surface at the top of the table (mirrors Dashboard's overdueOrders sort).
async function getPendingDuesOrders(): Promise<Order[]> {
  const allOrders = await getAllOrders(createAdminClient());
  return allOrders
    .filter(isReceivableOrder)
    .sort((a, b) => (a.deliveryDate < b.deliveryDate ? -1 : 1));
}

// "Pending Dues" summary card total.
export async function getPendingDuesAction(): Promise<number | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.viewPayments");
  if (!guard.ok) return null;
  const orders = await getPendingDuesOrders();
  return orders.reduce((sum, o) => sum + Number(o.balance), 0);
}

// Pending Dues tab's table rows.
export async function getPendingDuesOrdersAction(): Promise<Order[] | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.viewPayments");
  if (!guard.ok) return null;
  return getPendingDuesOrders();
}

export async function getFinancialAdjustmentsAction(
  filters: FinancialAdjustmentFilters
): Promise<FinancialAdjustmentLedgerRow[] | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.viewPayments");
  if (!guard.ok) return null;
  if (!ISO_DATE.test(filters.from) || !ISO_DATE.test(filters.to)) {
    throw new Error("A valid date range is required.");
  }

  try {
    const admin = createAdminClient();
    const [adjustments, orders] = await Promise.all([
      getAllOrderFinancialAdjustments(admin),
      getAllOrders(admin),
    ]);
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    const query = filters.query?.trim().toLowerCase() ?? "";

    return adjustments
      .filter((adjustment) => {
        if (adjustment.adjustmentDate < filters.from || adjustment.adjustmentDate > filters.to) {
          return false;
        }
        if (!filters.includeVoided && adjustment.voided) return false;
        if (filters.adjustmentType && adjustment.adjustmentType !== filters.adjustmentType) {
          return false;
        }
        if (filters.paymentMode && adjustment.paymentMode !== filters.paymentMode) {
          return false;
        }
        if (query) {
          const order = ordersById.get(adjustment.orderId);
          const haystack = [
            adjustment.reason,
            adjustment.notes ?? "",
            order?.orderNumber ?? "",
            order?.customerSnapshot?.name ?? "",
            order?.customerSnapshot?.phone ?? "",
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .map((adjustment) => {
        const order = ordersById.get(adjustment.orderId);
        return {
          adjustment,
          orderId: adjustment.orderId,
          orderNumber: order?.orderNumber ?? "—",
          customer: order?.customerSnapshot,
        };
      });
  } catch (error) {
    if (isMissingOrderFinancialAdjustmentsSchemaError(error)) return null;
    throw error;
  }
}

export async function getExpensesAction(filters: ExpenseFilters): Promise<Expense[] | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "expenses.view");
  if (!guard.ok) return null;
  try {
    return await getExpenses(supabase, filters);
  } catch (error) {
    if (isMissingExpensesSchemaError(error)) return null;
    throw error;
  }
}

function buildDailyClosingSummary(
  todayIso: string,
  payments: PaymentsReport,
  expenses: Expense[] | null
): DailyClosingSummary {
  const collectedByMode = new Map(payments.byMode.map((row) => [row.mode, row.amount]));
  const expensesByMode = expenses
    ? expenses.reduce((map, expense) => {
        map.set(
          expense.paymentMode,
          (map.get(expense.paymentMode) ?? 0) + Number(expense.amount)
        );
        return map;
      }, new Map<PaymentMode, number>())
    : null;
  const totalExpenses =
    expenses === null
      ? null
      : expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  const byMode: DailyClosingModeRow[] = paymentModes.map((mode) => {
    const collected = collectedByMode.get(mode) ?? 0;
    const expenseTotal = expensesByMode?.get(mode) ?? 0;
    return {
      mode,
      collected,
      expenses: expensesByMode ? expenseTotal : null,
      net: expensesByMode ? collected - expenseTotal : null,
    };
  });

  const netTotal = totalExpenses === null ? null : payments.totalCollected - totalExpenses;
  const cashRow = byMode.find((row) => row.mode === "Cash");
  const digitalNet =
    netTotal === null || cashRow?.net === null || cashRow?.net === undefined
      ? null
      : netTotal - cashRow.net;

  return {
    date: todayIso,
    totalCollected: payments.totalCollected,
    totalExpenses,
    netTotal,
    cashInHand: cashRow?.net ?? null,
    digitalNet,
    byMode,
    expensesAvailable: expenses !== null,
  };
}

function filterFinancialAdjustmentRows(
  adjustments: OrderFinancialAdjustment[],
  orders: Order[],
  filters: FinancialAdjustmentFilters
): FinancialAdjustmentLedgerRow[] {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const query = filters.query?.trim().toLowerCase() ?? "";

  return adjustments
    .filter((adjustment) => {
      if (adjustment.adjustmentDate < filters.from || adjustment.adjustmentDate > filters.to) {
        return false;
      }
      if (!filters.includeVoided && adjustment.voided) return false;
      if (filters.adjustmentType && adjustment.adjustmentType !== filters.adjustmentType) {
        return false;
      }
      if (filters.paymentMode && adjustment.paymentMode !== filters.paymentMode) {
        return false;
      }
      if (query) {
        const order = ordersById.get(adjustment.orderId);
        const haystack = [
          adjustment.reason,
          adjustment.notes ?? "",
          order?.orderNumber ?? "",
          order?.customerSnapshot?.name ?? "",
          order?.customerSnapshot?.phone ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .map((adjustment) => {
      const order = ordersById.get(adjustment.orderId);
      return {
        adjustment,
        orderId: adjustment.orderId,
        orderNumber: order?.orderNumber ?? "-",
        customer: order?.customerSnapshot,
      };
    });
}

export async function getExpenseTotalAction(filters: ExpenseFilters): Promise<number | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "expenses.view");
  if (!guard.ok) return null;
  try {
    const expenses = await getExpenses(supabase, filters);
    return expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  } catch (error) {
    if (isMissingExpensesSchemaError(error)) return null;
    throw error;
  }
}

export async function createExpenseAction(data: {
  expenseDate: string;
  source?: ExpenseSource;
  reference?: string;
  category: ExpenseCategory;
  vendor?: string;
  description: string;
  amount: number;
  paymentMode: PaymentMode;
  notes?: string;
}): Promise<ActionResult<Expense>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "expenses.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const validationError = validateExpenseInput(data);
  if (validationError) return { success: false, error: validationError };

  try {
    const expense = await createExpense(supabase, {
      ...data,
      recordedBy: guard.userId,
    });
    return { success: true, data: expense };
  } catch (error) {
    if (isMissingExpensesSchemaError(error)) {
      return { success: false, error: "Expenses are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record expense.",
    };
  }
}

export async function voidExpenseAction(
  id: string,
  reason: string
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "expenses.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!reason.trim()) return { success: false, error: "A reason is required." };

  try {
    await voidExpense(supabase, id, reason.trim(), guard.userId);
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingExpensesSchemaError(error)) {
      return { success: false, error: "Expenses are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to void expense.",
    };
  }
}

function validateExpenseInput(data: {
  expenseDate: string;
  source?: ExpenseSource;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMode: PaymentMode;
}): string | null {
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!ISO_DATE.test(data.expenseDate)) return "A valid expense date is required.";
  if (data.expenseDate > todayIso) return "Expense date cannot be in the future.";
  if (data.source && !VALID_EXPENSE_SOURCES.has(data.source)) return "Invalid expense source.";
  if (!VALID_EXPENSE_CATEGORIES.has(data.category)) return "Invalid expense category.";
  if (!data.description.trim()) return "Description is required.";
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    return "Amount must be greater than zero.";
  }
  if (!VALID_PAYMENT_MODES.has(data.paymentMode)) return "Invalid payment mode.";
  return null;
}
