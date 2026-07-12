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
import {
  isMissingJobCardsSchemaError,
  syncJobCardsForOrder,
} from "@/lib/data/job-cards-db";
import {
  getPaymentsForOrder,
  recordPayment,
  voidPayment,
} from "@/lib/data/payments-db";
import {
  getOrderFinancialAdjustmentsForOrder,
  isMissingOrderFinancialAdjustmentsSchemaError,
  recordOrderFinancialAdjustment,
  voidOrderFinancialAdjustment,
} from "@/lib/data/order-financial-adjustments-db";
import { orderStatuses } from "@/lib/constants";
import { hasPermission, type Permission } from "@/lib/permissions";
import type {
  Order,
  OrderFinancialAdjustment,
  OrderFinancialAdjustmentType,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentMode,
} from "@/lib/types";

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

async function trySyncJobCardsForOrder(
  supabase: ReturnType<typeof createServerClient>,
  orderId: string
): Promise<void> {
  try {
    await syncJobCardsForOrder(supabase, orderId);
  } catch (error) {
    if (!isMissingJobCardsSchemaError(error)) throw error;
  }
}

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
  await trySyncJobCardsForOrder(supabase, order.id);
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
  await trySyncJobCardsForOrder(supabase, order.id);
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
  await trySyncJobCardsForOrder(supabase, order.id);
  return { success: true, data: order };
}

// ---------------------------------------------------------------------------
// Phase 7B: payment ledger actions (supabase/migrations/0008_payments.sql).
// requireServerPermission is checked here on top of record_payment()/
// void_payment() already checking it again internally — client-side
// hasPermission is UX-only and is never trusted as the security boundary,
// same rule as every other action in this file. Both mutations return the
// freshly re-fetched Order (advance_paid/balance/payment_status all change
// via the migration's trigger) alongside the updated Payment list, so the
// caller can refresh its whole payment UI from one round trip instead of a
// second fetch.
// ---------------------------------------------------------------------------

export async function getPaymentsForOrderAction(orderId: string): Promise<Payment[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.viewPayments");
  if (!guard.ok) return [];
  return getPaymentsForOrder(supabase, orderId);
}

export async function getFinancialAdjustmentsForOrderAction(
  orderId: string
): Promise<OrderFinancialAdjustment[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.viewPayments");
  if (!guard.ok) return [];
  try {
    return await getOrderFinancialAdjustmentsForOrder(supabase, orderId);
  } catch (error) {
    if (isMissingOrderFinancialAdjustmentsSchemaError(error)) return [];
    throw error;
  }
}

export async function recordPaymentAction(data: {
  orderId: string;
  amount: number;
  paymentDate: string;
  paymentMode: PaymentMode;
  notes?: string;
}): Promise<ActionResult<{ order: Order; payments: Payment[] }>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.recordPayment");
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    await recordPayment(supabase, data);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record payment.",
    };
  }

  const [order, payments] = await Promise.all([
    getOrderById(supabase, data.orderId),
    getPaymentsForOrder(supabase, data.orderId),
  ]);
  if (!order) return { success: false, error: "Order not found." };
  return { success: true, data: { order, payments } };
}

export async function voidPaymentAction(
  paymentId: string,
  orderId: string,
  reason: string
): Promise<ActionResult<{ order: Order; payments: Payment[] }>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.voidPayment");
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    await voidPayment(supabase, paymentId, reason);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to void payment.",
    };
  }

  const [order, payments] = await Promise.all([
    getOrderById(supabase, orderId),
    getPaymentsForOrder(supabase, orderId),
  ]);
  if (!order) return { success: false, error: "Order not found." };
  return { success: true, data: { order, payments } };
}

export async function recordFinancialAdjustmentAction(data: {
  orderId: string;
  adjustmentType: OrderFinancialAdjustmentType;
  amount: number;
  adjustmentDate: string;
  paymentMode?: PaymentMode;
  reason: string;
  notes?: string;
}): Promise<
  ActionResult<{
    order: Order;
    payments: Payment[];
    adjustments: OrderFinancialAdjustment[];
  }>
> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.recordPayment");
  if (!guard.ok) return { success: false, error: guard.error };

  const validationError = validateFinancialAdjustmentInput(data);
  if (validationError) return { success: false, error: validationError };

  try {
    await recordOrderFinancialAdjustment(supabase, data);
  } catch (err) {
    if (isMissingOrderFinancialAdjustmentsSchemaError(err)) {
      return {
        success: false,
        error: "Financial adjustments are not enabled in this database yet.",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record adjustment.",
    };
  }

  const [order, payments, adjustments] = await Promise.all([
    getOrderById(supabase, data.orderId),
    getPaymentsForOrder(supabase, data.orderId),
    getOrderFinancialAdjustmentsForOrder(supabase, data.orderId),
  ]);
  if (!order) return { success: false, error: "Order not found." };
  return { success: true, data: { order, payments, adjustments } };
}

export async function voidFinancialAdjustmentAction(
  adjustmentId: string,
  orderId: string,
  reason: string
): Promise<
  ActionResult<{
    order: Order;
    payments: Payment[];
    adjustments: OrderFinancialAdjustment[];
  }>
> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.voidPayment");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!reason.trim()) return { success: false, error: "A reason is required." };

  try {
    await voidOrderFinancialAdjustment(supabase, adjustmentId, reason.trim());
  } catch (err) {
    if (isMissingOrderFinancialAdjustmentsSchemaError(err)) {
      return {
        success: false,
        error: "Financial adjustments are not enabled in this database yet.",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to void adjustment.",
    };
  }

  const [order, payments, adjustments] = await Promise.all([
    getOrderById(supabase, orderId),
    getPaymentsForOrder(supabase, orderId),
    getOrderFinancialAdjustmentsForOrder(supabase, orderId),
  ]);
  if (!order) return { success: false, error: "Order not found." };
  return { success: true, data: { order, payments, adjustments } };
}

function validateFinancialAdjustmentInput(data: {
  adjustmentType: OrderFinancialAdjustmentType;
  amount: number;
  adjustmentDate: string;
  paymentMode?: PaymentMode;
  reason: string;
}): string | null {
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!["Discount", "Extra Charge", "Refund"].includes(data.adjustmentType)) {
    return "Invalid adjustment type.";
  }
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    return "Amount must be greater than zero.";
  }
  if (!data.adjustmentDate || data.adjustmentDate > todayIso) {
    return "Adjustment date cannot be in the future.";
  }
  if (!data.reason.trim()) return "Reason is required.";
  if (data.adjustmentType === "Refund" && !data.paymentMode) {
    return "Refund payment mode is required.";
  }
  return null;
}
