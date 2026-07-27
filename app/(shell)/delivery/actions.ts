"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { profileDataFunction, withPerformanceContext } from "@/lib/performance/query-profiler";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import { getCustomers } from "@/lib/data/customers-db";
import { getAllOrders, getOrderById, updateOrderStatus } from "@/lib/data/orders-db";
import {
  isMissingJobCardsSchemaError,
  syncJobCardsForOrder,
} from "@/lib/data/job-cards-db";
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

  try {
    await syncJobCardsForOrder(supabase, order.id);
  } catch (error) {
    if (!isMissingJobCardsSchemaError(error)) throw error;
  }

  return { success: true, data: order };
}
