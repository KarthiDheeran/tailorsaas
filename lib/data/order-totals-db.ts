import type { SupabaseClient } from "@supabase/supabase-js";
import { getShopBillingSettings } from "@/lib/data/shop-billing-settings-db";
import { orderTotalWithTax } from "@/lib/order-tax";
import type { PaymentStatus } from "@/lib/types";

interface OrderForTotalsRow {
  id: string;
  delivery_date: string | null;
}

interface AmountRow {
  amount: number;
}

interface PaymentAmountRow {
  amount: number;
  voided: boolean;
}

interface AdjustmentAmountRow {
  adjustment_type: "Discount" | "Extra Charge" | "Refund";
  amount: number;
  voided: boolean;
}

function paymentStatus(total: number, balance: number, deliveryDate: string | null): PaymentStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (total === 0) return "Not calculated";
  if (balance <= 0) return "Paid";
  if (deliveryDate && deliveryDate < today) return "Overdue";
  return "Due";
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export async function recomputeOrderTotals(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id,delivery_date")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) return;

  const [
    settings,
    { data: items, error: itemsError },
    { data: payments, error: paymentsError },
    adjustmentResult,
  ] = await Promise.all([
    getShopBillingSettings(supabase),
    supabase.from("order_items").select("amount").eq("order_id", orderId),
    supabase.from("payments").select("amount,voided").eq("order_id", orderId),
    supabase
      .from("order_financial_adjustments")
      .select("adjustment_type,amount,voided")
      .eq("order_id", orderId),
  ]);
  if (itemsError) throw itemsError;
  if (paymentsError) throw paymentsError;

  const itemsTotal = ((items as AmountRow[] | null) ?? []).reduce(
    (sum, item) => sum + Number(item.amount ?? 0),
    0
  );
  const adjustments =
    adjustmentResult.error &&
    `${adjustmentResult.error.message ?? ""}`.includes("order_financial_adjustments")
      ? []
      : ((adjustmentResult.data as AdjustmentAmountRow[] | null) ?? []);
  if (
    adjustmentResult.error &&
    !`${adjustmentResult.error.message ?? ""}`.includes("order_financial_adjustments")
  ) {
    throw adjustmentResult.error;
  }

  const billAdjustmentTotal = adjustments.reduce((sum, adjustment) => {
    if (adjustment.voided) return sum;
    if (adjustment.adjustment_type === "Discount") return sum - Number(adjustment.amount ?? 0);
    if (adjustment.adjustment_type === "Extra Charge") return sum + Number(adjustment.amount ?? 0);
    return sum;
  }, 0);
  const refundTotal = adjustments.reduce(
    (sum, adjustment) =>
      !adjustment.voided && adjustment.adjustment_type === "Refund"
        ? sum + Number(adjustment.amount ?? 0)
        : sum,
    0
  );
  const paid =
    ((payments as PaymentAmountRow[] | null) ?? []).reduce(
      (sum, payment) => (payment.voided ? sum : sum + Number(payment.amount ?? 0)),
      0
    ) - refundTotal;
  const taxableTotal = Math.max(itemsTotal + billAdjustmentTotal, 0);
  const total = roundMoney(orderTotalWithTax(taxableTotal, settings));
  const balance = roundMoney(total - paid);

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      total_amount: total,
      advance_paid: roundMoney(paid),
      balance,
      payment_status: paymentStatus(
        total,
        balance,
        (order as OrderForTotalsRow).delivery_date
      ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  if (updateError) throw updateError;
}

export async function recomputeAllOrderTotals(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.from("orders").select("id");
  if (error) throw error;
  for (const order of (data as { id: string }[] | null) ?? []) {
    await recomputeOrderTotals(supabase, order.id);
  }
}
