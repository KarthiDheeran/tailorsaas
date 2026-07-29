"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileDataFunction, withPerformanceContext } from "@/lib/performance/query-profiler";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import { getCustomerById, getCustomers } from "@/lib/data/customers-db";
import {
  findOrderByOrderNumber,
  findOrderByScanToken,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
} from "@/lib/data/orders-db";
import type { PaymentMode } from "@/lib/types";
import {
  isMissingJobCardsSchemaError,
  syncJobCardsForOrder,
} from "@/lib/data/job-cards-db";
import {
  recordDeliveryOperatorAttribution,
  recordPaymentOperatorAttribution,
} from "@/lib/data/operator-attribution-db";
import { getPaymentsForOrder } from "@/lib/data/payments-db";
import { requireActiveSharedDesktopOperator } from "@/lib/shared-desktop-operator";
import type { Customer, Order } from "@/lib/types";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface DeliveryDeskOrder {
  order: Order;
  customer?: Customer;
}

function isDeliveryDeskOrder(order: Order, todayIso: string): boolean {
  if (order.status === "Cancelled" || order.status === "Delivered") return false;
  if (order.status === "Ready") return true;
  return order.deliveryDate <= todayIso;
}

function sortDeliveryDeskOrders(a: Order, b: Order): number {
  if (a.status === "Ready" && b.status !== "Ready") return -1;
  if (a.status !== "Ready" && b.status === "Ready") return 1;
  if (a.deliveryDate !== b.deliveryDate) {
    return a.deliveryDate.localeCompare(b.deliveryDate);
  }
  return a.orderNumber.localeCompare(b.orderNumber);
}

export async function getDeliveryDeskOrdersAction(
  todayIso: string
): Promise<DeliveryDeskOrder[]> {
  return withPerformanceContext("getDeliveryDeskOrdersAction", async () => {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return [];

  const [orders, customers] = await Promise.all([
    profileDataFunction({ functionName: "getAllOrders", tableOrRpc: "orders,order_items" }, () => getAllOrders(supabase)),
    profileDataFunction({ functionName: "getCustomers", tableOrRpc: "customers" }, () => getCustomers(supabase)),
  ]);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  return orders
    .filter((order) => isDeliveryDeskOrder(order, todayIso))
    .sort(sortDeliveryDeskOrders)
    .map((order) => ({
      order,
      customer: customerById.get(order.customerId),
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
  if (existing.balance > 0) {
    return {
      success: false,
      error: "Collect the pending balance before marking this order delivered.",
    };
  }

  const order = await updateOrderStatus(supabase, orderId, "Delivered");
  if (!order) return { success: false, error: "Order not found." };
  await recordDeliveryOperatorAttribution(createAdminClient(), order.id, operatorGuard.operator);

  try {
    await syncJobCardsForOrder(supabase, order.id);
  } catch (error) {
    if (!isMissingJobCardsSchemaError(error)) throw error;
  }

  return { success: true, data: order };
}

export async function getQuickDeliveryOrderAction(
  rawCode: string
): Promise<ActionResult<DeliveryDeskOrder>> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { success: false, error: "Scan an order receipt barcode." };
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
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
  notes?: string;
}): Promise<ActionResult<Order>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };
  const operatorGuard = await requireActiveSharedDesktopOperator();
  if (!operatorGuard.ok) return { success: false, error: operatorGuard.error };
  if (!data.orderId) return { success: false, error: "Order is required." };
  if (!Number.isFinite(data.amount) || data.amount < 0) return { success: false, error: "Enter a valid collected amount." };

  const { error } = await supabase.rpc("quick_collect_and_deliver", {
    p_order_id: data.orderId,
    p_amount: data.amount,
    p_payment_mode: data.paymentMode,
    p_notes: data.notes?.trim() || null,
  });
  if (error) return { success: false, error: error.message || "Could not complete delivery." };
  const admin = createAdminClient();
  await recordDeliveryOperatorAttribution(admin, data.orderId, operatorGuard.operator);
  if (data.amount > 0) {
    const payments = await getPaymentsForOrder(admin, data.orderId);
    const latestPayment = payments.find((payment) => !payment.voided);
    if (latestPayment) await recordPaymentOperatorAttribution(admin, latestPayment.id, operatorGuard.operator);
  }
  const order = await getOrderById(supabase, data.orderId);
  return order ? { success: true, data: order } : { success: false, error: "Order was not found." };
}
