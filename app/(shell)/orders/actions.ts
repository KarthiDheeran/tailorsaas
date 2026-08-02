"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { profileDataFunction, withPerformanceContext } from "@/lib/performance/query-profiler";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  getServerCallerContext,
  getServerCallerPermissions,
  requireServerPermission,
} from "@/lib/auth/require-server-permission";
import {
  createOrder,
  findOrderByOrderNumber,
  findOrderByScanToken,
  getAllOrders,
  getOrderById,
  getOrdersForCustomer,
  peekNextOrderNumber,
  updateOrder,
  updateOrderStatus,
} from "@/lib/data/orders-db";
import { recomputeOrderTotals } from "@/lib/data/order-totals-db";
import {
  recordDeliveryOperatorAttribution,
  recordOrderOperatorAttribution,
  recordPaymentOperatorAttribution,
} from "@/lib/data/operator-attribution-db";
import { requireActiveSharedDesktopOperator } from "@/lib/shared-desktop-operator";
import type { ActiveSharedDesktopOperator } from "@/lib/shared-desktop-operator";
import { getGarmentTypeConfigurations } from "@/lib/data/catalog-fields-db";
import {
  buildFieldSchemaSnapshot,
  resolveRuntimeGarmentFields,
  shouldPrintMeasurementsOnJobCard,
  validateGarmentFieldValues,
} from "@/lib/garment-form-runtime";
import {
  createCustomer,
  deleteCustomer,
  getCustomerByNameAndPhone,
  getCustomers,
  getGarmentMeasurementDraftSeed,
} from "@/lib/data/customers-db";
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
import {
  createOrderAttachment,
  deleteOrderAttachment,
  getOrderAttachmentById,
  getOrderAttachments,
  ORDER_ATTACHMENTS_BUCKET,
  updateOrderAttachment,
} from "@/lib/data/order-attachments-db";
import { orderStatuses } from "@/lib/constants";
import { hasPermission, type Permission } from "@/lib/permissions";
import { isGarmentSection, type GarmentSection } from "@/lib/catalog";
import type {
  Customer,
  Gender,
  Order,
  OrderAttachment,
  OrderAttachmentType,
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

async function resolveMeasurementTaker(
  staffId?: string,
): Promise<{ operator?: Pick<ActiveSharedDesktopOperator, "id" | "name">; error?: string }> {
  if (!staffId) return {};
  const { data, error } = await createAdminClient()
    .from("staff")
    .select("id,name,status")
    .eq("id", staffId)
    .maybeSingle();
  if (error || !data || data.status !== "Active") {
    return { error: "Choose an active staff member for measurements." };
  }
  return { operator: { id: data.id, name: data.name } };
}

const ORDER_ATTACHMENT_TYPES: OrderAttachmentType[] = [
  "Design Reference",
  "Fabric Photo",
  "Sample Photo",
  "Trial Photo",
  "Alteration Photo",
  "Final Garment Photo",
  "Other",
];

const ALLOWED_ORDER_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const MAX_ORDER_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function sanitizeStorageSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function withOrderAttachmentSignedUrls(
  attachments: OrderAttachment[]
): Promise<OrderAttachment[]> {
  if (attachments.length === 0) return attachments;
  const admin = createAdminClient();
  return Promise.all(
    attachments.map(async (attachment) => {
      const { data } = await admin.storage
        .from(ORDER_ATTACHMENTS_BUCKET)
        .createSignedUrl(attachment.storagePath, 60 * 60);
      return { ...attachment, signedUrl: data?.signedUrl };
    })
  );
}

export interface OrdersPageData {
  orders: Order[];
  customers: Customer[];
}

export type TodayItemSummaryRow = { garment: string; qty: number };

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

function isUniqueConstraintError(error: unknown): boolean {
  return (error as { code?: string }).code === "23505";
}

export async function getOrdersAction(): Promise<Order[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return [];
  return withPerformanceContext("getOrdersAction", () => profileDataFunction({ functionName: "getAllOrders", tableOrRpc: "orders,order_items" }, () => getAllOrders(supabase)));
}

export async function getTodayItemSummaryAction(todayIso: string): Promise<TodayItemSummaryRow[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return [];
  const { data, error } = await supabase
    .from("orders")
    .select("order_items!order_items_order_id_fkey(particular, qty)")
    .eq("order_date", todayIso)
    .neq("status", "Cancelled");
  if (error) throw error;
  const byGarment = new Map<string, number>();
  for (const order of (data ?? []) as { order_items?: { particular: string; qty: number }[] }[]) {
    for (const item of order.order_items ?? []) {
      const garment = item.particular.trim() || "Item";
      byGarment.set(garment, (byGarment.get(garment) ?? 0) + Number(item.qty || 0));
    }
  }
  return Array.from(byGarment.entries())
    .map(([garment, qty]) => ({ garment, qty }))
    .sort((a, b) => b.qty - a.qty || a.garment.localeCompare(b.garment));
}

export async function getOrdersPageDataAction(): Promise<OrdersPageData> {
  return withPerformanceContext("getOrdersPageDataAction", async () => {
  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (!permissions || !hasPermission(permissions, "orders.view")) {
    return { orders: [], customers: [] };
  }

  const [orders, customers] = await Promise.all([
    profileDataFunction({ functionName: "getAllOrders", tableOrRpc: "orders,order_items" }, () => getAllOrders(supabase)),
    hasPermission(permissions, "customers.view")
      ? profileDataFunction({ functionName: "getCustomers", tableOrRpc: "customers" }, () => getCustomers(supabase))
      : Promise.resolve([]),
  ]);
  return { orders, customers };
  });
}

export async function getOrderByIdAction(id: string): Promise<Order | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return undefined;
  return getOrderById(supabase, id);
}

function parseOrderScanCode(rawCode: string):
  | { kind: "scan-token"; value: string }
  | { kind: "order-number"; value: string }
  | undefined {
  const code = rawCode.trim().toUpperCase();
  if (!code) return undefined;
  const tokenPrefix = "TS|ORD|";
  if (code.startsWith(tokenPrefix)) {
    const token = code.slice(tokenPrefix.length).trim();
    return token ? { kind: "scan-token", value: token } : undefined;
  }
  if (/^(?:ORD-\d{4}-\d{3,}|[MCB]-\d+|\d+)$/.test(code)) {
    return { kind: "order-number", value: code };
  }
  return undefined;
}

export async function resolveOrderScanAction(
  code: string
): Promise<ActionResult<{ orderId: string; orderNumber: string }>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return { success: false, error: guard.error };

  const parsed = parseOrderScanCode(code);
  if (!parsed) return { success: false, error: "Order not found" };

  const order =
    parsed.kind === "scan-token"
      ? await findOrderByScanToken(supabase, parsed.value)
      : await findOrderByOrderNumber(supabase, parsed.value);

  if (!order) return { success: false, error: "Order not found" };
  return { success: true, data: { orderId: order.id, orderNumber: order.orderNumber } };
}

export async function getOrdersForCustomerAction(customerId: string): Promise<Order[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return [];
  return withPerformanceContext("getOrdersForCustomerAction", () => profileDataFunction({ functionName: "getOrdersForCustomer", tableOrRpc: "orders,order_items" }, () => getOrdersForCustomer(supabase, customerId)));
}

export interface HistoricalMeasurementSnapshot {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  itemId?: string;
  serialNo: number;
  garmentName: string;
  measurements: Record<string, unknown>;
  addOnIds: string[];
}

export interface MeasurementPickerData {
  seed: { values: Record<string, unknown>; fitNotes: string; notes: string };
  history: HistoricalMeasurementSnapshot[];
}

// Combines the two New Order measurement-picker requests into one server
// action. Permission checks retain the prior independent behaviour: a user
// may receive whichever portion they are allowed to view.
export async function getMeasurementPickerDataAction(
  customerId: string,
  garmentTypeId: string,
  garmentTypeName: string,
  excludeOrderId?: string
): Promise<MeasurementPickerData> {
  return withPerformanceContext("getMeasurementPickerDataAction", async () => {
  const supabase = createServerClient();
  const [ordersGuard, measurementsGuard] = await Promise.all([
    requireServerPermission(supabase, "orders.view"),
    requireServerPermission(supabase, "customers.viewMeasurements"),
  ]);

  const [seed, orders] = await Promise.all([
    measurementsGuard.ok
      ? getGarmentMeasurementDraftSeed(supabase, customerId, garmentTypeName)
      : Promise.resolve({ values: {}, fitNotes: "", notes: "" }),
    ordersGuard.ok ? profileDataFunction({ functionName: "getOrdersForCustomer", tableOrRpc: "orders,order_items" }, () => getOrdersForCustomer(supabase, customerId)) : Promise.resolve([]),
  ]);

  const history = orders
    .filter((order) => order.id !== excludeOrderId && order.status !== "Cancelled")
    .flatMap((order) =>
      order.items
        .filter(
          (item) =>
            item.garmentTypeId === garmentTypeId &&
            item.measurements &&
            Object.values(item.measurements).some((value) =>
              typeof value === "string" ? value.trim() !== "" : value !== null
            )
        )
        .map((item) => ({
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          itemId: item.id,
          serialNo: item.serialNo,
          garmentName: item.particular,
          measurements: item.measurements ?? {},
          addOnIds: (item.addOns ?? []).map((addOn) => addOn.key),
        }))
    )
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
    .slice(0, 5);

  return { seed, history };
  });
}

export async function getRecentMeasurementSnapshotsForCustomerGarmentAction(
  customerId: string,
  garmentTypeId: string,
  excludeOrderId?: string
): Promise<HistoricalMeasurementSnapshot[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return [];

  const orders = await getOrdersForCustomer(supabase, customerId);
  return orders
    .filter((order) => order.id !== excludeOrderId && order.status !== "Cancelled")
    .flatMap((order) =>
      order.items
        .filter(
          (item) =>
            item.garmentTypeId === garmentTypeId &&
            item.measurements &&
          Object.values(item.measurements).some((value) =>
            typeof value === "string" ? value.trim() !== "" : value !== null
          )
        )
        .map((item) => ({
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          itemId: item.id,
          serialNo: item.serialNo,
          garmentName: item.particular,
          measurements: item.measurements ?? {},
          addOnIds: (item.addOns ?? []).map((addOn) => addOn.key),
        }))
    )
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
    .slice(0, 5);
}

// Non-mutating preview of the next order number for New Order's header — the
// real number is (re)computed by createOrderAction itself at save time, same
// as before this phase.
export async function generateNextOrderNumberAction(
  orderSection: GarmentSection | ""
): Promise<string> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.create");
  if (!guard.ok || !isGarmentSection(orderSection)) return "";
  const caller = await getServerCallerContext(supabase);
  if (!caller?.allowedOrderSections.includes(orderSection)) return "";
  return peekNextOrderNumber(supabase, orderSection);
}

function validateOrderDates(data: {
  orderDate: string;
  trialDate: string;
  deliveryDate: string;
}): string | null {
  const isIsoDateValue = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || month < 1 || month > 12 || day < 1) return false;
    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  };
  if (!data.orderDate) return "Order date is required.";
  if (!data.deliveryDate) return "Delivery date is required.";
  if (!isIsoDateValue(data.orderDate)) return "Order date is invalid.";
  if (!isIsoDateValue(data.deliveryDate)) return "Delivery date is invalid.";
  if (data.trialDate && !isIsoDateValue(data.trialDate)) {
    return "Trial date is invalid.";
  }
  if (data.deliveryDate < data.orderDate) {
    return "Delivery date cannot be before order date.";
  }
  if (data.trialDate && data.trialDate < data.orderDate) {
    return "Trial date cannot be before order date.";
  }
  if (data.trialDate && data.trialDate > data.deliveryDate) {
    return "Trial date cannot be after delivery date.";
  }
  return null;
}

async function requireAllowedOrderSection(
  supabase: ReturnType<typeof createServerClient>,
  section: GarmentSection
): Promise<string | null> {
  const caller = await getServerCallerContext(supabase);
  if (!caller) return "Not signed in or account inactive.";
  if (!caller.allowedOrderSections.includes(section)) {
    return "You do not have access to this order section.";
  }
  if (!caller.shopId) {
    return "Your account is not assigned to a shop.";
  }
  return null;
}

async function validateAndSnapshotOrderItems(
  supabase: ReturnType<typeof createServerClient>,
  items: OrderItem[],
  existingItems: OrderItem[] = [],
  expectedSection?: GarmentSection
): Promise<{ items: OrderItem[]; error?: string }> {
  const configurations = await getGarmentTypeConfigurations(
    supabase,
    items.map((item) => item.garmentTypeId ?? "")
  );
  const configurationById = new Map(configurations.map((configuration) => [configuration.garment.id, configuration]));
  const existingById = new Map(existingItems.filter((item) => item.id).map((item) => [item.id!, item]));

  const validatedItems: OrderItem[] = [];
  for (const item of items) {
    const configuration = item.garmentTypeId ? configurationById.get(item.garmentTypeId) : undefined;
    if (expectedSection && configuration && configuration.garment.section !== expectedSection) {
      return {
        items: [],
        error: `Item ${item.serialNo}: ${configuration.garment.name} is not available in ${expectedSection}.`,
      };
    }
    const fields = configuration ? resolveRuntimeGarmentFields(configuration.fields, []) : null;
    if (!fields || fields.length === 0) {
      validatedItems.push({
        ...item,
        fieldSchemaSnapshot: item.fieldSchemaSnapshot ?? (item.id ? existingById.get(item.id)?.fieldSchemaSnapshot : undefined),
      });
      continue;
    }

    const existingMeasurements = item.id ? existingById.get(item.id)?.measurements ?? {} : {};
    const allowedLegacyCodes = new Set(Object.keys(existingMeasurements));
    const validation = validateGarmentFieldValues(fields, item.measurements ?? {}, allowedLegacyCodes);
    if (validation.error) return { items: [], error: `Item ${item.serialNo}: ${validation.error}` };

    validatedItems.push({
      ...item,
      fieldSchemaSnapshot: buildFieldSchemaSnapshot(
        fields,
        item.measurements ?? {},
        shouldPrintMeasurementsOnJobCard(item.fieldSchemaSnapshot)
      ),
    });
  }
  return { items: validatedItems };
}

export async function createOrderAction(data: {
  customerId: string;
  orderSection: GarmentSection;
  orderDate: string;
  trialDate: string;
  deliveryDate: string;
  deliveryPromiseNote?: string;
  items: OrderItem[];
  advancePaid: number;
  paymentMode: PaymentMode;
  measurementTakenByOperatorId?: string;
  createdByOperatorId?: string;
}): Promise<ActionResult<Order>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.create");
  if (!guard.ok) return { success: false, error: guard.error };
  const operatorGuard = await requireActiveSharedDesktopOperator();
  if (!operatorGuard.ok) return { success: false, error: operatorGuard.error };
  const measurementTaker = await resolveMeasurementTaker(data.measurementTakenByOperatorId);
  if (measurementTaker.error) return { success: false, error: measurementTaker.error };
  const selectedCreator = await resolveMeasurementTaker(data.createdByOperatorId);
  if (selectedCreator.error) return { success: false, error: selectedCreator.error };
  if (!isGarmentSection(data.orderSection)) {
    return { success: false, error: "Select a valid order section." };
  }
  const scopeError = await requireAllowedOrderSection(supabase, data.orderSection);
  if (scopeError) return { success: false, error: scopeError };
  if (data.items.length === 0) {
    return { success: false, error: "At least one item is required." };
  }
  const dateError = validateOrderDates(data);
  if (dateError) return { success: false, error: dateError };
  const prepared = await validateAndSnapshotOrderItems(supabase, data.items, [], data.orderSection);
  if (prepared.error) return { success: false, error: prepared.error };
  const order = await createOrder(supabase, { ...data, items: prepared.items, status: "In Progress" });
  await recordOrderOperatorAttribution(
    createAdminClient(),
    order.id,
    selectedCreator.operator ?? operatorGuard.operator,
    measurementTaker.operator ?? operatorGuard.operator,
    { hasAdvancePayment: data.advancePaid > 0 },
  );
  await recomputeOrderTotals(createAdminClient(), order.id);
  await trySyncJobCardsForOrder(supabase, order.id);
  return { success: true, data: (await getOrderById(createAdminClient(), order.id)) ?? order };
}

export async function createOrderForNewCustomerAction(data: {
  customer: {
    name: string;
    phone: string;
    address: string;
    area: string;
    gender?: Gender;
  };
  order: {
    orderSection: GarmentSection;
    orderDate: string;
    trialDate: string;
    deliveryDate: string;
    deliveryPromiseNote?: string;
    items: OrderItem[];
    advancePaid: number;
    paymentMode: PaymentMode;
    measurementTakenByOperatorId?: string;
    createdByOperatorId?: string;
  };
}): Promise<ActionResult<Order>> {
  const supabase = createServerClient();
  const orderGuard = await requireServerPermission(supabase, "orders.create");
  if (!orderGuard.ok) return { success: false, error: orderGuard.error };
  const operatorGuard = await requireActiveSharedDesktopOperator();
  if (!operatorGuard.ok) return { success: false, error: operatorGuard.error };
  const measurementTaker = await resolveMeasurementTaker(data.order.measurementTakenByOperatorId);
  if (measurementTaker.error) return { success: false, error: measurementTaker.error };
  const selectedCreator = await resolveMeasurementTaker(data.order.createdByOperatorId);
  if (selectedCreator.error) return { success: false, error: selectedCreator.error };
  if (!isGarmentSection(data.order.orderSection)) {
    return { success: false, error: "Select a valid order section." };
  }
  const scopeError = await requireAllowedOrderSection(supabase, data.order.orderSection);
  if (scopeError) return { success: false, error: scopeError };
  const customerGuard = await requireServerPermission(supabase, "customers.create");
  if (!customerGuard.ok) return { success: false, error: customerGuard.error };
  if (!data.customer.name.trim()) return { success: false, error: "Name is required." };
  if (!data.customer.phone.trim()) return { success: false, error: "Phone is required." };
  if (!/^\d{10}$/.test(data.customer.phone.trim())) {
    return { success: false, error: "Phone number must be exactly 10 digits." };
  }
  if (data.order.items.length === 0) {
    return { success: false, error: "At least one item is required." };
  }
  const dateError = validateOrderDates(data.order);
  if (dateError) return { success: false, error: dateError };

  const existing = await getCustomerByNameAndPhone(
    supabase,
    data.customer.name.trim(),
    data.customer.phone.trim()
  );
  if (existing) {
    return {
      success: false,
      error: "A customer with this name and phone number already exists.",
    };
  }

  let customer: Customer;
  try {
    customer = await createCustomer(supabase, {
      name: data.customer.name.trim(),
      phone: data.customer.phone.trim(),
      address: data.customer.address.trim(),
      area: data.customer.area.trim(),
      gender: data.customer.gender,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        success: false,
        error: "A customer with this name and phone number already exists.",
      };
    }
    throw error;
  }

  const prepared = await validateAndSnapshotOrderItems(supabase, data.order.items, [], data.order.orderSection);
  if (prepared.error) return { success: false, error: prepared.error };

  let order: Order;
  try {
    order = await createOrder(supabase, {
      ...data.order,
      items: prepared.items,
      customerId: customer.id,
      status: "In Progress",
    });
  } catch (error) {
    await deleteCustomer(createAdminClient(), customer.id);
    throw error;
  }
  await recordOrderOperatorAttribution(
    createAdminClient(),
    order.id,
    selectedCreator.operator ?? operatorGuard.operator,
    measurementTaker.operator ?? operatorGuard.operator,
    { hasAdvancePayment: data.order.advancePaid > 0 },
  );
  await trySyncJobCardsForOrder(supabase, order.id);
  await recomputeOrderTotals(createAdminClient(), order.id);
  return { success: true, data: (await getOrderById(createAdminClient(), order.id)) ?? order };
}

export async function updateOrderAction(
  id: string,
  data: {
    orderDate: string;
    trialDate: string;
    deliveryDate: string;
    deliveryPromiseNote?: string;
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
  const dateError = validateOrderDates(data);
  if (dateError) return { success: false, error: dateError };
  const existingOrder = await getOrderById(supabase, id);
  if (!existingOrder) return { success: false, error: "Order not found." };
  const prepared = await validateAndSnapshotOrderItems(
    supabase,
    data.items,
    existingOrder.items,
    existingOrder.orderSection
  );
  if (prepared.error) return { success: false, error: prepared.error };
  const order = await updateOrder(supabase, id, { ...data, items: prepared.items });
  if (!order) return { success: false, error: "Order not found." };
  await recomputeOrderTotals(createAdminClient(), order.id);
  await trySyncJobCardsForOrder(supabase, order.id);
  return { success: true, data: (await getOrderById(createAdminClient(), order.id)) ?? order };
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
  const operatorGuard = status === "Delivered"
    ? await requireActiveSharedDesktopOperator()
    : { ok: true as const, operator: undefined };
  if (!operatorGuard.ok) return { success: false, error: operatorGuard.error };
  const order = await updateOrderStatus(supabase, id, status);
  if (!order) return { success: false, error: "Order not found." };
  if (status === "Delivered") {
    await recordDeliveryOperatorAttribution(createAdminClient(), order.id, operatorGuard.operator);
  }
  await trySyncJobCardsForOrder(supabase, order.id);
  return { success: true, data: order };
}

export async function deleteUntouchedOrderAction(id: string): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!id) return { success: false, error: "Order is required." };

  const admin = createAdminClient();
  const { data: attachments } = await admin
    .from("order_attachments")
    .select("storage_path")
    .eq("order_id", id);
  const { error } = await supabase.rpc("delete_untouched_order", { p_order_id: id });
  if (error) return { success: false, error: error.message };

  const storagePaths = (attachments ?? [])
    .map((entry) => String(entry.storage_path ?? ""))
    .filter(Boolean);
  if (storagePaths.length > 0) {
    await admin.storage.from(ORDER_ATTACHMENTS_BUCKET).remove(storagePaths);
  }
  return { success: true, data: undefined };
}

export async function getOrderAttachmentsAction(
  orderId: string
): Promise<OrderAttachment[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return [];
  const attachments = await getOrderAttachments(createAdminClient(), orderId);
  return withOrderAttachmentSignedUrls(attachments);
}

export async function uploadOrderAttachmentAction(
  formData: FormData
): Promise<ActionResult<OrderAttachment>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };

  const orderId = String(formData.get("orderId") ?? "").trim();
  const serialRaw = String(formData.get("orderItemSerialNo") ?? "").trim();
  const orderItemId = String(formData.get("orderItemId") ?? "").trim();
  const attachmentType = String(formData.get("attachmentType") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const file = formData.get("file");
  const orderItemSerialNo = serialRaw ? Number(serialRaw) : undefined;

  if (!orderId) return { success: false, error: "Order is required." };
  if (orderItemSerialNo !== undefined && !Number.isInteger(orderItemSerialNo)) {
    return { success: false, error: "Select a valid garment." };
  }
  const order = await getOrderById(supabase, orderId);
  if (!order) return { success: false, error: "Order not found." };
  const associatedItem = orderItemId
    ? order.items.find((item) => item.id === orderItemId)
    : orderItemSerialNo !== undefined
      ? order.items.find((item) => item.serialNo === orderItemSerialNo)
      : undefined;
  if ((orderItemId || orderItemSerialNo !== undefined) && !associatedItem) {
    return { success: false, error: "Select a valid garment." };
  }
  if (!ORDER_ATTACHMENT_TYPES.includes(attachmentType as OrderAttachmentType)) {
    return { success: false, error: "Select a valid attachment type." };
  }
  if (!(file instanceof File)) {
    return { success: false, error: "Choose a file to upload." };
  }
  if (file.size <= 0) return { success: false, error: "File is empty." };
  if (file.size > MAX_ORDER_ATTACHMENT_BYTES) {
    return { success: false, error: "File must be 10 MB or smaller." };
  }
  if (!ALLOWED_ORDER_ATTACHMENT_MIME_TYPES.has(file.type)) {
    return {
      success: false,
      error: "Only JPG, PNG, WebP, GIF, and PDF files are supported.",
    };
  }

  const admin = createAdminClient();
  const safeName = sanitizeStorageSegment(file.name) || "attachment";
  const path = `${orderId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await admin.storage
    .from(ORDER_ATTACHMENTS_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) return { success: false, error: uploadError.message };

  try {
    const attachment = await createOrderAttachment(admin, {
      orderId,
      orderItemId: associatedItem?.id,
      orderItemSerialNo: associatedItem?.serialNo,
      attachmentType: attachmentType as OrderAttachmentType,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      storagePath: path,
      notes,
      createdBy: guard.userId,
    });
    const [withUrl] = await withOrderAttachmentSignedUrls([attachment]);
    return { success: true, data: withUrl };
  } catch (error) {
    await admin.storage.from(ORDER_ATTACHMENTS_BUCKET).remove([path]);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to save attachment metadata.",
    };
  }
}

export async function updateOrderAttachmentAction(data: {
  id: string;
  orderItemId?: string;
  orderItemSerialNo?: number;
  attachmentType: OrderAttachmentType;
  notes?: string;
}): Promise<ActionResult<OrderAttachment>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };

  if (!data.id) return { success: false, error: "Attachment is required." };
  if (!ORDER_ATTACHMENT_TYPES.includes(data.attachmentType)) {
    return { success: false, error: "Select a valid attachment type." };
  }
  const existing = await getOrderAttachmentById(createAdminClient(), data.id);
  if (!existing) return { success: false, error: "Attachment not found." };
  const order = await getOrderById(supabase, existing.orderId);
  if (!order) return { success: false, error: "Order not found." };
  const associatedItem = data.orderItemId
    ? order.items.find((item) => item.id === data.orderItemId)
    : data.orderItemSerialNo !== undefined
      ? order.items.find((item) => item.serialNo === data.orderItemSerialNo)
      : undefined;
  if ((data.orderItemId || data.orderItemSerialNo !== undefined) && !associatedItem) {
    return { success: false, error: "Select a valid garment." };
  }

  const attachment = await updateOrderAttachment(createAdminClient(), data.id, {
    orderItemId: associatedItem?.id,
    orderItemSerialNo: associatedItem?.serialNo,
    attachmentType: data.attachmentType,
    notes: data.notes,
  });
  if (!attachment) return { success: false, error: "Attachment not found." };
  const [withUrl] = await withOrderAttachmentSignedUrls([attachment]);
  return { success: true, data: withUrl };
}

export async function deleteOrderAttachmentAction(
  id: string
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };

  const admin = createAdminClient();
  const attachment = await getOrderAttachmentById(admin, id);
  if (!attachment) return { success: false, error: "Attachment not found." };

  const { error: storageError } = await admin.storage
    .from(ORDER_ATTACHMENTS_BUCKET)
    .remove([attachment.storagePath]);
  if (storageError) return { success: false, error: storageError.message };

  await deleteOrderAttachment(admin, id);
  return { success: true, data: undefined };
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
  const operatorGuard = await requireActiveSharedDesktopOperator();
  if (!operatorGuard.ok) return { success: false, error: operatorGuard.error };

  try {
    const paymentId = await recordPayment(supabase, data);
    await recordPaymentOperatorAttribution(createAdminClient(), paymentId, operatorGuard.operator);
    await recomputeOrderTotals(createAdminClient(), data.orderId);
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
    await recomputeOrderTotals(createAdminClient(), orderId);
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
    await recomputeOrderTotals(createAdminClient(), data.orderId);
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
    await recomputeOrderTotals(createAdminClient(), orderId);
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
