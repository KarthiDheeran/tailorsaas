"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileDataFunction, withPerformanceContext } from "@/lib/performance/query-profiler";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import { getCustomerById } from "@/lib/data/customers-db";
import {
  findOrderByOrderNumber,
  findOrderByScanToken,
  getDeliveryDeskOrderRows,
  getOrderById,
} from "@/lib/data/orders-db";
import type { PaymentMode } from "@/lib/types";
import {
  isMissingJobCardsSchemaError,
  reconcileJobCardsForOrderStatus,
  syncJobCardsForOrder,
} from "@/lib/data/job-cards-db";
import {
  recordDeliveryOperatorAttribution,
  recordPaymentOperatorAttribution,
} from "@/lib/data/operator-attribution-db";
import { getPaymentsForOrder } from "@/lib/data/payments-db";
import { getStaffById, getStaffOptions, type StaffOption } from "@/lib/data/staff-db";
import { requireActiveSharedDesktopOperator } from "@/lib/shared-desktop-operator";
import type { Customer, Order } from "@/lib/types";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface DeliveryDeskOrder {
  order: Order;
  customer?: Customer;
}

function sortDeliveryDeskOrders(a: Order, b: Order): number {
  if (a.status === "Ready" && b.status !== "Ready") return -1;
  if (a.status !== "Ready" && b.status === "Ready") return 1;
  if (a.deliveryDate !== b.deliveryDate) {
    return a.deliveryDate.localeCompare(b.deliveryDate);
  }
  return a.orderNumber.localeCompare(b.orderNumber);
}

export async function getDeliveryDeskOrdersAction(): Promise<DeliveryDeskOrder[]> {
  return withPerformanceContext("getDeliveryDeskOrdersAction", async () => {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "delivery.view");
  if (!guard.ok) return [];

  const orders = await profileDataFunction(
    { functionName: "getDeliveryDeskOrderRows", tableOrRpc: "orders,order_items" },
    () => getDeliveryDeskOrderRows(supabase)
  );

  return orders
    .sort(sortDeliveryDeskOrders)
    .map((order) => ({
      order,
    }));
  });
}

export async function markOrderDeliveredAction(
  orderId: string
): Promise<ActionResult<Order>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };
  const operatorGuard = await requireActiveSharedDesktopOperator();
  if (!operatorGuard.ok) return { success: false, error: operatorGuard.error };

  const existing = await getOrderById(supabase, orderId);
  if (!existing) return { success: false, error: "Order not found." };
  if (existing.status !== "Ready") {
    return {
      success: false,
      error: "Only Ready orders can be marked delivered from Delivery Desk.",
    };
  }
  const { error } = await supabase.rpc("quick_collect_and_deliver", {
    p_order_id: orderId,
    p_amount: 0,
    p_payment_mode: "Cash",
    p_notes: null,
  });
  if (error) return { success: false, error: error.message || "Could not complete delivery." };
  const order = await getOrderById(supabase, orderId);
  if (!order) return { success: false, error: "Order not found." };
  await recordDeliveryOperatorAttribution(createAdminClient(), order.id, operatorGuard.operator);

  try {
    await syncJobCardsForOrder(supabase, order.id);
  } catch (error) {
    if (!isMissingJobCardsSchemaError(error)) throw error;
  }

  return { success: true, data: order };
}

export async function getDeliveryCollectorsAction(): Promise<StaffOption[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "delivery.view");
  if (!guard.ok) return [];
  return (await getStaffOptions(supabase, { activeOnly: true })).filter((member) => member.canCollectPayments);
}

export async function deliverOrderItemsAction(data: {
  orderId: string;
  items: Array<{ orderItemId: string; quantity: number }>;
  amount: number;
  paymentMode: PaymentMode;
  collectorStaffId?: string;
  notes?: string;
}): Promise<ActionResult<Order>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };
  const operatorGuard = await requireActiveSharedDesktopOperator();
  if (!operatorGuard.ok) return { success: false, error: operatorGuard.error };
  if (!data.orderId) return { success: false, error: "Order is required." };
  if (!data.items.some((item) => Number.isFinite(item.quantity) && item.quantity > 0)) {
    return { success: false, error: "Enter at least one item quantity to deliver." };
  }
  if (!Number.isFinite(data.amount) || data.amount < 0) {
    return { success: false, error: "Enter a valid collected amount." };
  }
  const collector = data.amount > 0 ? await getStaffById(supabase, data.collectorStaffId?.trim() ?? "") : undefined;
  if (data.amount > 0 && (!collector || collector.status !== "Active" || !collector.canCollectPayments)) {
    return { success: false, error: "Select the active staff member who collected the amount." };
  }
  const existing = await getOrderById(supabase, data.orderId);
  if (!existing) return { success: false, error: "Order was not found." };
  if (existing.status !== "Ready") {
    return { success: false, error: "Only Ready orders can be delivered." };
  }
  const deliveryByItemId = new Map(
    data.items
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0)
      .map((item) => [item.orderItemId, item.quantity])
  );
  for (const [orderItemId, quantity] of Array.from(deliveryByItemId.entries())) {
    const item = existing.items.find((existingItem) => existingItem.id === orderItemId);
    if (!item) return { success: false, error: "Order item was not found." };
    const pendingQty = item.qty - (item.deliveredQty ?? 0);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > pendingQty) {
      return { success: false, error: `Enter a valid delivery quantity for ${item.particular}.` };
    }
  }
  const correctedDeliveredQty = existing.items.map((item) => {
    const requested = deliveryByItemId.get(item.id ?? "") ?? 0;
    return {
      id: item.id,
      deliveredQty: Math.min(item.qty, (item.deliveredQty ?? 0) + requested),
    };
  });
  const willCompleteOrder = correctedDeliveredQty.every((item) => {
    const orderItem = existing.items.find((existingItem) => existingItem.id === item.id);
    return orderItem ? item.deliveredQty >= orderItem.qty : true;
  });

  const { error } = await supabase.rpc("deliver_order_items", {
    p_order_id: data.orderId,
    p_items: Array.from(deliveryByItemId.entries()).map(([orderItemId, quantity]) => ({
      orderItemId,
      quantity,
    })),
    p_amount: data.amount,
    p_payment_mode: data.paymentMode,
    p_notes: data.notes?.trim() || null,
  });
  if (error) return { success: false, error: error.message || "Could not complete delivery." };

  const admin = createAdminClient();
  if (!willCompleteOrder) {
    const repairResults = await Promise.all(
      correctedDeliveredQty
        .filter((item): item is { id: string; deliveredQty: number } => Boolean(item.id))
        .map((item) =>
          admin
            .from("order_items")
            .update({ delivered_qty: item.deliveredQty })
            .eq("id", item.id)
            .eq("order_id", data.orderId)
        )
    );
    const repairError = repairResults.find((result) => result.error)?.error;
    if (repairError) {
      return { success: false, error: repairError.message || "Could not save partial delivery quantities." };
    }
    const { error: orderRepairError } = await admin
      .from("orders")
      .update({ status: "Ready", updated_at: new Date().toISOString() })
      .eq("id", data.orderId);
    if (orderRepairError) {
      return { success: false, error: orderRepairError.message || "Could not keep order ready for pending delivery." };
    }
    const { error: jobCardRepairError } = await admin
      .from("job_cards")
      .update({
        current_stage: "Ready",
        order_status: "Ready",
        completed_date: null,
        assigned_staff_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", data.orderId)
      .eq("cancelled", false);
    if (jobCardRepairError && !isMissingJobCardsSchemaError(jobCardRepairError)) {
      return { success: false, error: jobCardRepairError.message || "Could not keep job cards ready for pending delivery." };
    }
  }
  const order = await getOrderById(supabase, data.orderId);
  if (!order) return { success: false, error: "Order was not found." };

  if (willCompleteOrder && order.status === "Delivered") {
    await recordDeliveryOperatorAttribution(admin, order.id, operatorGuard.operator);
    try {
      await reconcileJobCardsForOrderStatus(admin, order.id);
    } catch (syncError) {
      if (!isMissingJobCardsSchemaError(syncError)) throw syncError;
    }
  }
  if (data.amount > 0) {
    const payments = await getPaymentsForOrder(admin, data.orderId);
    const latestPayment = payments.find((payment) => !payment.voided);
    if (latestPayment) await recordPaymentOperatorAttribution(admin, latestPayment.id, collector);
  }

  return { success: true, data: order };
}

export async function getQuickDeliveryOrderAction(
  rawCode: string
): Promise<ActionResult<DeliveryDeskOrder>> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { success: false, error: "Scan an order receipt barcode." };
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "delivery.view");
  if (!guard.ok) return { success: false, error: guard.error };

  const isReceiptToken = code.startsWith("TS|ORD|");
  const lookup = isReceiptToken
    ? await findOrderByScanToken(supabase, code.slice("TS|ORD|".length))
    : await findOrderByOrderNumber(supabase, code);
  if (!lookup) return { success: false, error: "Order receipt was not found." };
  const order = await getOrderById(supabase, lookup.id);
  if (!order) return { success: false, error: "Order was not found." };
  if (order.status !== "Ready") {
    return { success: false, error: order.status === "Delivered" ? "This order is already delivered." : "This order is not ready for delivery." };
  }
  const customer = await getCustomerById(supabase, order.customerId);
  return { success: true, data: { order, customer } };
}

export async function quickCollectAndDeliverAction(data: {
  orderId: string;
  amount: number;
  paymentMode: PaymentMode;
  collectorStaffId?: string;
  notes?: string;
}): Promise<ActionResult<Order>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };
  const operatorGuard = await requireActiveSharedDesktopOperator();
  if (!operatorGuard.ok) return { success: false, error: operatorGuard.error };
  if (!data.orderId) return { success: false, error: "Order is required." };
  if (!Number.isFinite(data.amount) || data.amount < 0) return { success: false, error: "Enter a valid collected amount." };
  const collector = data.amount > 0 ? await getStaffById(supabase, data.collectorStaffId?.trim() ?? "") : undefined;
  if (data.amount > 0 && (!collector || collector.status !== "Active" || !collector.canCollectPayments)) {
    return { success: false, error: "Select the active staff member who collected the amount." };
  }

  const { error } = await supabase.rpc("quick_collect_and_deliver", {
    p_order_id: data.orderId,
    p_amount: data.amount,
    p_payment_mode: data.paymentMode,
    p_notes: data.notes?.trim() || null,
  });
  if (error) return { success: false, error: error.message || "Could not complete delivery." };
  const admin = createAdminClient();
  try {
    await reconcileJobCardsForOrderStatus(admin, data.orderId);
  } catch (syncError) {
    if (!isMissingJobCardsSchemaError(syncError)) throw syncError;
  }
  await recordDeliveryOperatorAttribution(admin, data.orderId, operatorGuard.operator);
  if (data.amount > 0) {
    const payments = await getPaymentsForOrder(admin, data.orderId);
    const latestPayment = payments.find((payment) => !payment.voided);
    if (latestPayment) await recordPaymentOperatorAttribution(admin, latestPayment.id, collector);
  }
  const order = await getOrderById(supabase, data.orderId);
  return order ? { success: true, data: order } : { success: false, error: "Order was not found." };
}
