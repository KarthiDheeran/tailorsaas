import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveSharedDesktopOperator } from "@/lib/shared-desktop-operator";

export async function recordOrderOperatorAttribution(
  supabase: SupabaseClient,
  orderId: string,
  creator?: Pick<ActiveSharedDesktopOperator, "id" | "name">,
  measurementTaker?: Pick<ActiveSharedDesktopOperator, "id" | "name">,
): Promise<void> {
  if (!creator && !measurementTaker) return;
  const attribution: Record<string, string> = {};
  if (creator) {
    attribution.created_by_operator_id = creator.id;
    attribution.created_by_operator_name = creator.name;
  }
  if (measurementTaker) {
    attribution.measurement_taken_by_operator_id = measurementTaker.id;
    attribution.measurement_taken_by_operator_name = measurementTaker.name;
  }
  const { error } = await supabase
    .from("orders")
    .update(attribution)
    .eq("id", orderId);
  if (error) throw new Error("Order was created, but operator attribution could not be saved.");

  // An advance recorded as part of order creation belongs to the same active
  // operator. There can only be one initial Advance payment for this flow.
  if (!creator) return;
  const { error: paymentError } = await supabase
    .from("payments")
    .update({ received_by_operator_id: creator.id, received_by_operator_name: creator.name })
    .eq("order_id", orderId)
    .eq("payment_type", "Advance")
    .eq("voided", false);
  if (paymentError) throw new Error("Order was created, but advance collector attribution could not be saved.");
}

export async function recordPaymentOperatorAttribution(
  supabase: SupabaseClient,
  paymentId: string,
  operator?: ActiveSharedDesktopOperator,
): Promise<void> {
  if (!operator) return;
  const { error } = await supabase
    .from("payments")
    .update({ received_by_operator_id: operator.id, received_by_operator_name: operator.name })
    .eq("id", paymentId);
  if (error) throw new Error("Payment was recorded, but collector attribution could not be saved.");
}

export async function recordDeliveryOperatorAttribution(
  supabase: SupabaseClient,
  orderId: string,
  operator?: ActiveSharedDesktopOperator,
): Promise<void> {
  if (!operator) return;
  const { error } = await supabase
    .from("orders")
    .update({
      delivered_by_operator_id: operator.id,
      delivered_by_operator_name: operator.name,
      delivered_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  if (error) throw new Error("Order was delivered, but delivery operator attribution could not be saved.");
}
