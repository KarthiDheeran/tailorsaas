"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import {
  createExpense,
  getExpenses,
  isMissingExpensesSchemaError,
  voidExpense,
  type ExpenseFilters,
} from "@/lib/data/expenses-db";
import { getAllOrders } from "@/lib/data/orders-db";
import { expenseCategories, paymentModes } from "@/lib/constants";
import type { Expense, ExpenseCategory, Order, PaymentMode } from "@/lib/types";
import {
  getPaymentsReport,
  type PaymentsFilters,
  type PaymentsReport,
} from "@/lib/reports";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_EXPENSE_CATEGORIES = new Set<ExpenseCategory>(expenseCategories);
const VALID_PAYMENT_MODES = new Set<PaymentMode>(paymentModes);

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

// Shared by both the "Pending Dues" summary card and the Pending Dues tab's
// table, so the two can never drift: same definition/formula as the
// Dashboard's existing "Outstanding Balance" stat (lib/dashboard.ts's
// outstandingBalanceTotal) — every order with balance > 0, no date/filter
// scoping. Sorted oldest-delivery-date-first, so the most overdue orders
// surface at the top of the table (mirrors Dashboard's overdueOrders sort).
async function getPendingDuesOrders(): Promise<Order[]> {
  const allOrders = await getAllOrders(createAdminClient());
  return allOrders
    .filter((o) => o.balance > 0)
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
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMode: PaymentMode;
}): string | null {
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!ISO_DATE.test(data.expenseDate)) return "A valid expense date is required.";
  if (data.expenseDate > todayIso) return "Expense date cannot be in the future.";
  if (!VALID_EXPENSE_CATEGORIES.has(data.category)) return "Invalid expense category.";
  if (!data.description.trim()) return "Description is required.";
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    return "Amount must be greater than zero.";
  }
  if (!VALID_PAYMENT_MODES.has(data.paymentMode)) return "Invalid payment mode.";
  return null;
}
