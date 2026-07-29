import type { SupabaseClient } from "@supabase/supabase-js";
import type { Payment, PaymentMode, PaymentType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Phase 7B: real, Supabase-backed payment ledger reads/writes — same
// client-first-parameter pattern as lib/data/orders-db.ts. Writes never go
// through a plain insert/update here: recordPayment/voidPayment both call
// the two SECURITY DEFINER RPCs from supabase/migrations/0008_payments.sql
// (record_payment / void_payment), which do their own permission check,
// amount/overpayment/date validation, and payment_type classification —
// this file does not duplicate any of that, it only shapes the call and
// maps the result. orders.advance_paid/balance/payment_status are never
// written from here either — the migration's trigger keeps those in sync
// off the payments table itself.
// ---------------------------------------------------------------------------

const PAYMENT_COLUMNS =
  "id, order_id, amount, payment_date, payment_mode, payment_type, notes, recorded_by, received_by_operator_name, voided, voided_at, voided_by, void_reason, created_at";

interface PaymentRow {
  id: string;
  order_id: string;
  amount: number;
  payment_date: string;
  payment_mode: PaymentMode;
  payment_type: PaymentType;
  notes: string | null;
  recorded_by: string | null;
  received_by_operator_name?: string | null;
  voided: boolean;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
}

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    orderId: row.order_id,
    amount: row.amount,
    paymentDate: row.payment_date,
    paymentMode: row.payment_mode,
    paymentType: row.payment_type,
    notes: row.notes ?? undefined,
    recordedBy: row.recorded_by ?? undefined,
    receivedByOperatorName: row.received_by_operator_name?.trim() ? row.received_by_operator_name : undefined,
    voided: row.voided,
    voidedAt: row.voided_at ?? undefined,
    voidedBy: row.voided_by ?? undefined,
    voidReason: row.void_reason ?? undefined,
    createdAt: row.created_at,
  };
}

// Newest first — payment_date is the shopkeeper-entered date (may be
// backdated), created_at breaks ties between same-day entries in the order
// they were actually recorded.
export async function getPaymentsForOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("order_id", orderId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as unknown as PaymentRow[]) ?? []).map(mapPayment);
}

// Every payment across every order — not scoped to a single order_id, so
// only used where broader access is already expected (Phase 7D:
// lib/reports.ts's Payments tab ledger, called with the admin client the
// same way getAllOrders already is there — see app/(shell)/reports/
// actions.ts's requireReportsView). Same newest-first ordering as
// getPaymentsForOrder.
export async function getAllPayments(supabase: SupabaseClient): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as unknown as PaymentRow[]) ?? []).map(mapPayment);
}

// Returns the new payment's id. Throws (with the RPC's own exception
// message — e.g. "amount exceeds remaining balance of 500") on any
// validation failure; callers (Server Actions) are responsible for turning
// that into an ActionResult rather than letting it bubble as a 500.
export async function recordPayment(
  supabase: SupabaseClient,
  data: {
    orderId: string;
    amount: number;
    paymentDate: string;
    paymentMode: PaymentMode;
    notes?: string;
  }
): Promise<string> {
  const { data: paymentId, error } = await supabase.rpc("record_payment", {
    p_order_id: data.orderId,
    p_amount: data.amount,
    p_payment_date: data.paymentDate,
    p_payment_mode: data.paymentMode,
    p_notes: data.notes || null,
  });
  if (error) throw error;
  return paymentId as string;
}

// Soft-void only — never a hard delete (matches the no-hard-delete
// convention already used for Staff/Catalog/roles/profiles elsewhere in
// this app). Throws on failure (e.g. already voided, or missing
// orders.voidPayment).
export async function voidPayment(
  supabase: SupabaseClient,
  paymentId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase.rpc("void_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) throw error;
}
