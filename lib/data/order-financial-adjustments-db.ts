import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OrderFinancialAdjustment,
  OrderFinancialAdjustmentType,
  PaymentMode,
} from "@/lib/types";

const ADJUSTMENT_COLUMNS =
  "id, order_id, adjustment_date, adjustment_type, amount, payment_mode, reason, notes, recorded_by, voided, voided_at, voided_by, void_reason, created_at";

interface OrderFinancialAdjustmentRow {
  id: string;
  order_id: string;
  adjustment_date: string;
  adjustment_type: OrderFinancialAdjustmentType;
  amount: number;
  payment_mode: PaymentMode | null;
  reason: string;
  notes: string | null;
  recorded_by: string | null;
  voided: boolean;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
}

export function isMissingOrderFinancialAdjustmentsSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST202" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("order_financial_adjustments") ||
    message.includes("record_order_financial_adjustment") ||
    message.includes("void_order_financial_adjustment")
  );
}

export async function getOrderFinancialAdjustmentsForOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<OrderFinancialAdjustment[]> {
  const { data, error } = await supabase
    .from("order_financial_adjustments")
    .select(ADJUSTMENT_COLUMNS)
    .eq("order_id", orderId)
    .order("adjustment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as unknown as OrderFinancialAdjustmentRow[]) ?? []).map(mapAdjustment);
}

export async function getAllOrderFinancialAdjustments(
  supabase: SupabaseClient
): Promise<OrderFinancialAdjustment[]> {
  const { data, error } = await supabase
    .from("order_financial_adjustments")
    .select(ADJUSTMENT_COLUMNS)
    .order("adjustment_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as unknown as OrderFinancialAdjustmentRow[]) ?? []).map(mapAdjustment);
}

export async function recordOrderFinancialAdjustment(
  supabase: SupabaseClient,
  data: {
    orderId: string;
    adjustmentType: OrderFinancialAdjustmentType;
    amount: number;
    adjustmentDate: string;
    paymentMode?: PaymentMode;
    reason: string;
    notes?: string;
  }
): Promise<string> {
  const { data: adjustmentId, error } = await supabase.rpc(
    "record_order_financial_adjustment",
    {
      p_order_id: data.orderId,
      p_adjustment_type: data.adjustmentType,
      p_amount: data.amount,
      p_adjustment_date: data.adjustmentDate,
      p_payment_mode: data.paymentMode ?? null,
      p_reason: data.reason,
      p_notes: data.notes ?? null,
    }
  );
  if (error) throw error;
  return adjustmentId as string;
}

export async function voidOrderFinancialAdjustment(
  supabase: SupabaseClient,
  adjustmentId: string,
  reason: string
): Promise<void> {
  const { error } = await supabase.rpc("void_order_financial_adjustment", {
    p_adjustment_id: adjustmentId,
    p_reason: reason,
  });
  if (error) throw error;
}

function mapAdjustment(row: OrderFinancialAdjustmentRow): OrderFinancialAdjustment {
  return {
    id: row.id,
    orderId: row.order_id,
    adjustmentDate: row.adjustment_date,
    adjustmentType: row.adjustment_type,
    amount: row.amount,
    paymentMode: row.payment_mode ?? undefined,
    reason: row.reason,
    notes: row.notes ?? undefined,
    recordedBy: row.recorded_by ?? undefined,
    voided: row.voided,
    voidedAt: row.voided_at ?? undefined,
    voidedBy: row.voided_by ?? undefined,
    voidReason: row.void_reason ?? undefined,
    createdAt: row.created_at,
  };
}
