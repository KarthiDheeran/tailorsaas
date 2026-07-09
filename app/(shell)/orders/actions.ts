"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  getServerCallerPermissions,
  requireServerPermission,
} from "@/lib/auth/require-server-permission";
import {
  createOrder,
  getAllOrders,
  getOrderById,
  getOrdersForCustomer,
  peekNextOrderNumber,
  updateOrder,
  updateOrderStatus,
} from "@/lib/data/orders-db";
import { orderStatuses } from "@/lib/constants";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { Order, OrderItem, OrderStatus, PaymentMode } from "@/lib/types";

// Mirrors components/orders/orders-table.tsx's getAvailableOrderStatuses
// exactly (kept as a small, deliberate duplication rather than importing a
// function from a "use client" file into a Server Action, which would pull
// that whole client module — React, icons, etc. — into the server bundle).
// Both must be kept in sync if the status/permission rules ever change.
function availableOrderStatusesFor(permissions: Permission[]): OrderStatus[] {
  let base: OrderStatus[];
  if (hasPermission(permissions, "orders.edit")) {
    base = [...orderStatuses];
  } else if (hasPermission(permissions, "orders.changeStatus")) {
    base = ["In Progress", "Ready"];
  } else {
    base = [];
  }
  if (!hasPermission(permissions, "orders.cancel")) {
    base = base.filter((s) => s !== "Cancelled");
  }
  return base;
}

// ---------------------------------------------------------------------------
// Phase 6C: Orders + Order Items are now real, Supabase-backed tables
// (supabase/migrations/0006_orders.sql). Reads AND writes both go through
// lib/data/orders-db.ts — same read-relocation reasoning established in
// Phase 5A, now paying off against a real database instead of a shared
// in-memory array. Create/update go through the create_order_with_items /
// update_order_with_items RPCs (transactional — see that file), not
// separate insert/delete/insert calls from here.
//
// lib/data/stub-data.ts's mock `orders` array is untouched — Reports/
// Dashboard (and lib/customers.ts, the Reports-only selector fork) still
// read it directly and aren't migrating this phase. `orderStatuses` (fixed
// vocabulary, not data) stays imported from there.
// ---------------------------------------------------------------------------

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getOrdersAction(): Promise<Order[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return [];
  return getAllOrders(supabase);
}

export async function getOrderByIdAction(id: string): Promise<Order | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return undefined;
  return getOrderById(supabase, id);
}

export async function getOrdersForCustomerAction(customerId: string): Promise<Order[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return [];
  return getOrdersForCustomer(supabase, customerId);
}

// Non-mutating preview of the next order number for New Order's header — the
// real number is (re)computed by createOrderAction itself at save time, same
// as before this phase.
export async function generateNextOrderNumberAction(): Promise<string> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.create");
  if (!guard.ok) return "";
  return peekNextOrderNumber(supabase);
}

export async function createOrderAction(data: {
  customerId: string;
  orderDate: string;
  trialDate: string;
  deliveryDate: string;
  items: OrderItem[];
  advancePaid: number;
  paymentMode: PaymentMode;
  status?: OrderStatus;
}): Promise<ActionResult<Order>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.create");
  if (!guard.ok) return { success: false, error: guard.error };
  if (data.items.length === 0) {
    return { success: false, error: "At least one item is required." };
  }
  const order = await createOrder(supabase, data);
  return { success: true, data: order };
}

export async function updateOrderAction(
  id: string,
  data: {
    orderDate: string;
    deliveryDate: string;
    items: OrderItem[];
    status: OrderStatus;
  }
): Promise<ActionResult<Order>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };
  if (data.items.length === 0) {
    return { success: false, error: "At least one item is required." };
  }
  const order = await updateOrder(supabase, id, data);
  if (!order) return { success: false, error: "Order not found." };
  return { success: true, data: order };
}

export async function updateOrderStatusAction(
  id: string,
  status: OrderStatus
): Promise<ActionResult<Order>> {
  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (!permissions) {
    return { success: false, error: "Not signed in or account inactive." };
  }
  if (!availableOrderStatusesFor(permissions).includes(status)) {
    return { success: false, error: "You don't have permission to set this status." };
  }
  const order = await updateOrderStatus(supabase, id, status);
  if (!order) return { success: false, error: "Order not found." };
  return { success: true, data: order };
}
