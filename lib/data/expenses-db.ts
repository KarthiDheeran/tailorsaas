import type { SupabaseClient } from "@supabase/supabase-js";
import type { Expense, ExpenseCategory, ExpenseSource, PaymentMode } from "@/lib/types";

const EXPENSE_COLUMNS =
  "id, expense_date, category, source, reference, vendor, description, amount, payment_mode, notes, recorded_by, voided, voided_at, voided_by, void_reason, created_at";
const LEGACY_EXPENSE_COLUMNS =
  "id, expense_date, category, vendor, description, amount, payment_mode, notes, recorded_by, voided, voided_at, voided_by, void_reason, created_at";

interface ExpenseRow {
  id: string;
  expense_date: string;
  category: ExpenseCategory;
  source?: ExpenseSource | null;
  reference?: string | null;
  vendor: string | null;
  description: string;
  amount: number;
  payment_mode: PaymentMode;
  notes: string | null;
  recorded_by: string | null;
  voided: boolean;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
}

export function isMissingExpensesSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("expenses")
  );
}

function isMissingExpenseSourceColumnError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return candidate.code === "PGRST204" || message.includes("source") || message.includes("reference");
}

export interface ExpenseFilters {
  from: string;
  to: string;
  category?: ExpenseCategory;
  paymentMode?: PaymentMode;
  source?: ExpenseSource;
  query?: string;
  includeVoided?: boolean;
}

export interface ExpenseInput {
  expenseDate: string;
  category: ExpenseCategory;
  source?: ExpenseSource;
  reference?: string;
  vendor?: string;
  description: string;
  amount: number;
  paymentMode: PaymentMode;
  notes?: string;
  recordedBy: string;
}

function mapExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    expenseDate: row.expense_date,
    category: row.category,
    source: row.source ?? "Manual Expense",
    reference: row.reference ?? undefined,
    vendor: row.vendor ?? undefined,
    description: row.description,
    amount: row.amount,
    paymentMode: row.payment_mode,
    notes: row.notes ?? undefined,
    recordedBy: row.recorded_by ?? undefined,
    voided: row.voided,
    voidedAt: row.voided_at ?? undefined,
    voidedBy: row.voided_by ?? undefined,
    voidReason: row.void_reason ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getExpenses(
  supabase: SupabaseClient,
  filters: ExpenseFilters
): Promise<Expense[]> {
  let query = supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .gte("expense_date", filters.from)
    .lte("expense_date", filters.to)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.paymentMode) query = query.eq("payment_mode", filters.paymentMode);
  if (!filters.includeVoided) query = query.eq("voided", false);

  let { data, error } = await query;
  if (error && isMissingExpenseSourceColumnError(error)) {
    let fallback = supabase
      .from("expenses")
      .select(LEGACY_EXPENSE_COLUMNS)
      .gte("expense_date", filters.from)
      .lte("expense_date", filters.to)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (filters.category) fallback = fallback.eq("category", filters.category);
    if (filters.paymentMode) fallback = fallback.eq("payment_mode", filters.paymentMode);
    if (!filters.includeVoided) fallback = fallback.eq("voided", false);
    const result = await fallback;
    data = result.data as unknown as typeof data;
    error = result.error;
  }
  if (error) throw error;

  const expenses = ((data as unknown as ExpenseRow[]) ?? []).map(mapExpense);
  const sourceFiltered = filters.source
    ? expenses.filter((expense) => expense.source === filters.source)
    : expenses;
  const q = filters.query?.trim().toLowerCase();
  if (!q) return sourceFiltered;
  return sourceFiltered.filter((expense) =>
    [
      expense.source,
      expense.reference,
      expense.vendor,
      expense.description,
      expense.category,
      expense.paymentMode,
      expense.notes,
    ]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(q))
  );
}

export async function createExpense(
  supabase: SupabaseClient,
  data: ExpenseInput
): Promise<Expense> {
  const { data: row, error } = await supabase
    .from("expenses")
    .insert({
      expense_date: data.expenseDate,
      category: data.category,
      source: data.source ?? "Manual Expense",
      reference: data.reference?.trim() || null,
      vendor: data.vendor?.trim() || null,
      description: data.description.trim(),
      amount: data.amount,
      payment_mode: data.paymentMode,
      notes: data.notes?.trim() || null,
      recorded_by: data.recordedBy,
    })
    .select(EXPENSE_COLUMNS)
    .single();
  if (error && isMissingExpenseSourceColumnError(error)) {
    const retry = await supabase
      .from("expenses")
      .insert({
        expense_date: data.expenseDate,
        category: data.category,
        vendor: data.vendor?.trim() || null,
        description: data.description.trim(),
        amount: data.amount,
        payment_mode: data.paymentMode,
        notes: data.notes?.trim() || null,
        recorded_by: data.recordedBy,
      })
      .select(LEGACY_EXPENSE_COLUMNS)
      .single();
    if (retry.error) throw retry.error;
    return mapExpense(retry.data as unknown as ExpenseRow);
  }
  if (error) throw error;
  return mapExpense(row as unknown as ExpenseRow);
}

export async function voidExpense(
  supabase: SupabaseClient,
  id: string,
  reason: string,
  voidedBy: string
): Promise<void> {
  const { error } = await supabase
    .from("expenses")
    .update({
      voided: true,
      voided_at: new Date().toISOString(),
      voided_by: voidedBy,
      void_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("voided", false);
  if (error) throw error;
}
