"use server";

import fs from "node:fs/promises";
import path from "node:path";
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
  getOrderById,
  getOrderListPageRows,
  getOrderListRowsForCustomer,
  peekNextOrderNumber,
  updateOrder,
  updateOrderNotes,
  updateOrderStatus,
} from "@/lib/data/orders-db";
import { recomputeOrderTotals } from "@/lib/data/order-totals-db";
import {
  recordDeliveryOperatorAttribution,
  recordOrderOperatorAttribution,
  recordPaymentOperatorAttribution,
} from "@/lib/data/operator-attribution-db";
import { requireActiveSharedDesktopOperator } from "@/lib/shared-desktop-operator";
import {
  getSharedDesktopOperatorMode,
  type ActiveSharedDesktopOperator,
} from "@/lib/shared-desktop-operator";
import {
  getActiveGarmentTypes,
  getAllAddOns,
  getAllGarmentTypes,
} from "@/lib/data/catalog-db";
import { getGarmentTypeConfigurations } from "@/lib/data/catalog-fields-db";
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  getShopBillingSettings,
  isMissingShopBillingSettingsSchemaError,
  type ShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import {
  DEFAULT_SHOP_ORDER_PREFERENCES,
  getShopOrderPreferences,
  isMissingShopOrderPreferencesSchemaError,
  type ShopOrderPreferences,
} from "@/lib/data/shop-order-preferences-db";
import {
  buildFieldSchemaSnapshot,
  resolveRuntimeGarmentFields,
  shouldPrintMeasurementsOnJobCard,
  validateGarmentFieldValues,
} from "@/lib/garment-form-runtime";
import {
  createCustomer,
  deleteCustomer,
  getCustomerById,
  getCustomerByNameAndPhone,
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
import { getStaffById } from "@/lib/data/staff-db";
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
import {
  isGarmentSection,
  type CatalogAddOn,
  type CatalogGarmentType,
  type GarmentSection,
  type GarmentTypeConfiguration,
} from "@/lib/catalog";
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

async function timeOrderSaveStep<T>(
  workflow: "existing-customer" | "new-customer",
  step: string,
  work: () => Promise<T>
): Promise<T> {
  if (process.env.PERFORMANCE_DIAGNOSTICS !== "true") return work();
  const startedAt = performance.now();
  try {
    const result = await work();
    console.info(
      `[ORDER SAVE PERF] ${JSON.stringify({
        workflow,
        step,
        durationMs: Number((performance.now() - startedAt).toFixed(1)),
        status: "success",
      })}`
    );
    return result;
  } catch (error) {
    console.info(
      `[ORDER SAVE PERF] ${JSON.stringify({
        workflow,
        step,
        durationMs: Number((performance.now() - startedAt).toFixed(1)),
        status: "error",
        error: error instanceof Error ? error.name : "UnknownError",
      })}`
    );
    throw error;
  }
}

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

function resolveLocalAttachmentPath(rootPath: string, relativePath: string) {
  const root = path.resolve(rootPath.trim());
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Attachment path is outside the configured storage folder.");
  }
  return resolved;
}

async function localAttachmentExists(rootPath: string | undefined, relativePath: string) {
  if (!rootPath?.trim()) return false;
  try {
    await fs.access(resolveLocalAttachmentPath(rootPath, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function withOrderAttachmentSignedUrls(
  attachments: OrderAttachment[]
): Promise<OrderAttachment[]> {
  if (attachments.length === 0) return attachments;
  const admin = createAdminClient();
  const settings = await getShopBillingSettings(admin).catch(
    () => DEFAULT_SHOP_BILLING_SETTINGS
  );
  return Promise.all(
    attachments.map(async (attachment) => {
      const shouldUseLocal =
        attachment.storageProvider === "local" ||
        (settings.attachmentStorageProvider === "local" &&
          (await localAttachmentExists(
            settings.attachmentLocalRootPath,
            attachment.storagePath
          )));
      if (shouldUseLocal) {
        const hasPath = Boolean(settings.attachmentLocalRootPath?.trim());
        return {
          ...attachment,
          signedUrl: hasPath ? `/api/order-attachments/${attachment.id}` : undefined,
        };
      }
      const { data } = await admin.storage
        .from(ORDER_ATTACHMENTS_BUCKET)
        .createSignedUrl(attachment.storagePath, 60 * 60);
      return { ...attachment, signedUrl: data?.signedUrl };
    })
  );
}

export interface OrdersListPageData {
  orders: Order[];
  totalCount: number;
}

export type TodayItemSummaryRow = { garment: string; qty: number };

type MeasurementStaffOption = {
  id: string;
  name: string;
  staff_number: string;
  staff_code?: number;
};

export interface NewOrderBootstrapData {
  billingSettings: ShopBillingSettings;
  orderPreferences: ShopOrderPreferences;
  garmentTypes: CatalogGarmentType[];
  addOns: CatalogAddOn[];
  garmentConfigurations: GarmentTypeConfiguration[];
  measurementStaff: MeasurementStaffOption[];
  operatorMode: Awaited<ReturnType<typeof getSharedDesktopOperatorMode>>;
  todayItemSummary: TodayItemSummaryRow[];
}

export interface EditOrderBootstrapData {
  order: Order | undefined;
  customer: Customer | undefined;
  attachments: OrderAttachment[];
  garmentTypes: CatalogGarmentType[];
  addOns: CatalogAddOn[];
  garmentConfigurations: GarmentTypeConfiguration[];
  billingSettings: ShopBillingSettings;
}

export interface OrderDetailsBootstrapData {
  order: Order | undefined;
  customer: Customer | undefined;
  payments: Payment[];
  adjustments: OrderFinancialAdjustment[];
  attachments: OrderAttachment[];
  billingSettings: ShopBillingSettings;
  garmentTypes: CatalogGarmentType[];
}

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

async function getOrderPricingBillingSettingsForNewOrder(
  supabase: ReturnType<typeof createServerClient>,
  permissions: Permission[]
): Promise<ShopBillingSettings> {
  if (
    !hasAnyOrderPricingPermission(permissions)
  ) {
    return DEFAULT_SHOP_BILLING_SETTINGS;
  }
  try {
    return await getShopBillingSettings(supabase);
  } catch (error) {
    if (isMissingShopBillingSettingsSchemaError(error)) return DEFAULT_SHOP_BILLING_SETTINGS;
    throw error;
  }
}

function hasAnyOrderPricingPermission(permissions: Permission[]) {
  return (
    hasPermission(permissions, "orders.create") ||
    hasPermission(permissions, "orders.edit") ||
    hasPermission(permissions, "orders.viewPayments") ||
    hasPermission(permissions, "orders.recordPayment")
  );
}

async function getOrderPreferencesForNewOrder(
  supabase: ReturnType<typeof createServerClient>,
  permissions: Permission[]
): Promise<ShopOrderPreferences> {
  if (!hasPermission(permissions, "orders.create")) {
    return DEFAULT_SHOP_ORDER_PREFERENCES;
  }
  try {
    return await getShopOrderPreferences(supabase);
  } catch (error) {
    if (isMissingShopOrderPreferencesSchemaError(error)) return DEFAULT_SHOP_ORDER_PREFERENCES;
    throw error;
  }
}

async function getActiveOperatorStaffForNewOrder(): Promise<MeasurementStaffOption[]> {
  const { data, error } = await createAdminClient()
    .from("staff")
    .select("id,name,staff_number,staff_code")
    .eq("status", "Active")
    .order("name");
  if (error) return [];
  return data ?? [];
}

async function getTodayItemSummaryForNewOrder(
  supabase: ReturnType<typeof createServerClient>,
  permissions: Permission[],
  todayIso: string
): Promise<TodayItemSummaryRow[]> {
  if (!hasPermission(permissions, "orders.view")) return [];
  const { data, error } = await supabase
    .from("orders")
    .select("order_items!order_items_order_id_fkey(particular, qty)")
    .eq("order_date", todayIso)
    .neq("status", "Cancelled");
  if (error) return [];
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

export async function getNewOrderBootstrapAction(todayIso: string): Promise<NewOrderBootstrapData> {
  return withPerformanceContext("getNewOrderBootstrapAction", async () => {
    const supabase = createServerClient();
    const [permissions, caller] = await Promise.all([
      getServerCallerPermissions(supabase),
      getServerCallerContext(supabase),
    ]);
    if (!permissions || !caller || !hasPermission(permissions, "orders.create")) {
      return {
        billingSettings: DEFAULT_SHOP_BILLING_SETTINGS,
        orderPreferences: DEFAULT_SHOP_ORDER_PREFERENCES,
        garmentTypes: [],
        addOns: [],
        garmentConfigurations: [],
        measurementStaff: [],
        operatorMode: { enabled: false, idleMinutes: 30 },
        todayItemSummary: [],
      };
    }

    const [
      billingSettings,
      orderPreferences,
      allGarments,
      addOns,
      measurementStaff,
      operatorMode,
      todayItemSummary,
    ] = await Promise.all([
      getOrderPricingBillingSettingsForNewOrder(supabase, permissions),
      getOrderPreferencesForNewOrder(supabase, permissions),
      getActiveGarmentTypes(supabase),
      getAllAddOns(supabase),
      getActiveOperatorStaffForNewOrder(),
      getSharedDesktopOperatorMode(),
      getTodayItemSummaryForNewOrder(supabase, permissions, todayIso),
    ]);
    const garmentTypes = caller.allowedOrderSections.length
      ? allGarments.filter((garment) => caller.allowedOrderSections.includes(garment.section))
      : allGarments;
    const configurations = await getGarmentTypeConfigurations(
      supabase,
      garmentTypes.map((garment) => garment.id)
    );
    const garmentConfigurations = caller.allowedOrderSections.length
      ? configurations.filter((configuration) =>
          caller.allowedOrderSections.includes(configuration.garment.section)
        )
      : configurations;

    return {
      billingSettings,
      orderPreferences,
      garmentTypes,
      addOns,
      garmentConfigurations,
      measurementStaff,
      operatorMode,
      todayItemSummary,
    };
  });
}

export async function getOrdersListPageAction(input: {
  page: number;
  pageSize: number;
  sortKey: "orderDate" | "deliveryDate";
  sortDir: "asc" | "desc";
  searchQuery?: string;
  orderDateFrom?: string;
  orderDateTo?: string;
  balanceFilter?: "all" | "paid" | "due" | "overdue";
  statusFilter?: Order["status"] | "all";
  deliveryFilter?: "all" | "dueToday" | "dueTomorrow" | "dueWeek" | "overdue" | "custom";
  deliveryFrom?: string;
  deliveryTo?: string;
  todayIso: string;
}): Promise<OrdersListPageData> {
  return withPerformanceContext("getOrdersListPageAction", async () => {
    const supabase = createServerClient();
    const permissions = await getServerCallerPermissions(supabase);
    if (!permissions || !hasPermission(permissions, "orders.view")) {
      return { orders: [], totalCount: 0 };
    }
    const pageSize = Math.max(1, Math.min(input.pageSize, 100));
    const page = Math.max(1, input.page);
    return profileDataFunction(
      { functionName: "getOrderListPageRows", tableOrRpc: "orders,order_items" },
      () =>
        getOrderListPageRows(supabase, {
          page,
          pageSize,
          sortKey: input.sortKey,
          sortDir: input.sortDir,
          filters: {
            searchQuery: input.searchQuery,
            orderDateFrom: input.orderDateFrom,
            orderDateTo: input.orderDateTo,
            balanceFilter: input.balanceFilter,
            statusFilter: input.statusFilter,
            deliveryFilter: input.deliveryFilter,
            deliveryFrom: input.deliveryFrom,
            deliveryTo: input.deliveryTo,
            todayIso: input.todayIso,
          },
        })
    );
  });
}

export async function getOrdersForCustomerListAction(
  customerId: string
): Promise<Order[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return [];
  return getOrderListRowsForCustomer(supabase, customerId);
}

export async function getOrderByIdAction(id: string): Promise<Order | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return undefined;
  return getOrderById(supabase, id);
}

export async function getEditOrderBootstrapAction(
  id: string
): Promise<EditOrderBootstrapData> {
  return withPerformanceContext("getEditOrderBootstrapAction", async () => {
    const supabase = createServerClient();
    const permissions = await getServerCallerPermissions(supabase);
    if (!permissions || !hasPermission(permissions, "orders.edit")) {
      return {
        order: undefined,
        customer: undefined,
        attachments: [],
        garmentTypes: [],
        addOns: [],
        garmentConfigurations: [],
        billingSettings: DEFAULT_SHOP_BILLING_SETTINGS,
      };
    }

    const [order, caller] = await Promise.all([
      getOrderById(supabase, id),
      getServerCallerContext(supabase),
    ]);
    if (!order) {
      return {
        order: undefined,
        customer: undefined,
        attachments: [],
        garmentTypes: [],
        addOns: [],
        garmentConfigurations: [],
        billingSettings: DEFAULT_SHOP_BILLING_SETTINGS,
      };
    }

    const canViewCatalog = hasPermission(permissions, "catalog.view");
    const [customer, attachments, allGarments, addOns, billingSettings] = await Promise.all([
      getCustomerById(supabase, order.customerId),
      hasPermission(permissions, "orders.view")
        ? getOrderAttachments(createAdminClient(), order.id).then(withOrderAttachmentSignedUrls).catch(() => [])
        : Promise.resolve([]),
      canViewCatalog ? getAllGarmentTypes(supabase) : Promise.resolve([]),
      canViewCatalog ? getAllAddOns(supabase) : Promise.resolve([]),
      getOrderPricingBillingSettingsForNewOrder(supabase, permissions),
    ]);
    const garmentTypes =
      caller?.allowedOrderSections.length
        ? allGarments.filter((garment) => caller.allowedOrderSections.includes(garment.section))
        : allGarments;
    const configurations = canViewCatalog
      ? await getGarmentTypeConfigurations(
          supabase,
          garmentTypes.map((garment) => garment.id)
        )
      : [];
    const garmentConfigurations =
      caller?.allowedOrderSections.length
        ? configurations.filter((configuration) =>
            caller.allowedOrderSections.includes(configuration.garment.section)
          )
        : configurations;

    return {
      order,
      customer,
      attachments,
      garmentTypes,
      addOns,
      garmentConfigurations,
      billingSettings,
    };
  });
}

export async function getOrderDetailsBootstrapAction(
  id: string
): Promise<OrderDetailsBootstrapData> {
  return withPerformanceContext("getOrderDetailsBootstrapAction", async () => {
    const supabase = createServerClient();
    const permissions = await getServerCallerPermissions(supabase);
    if (!permissions || !hasPermission(permissions, "orders.view")) {
      return {
        order: undefined,
        customer: undefined,
        payments: [],
        adjustments: [],
        attachments: [],
        billingSettings: DEFAULT_SHOP_BILLING_SETTINGS,
        garmentTypes: [],
      };
    }

    const order = await getOrderById(supabase, id);
    if (!order) {
      return {
        order: undefined,
        customer: undefined,
        payments: [],
        adjustments: [],
        attachments: [],
        billingSettings: DEFAULT_SHOP_BILLING_SETTINGS,
        garmentTypes: [],
      };
    }

    const canViewPayments = hasPermission(permissions, "orders.viewPayments");
    const canViewCatalog = hasPermission(permissions, "catalog.view");
    const [customer, payments, adjustments, attachments, billingSettings, garmentTypes] = await Promise.all([
      getCustomerById(supabase, order.customerId),
      canViewPayments ? getPaymentsForOrder(supabase, order.id) : Promise.resolve([]),
      canViewPayments
        ? getOrderFinancialAdjustmentsForOrder(supabase, order.id).catch((error) => {
            if (isMissingOrderFinancialAdjustmentsSchemaError(error)) return [];
            throw error;
          })
        : Promise.resolve([]),
      getOrderAttachments(createAdminClient(), order.id).then(withOrderAttachmentSignedUrls).catch(() => []),
      canViewPayments
        ? getOrderPricingBillingSettingsForNewOrder(supabase, permissions)
        : Promise.resolve(DEFAULT_SHOP_BILLING_SETTINGS),
      canViewCatalog ? getAllGarmentTypes(supabase).catch(() => []) : Promise.resolve([]),
    ]);

    return {
      order,
      customer,
      payments,
      adjustments,
      attachments,
      billingSettings,
      garmentTypes,
    };
  });
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

type MeasurementPickerOrderRow = {
  id: string;
  order_number: string;
  order_date: string;
  order_items?: {
    id: string;
    serial_no: number;
    particular: string;
    garment_type_id: string | null;
    measurements: Record<string, unknown> | null;
    add_ons: { key: string }[] | null;
  }[];
};

async function getRecentMeasurementSnapshotsForPicker(
  supabase: ReturnType<typeof createServerClient>,
  customerId: string,
  garmentTypeId: string,
  excludeOrderId?: string
): Promise<HistoricalMeasurementSnapshot[]> {
  let query = supabase
    .from("orders")
    .select(`
      id,
      order_number,
      order_date,
      order_items!order_items_order_id_fkey (
        id,
        serial_no,
        particular,
        garment_type_id,
        measurements,
        add_ons
      )
    `)
    .eq("customer_id", customerId)
    .neq("status", "Cancelled")
    .order("order_date", { ascending: false })
    .limit(20);
  if (excludeOrderId) query = query.neq("id", excludeOrderId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data as unknown as MeasurementPickerOrderRow[]) ?? [])
    .flatMap((order) =>
      (order.order_items ?? [])
        .filter(
          (item) =>
            item.garment_type_id === garmentTypeId &&
            item.measurements &&
            Object.values(item.measurements).some((value) =>
              typeof value === "string" ? value.trim() !== "" : value !== null
            )
        )
        .map((item) => ({
          orderId: order.id,
          orderNumber: order.order_number,
          orderDate: order.order_date,
          itemId: item.id,
          serialNo: item.serial_no,
          garmentName: item.particular,
          measurements: item.measurements ?? {},
          addOnIds: (item.add_ons ?? []).map((addOn) => addOn.key),
        }))
    )
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
    .slice(0, 5);
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
    ordersGuard.ok
      ? profileDataFunction(
          { functionName: "getRecentMeasurementSnapshotsForPicker", tableOrRpc: "orders,order_items" },
          () => getRecentMeasurementSnapshotsForPicker(supabase, customerId, garmentTypeId, excludeOrderId)
        )
      : Promise.resolve([]),
  ]);

  return { seed, history: orders };
  });
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
    const existingItem = item.id ? existingById.get(item.id) : undefined;
    // Omission from an existing row means this was a quantity/rate-only edit.
    // An explicit object (including {}) still represents a deliberate edit.
    const submittedMeasurements =
      item.measurements === undefined && existingItem
        ? existingItem.measurements
        : item.measurements;
    const itemWithPreservedMeasurements: OrderItem = {
      ...item,
      measurements: submittedMeasurements,
    };
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
        ...itemWithPreservedMeasurements,
        fieldSchemaSnapshot: item.fieldSchemaSnapshot ?? existingItem?.fieldSchemaSnapshot,
      });
      continue;
    }

    const existingMeasurements = existingItem?.measurements ?? {};
    const allowedLegacyCodes = new Set(Object.keys(existingMeasurements));
    const validation = validateGarmentFieldValues(fields, submittedMeasurements ?? {}, allowedLegacyCodes);
    if (validation.error) return { items: [], error: `Item ${item.serialNo}: ${validation.error}` };

    validatedItems.push({
      ...itemWithPreservedMeasurements,
      fieldSchemaSnapshot: buildFieldSchemaSnapshot(
        fields,
        submittedMeasurements ?? {},
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
  const workflow = "existing-customer";
  const supabase = createServerClient();
  const guard = await timeOrderSaveStep(workflow, "requireServerPermission", () =>
    requireServerPermission(supabase, "orders.create")
  );
  if (!guard.ok) return { success: false, error: guard.error };
  const operatorGuard = await timeOrderSaveStep(workflow, "requireActiveSharedDesktopOperator", () =>
    requireActiveSharedDesktopOperator()
  );
  if (!operatorGuard.ok) return { success: false, error: operatorGuard.error };
  const measurementTaker = await timeOrderSaveStep(workflow, "resolveMeasurementTaker", () =>
    resolveMeasurementTaker(data.measurementTakenByOperatorId)
  );
  if (measurementTaker.error) return { success: false, error: measurementTaker.error };
  const selectedCreator = await timeOrderSaveStep(workflow, "resolveCreatedByOperator", () =>
    resolveMeasurementTaker(data.createdByOperatorId)
  );
  if (selectedCreator.error) return { success: false, error: selectedCreator.error };
  if (!isGarmentSection(data.orderSection)) {
    return { success: false, error: "Select a valid order section." };
  }
  const scopeError = await timeOrderSaveStep(workflow, "requireAllowedOrderSection", () =>
    requireAllowedOrderSection(supabase, data.orderSection)
  );
  if (scopeError) return { success: false, error: scopeError };
  if (data.items.length === 0) {
    return { success: false, error: "At least one item is required." };
  }
  const dateError = validateOrderDates(data);
  if (dateError) return { success: false, error: dateError };
  const prepared = await timeOrderSaveStep(workflow, "validateAndSnapshotOrderItems", () =>
    validateAndSnapshotOrderItems(supabase, data.items, [], data.orderSection)
  );
  if (prepared.error) return { success: false, error: prepared.error };
  const order = await timeOrderSaveStep(workflow, "createOrder", () =>
    createOrder(supabase, { ...data, items: prepared.items, status: "In Progress" })
  );
  await Promise.all([
    timeOrderSaveStep(workflow, "recordOrderOperatorAttribution", () =>
      recordOrderOperatorAttribution(
        createAdminClient(),
        order.id,
        selectedCreator.operator ?? operatorGuard.operator,
        measurementTaker.operator ?? operatorGuard.operator,
        { hasAdvancePayment: data.advancePaid > 0 },
      )
    ),
    timeOrderSaveStep(workflow, "recomputeOrderTotals", () =>
      recomputeOrderTotals(createAdminClient(), order.id)
    ),
    timeOrderSaveStep(workflow, "syncJobCardsForOrder", () =>
      trySyncJobCardsForOrder(supabase, order.id)
    ),
  ]);
  const finalOrder = await timeOrderSaveStep(workflow, "finalGetOrderById", () =>
    getOrderById(createAdminClient(), order.id)
  );
  return { success: true, data: finalOrder ?? order };
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
  const workflow = "new-customer";
  const supabase = createServerClient();
  const orderGuard = await timeOrderSaveStep(workflow, "requireOrderPermission", () =>
    requireServerPermission(supabase, "orders.create")
  );
  if (!orderGuard.ok) return { success: false, error: orderGuard.error };
  const operatorGuard = await timeOrderSaveStep(workflow, "requireActiveSharedDesktopOperator", () =>
    requireActiveSharedDesktopOperator()
  );
  if (!operatorGuard.ok) return { success: false, error: operatorGuard.error };
  const measurementTaker = await timeOrderSaveStep(workflow, "resolveMeasurementTaker", () =>
    resolveMeasurementTaker(data.order.measurementTakenByOperatorId)
  );
  if (measurementTaker.error) return { success: false, error: measurementTaker.error };
  const selectedCreator = await timeOrderSaveStep(workflow, "resolveCreatedByOperator", () =>
    resolveMeasurementTaker(data.order.createdByOperatorId)
  );
  if (selectedCreator.error) return { success: false, error: selectedCreator.error };
  if (!isGarmentSection(data.order.orderSection)) {
    return { success: false, error: "Select a valid order section." };
  }
  const scopeError = await timeOrderSaveStep(workflow, "requireAllowedOrderSection", () =>
    requireAllowedOrderSection(supabase, data.order.orderSection)
  );
  if (scopeError) return { success: false, error: scopeError };
  const customerGuard = await timeOrderSaveStep(workflow, "requireCustomerPermission", () =>
    requireServerPermission(supabase, "customers.create")
  );
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

  const existing = await timeOrderSaveStep(workflow, "checkDuplicateCustomer", () =>
    getCustomerByNameAndPhone(
      supabase,
      data.customer.name.trim(),
      data.customer.phone.trim()
    )
  );
  if (existing) {
    return {
      success: false,
      error: "A customer with this name and phone number already exists.",
    };
  }

  let customer: Customer;
  try {
    customer = await timeOrderSaveStep(workflow, "createCustomer", () =>
      createCustomer(supabase, {
        name: data.customer.name.trim(),
        phone: data.customer.phone.trim(),
        address: data.customer.address.trim(),
        area: data.customer.area.trim(),
        gender: data.customer.gender,
      })
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        success: false,
        error: "A customer with this name and phone number already exists.",
      };
    }
    throw error;
  }

  const prepared = await timeOrderSaveStep(workflow, "validateAndSnapshotOrderItems", () =>
    validateAndSnapshotOrderItems(supabase, data.order.items, [], data.order.orderSection)
  );
  if (prepared.error) return { success: false, error: prepared.error };

  let order: Order;
  try {
    order = await timeOrderSaveStep(workflow, "createOrder", () =>
      createOrder(supabase, {
        ...data.order,
        items: prepared.items,
        customerId: customer.id,
        status: "In Progress",
      })
    );
  } catch (error) {
    await deleteCustomer(createAdminClient(), customer.id);
    throw error;
  }
  await Promise.all([
    timeOrderSaveStep(workflow, "recordOrderOperatorAttribution", () =>
      recordOrderOperatorAttribution(
        createAdminClient(),
        order.id,
        selectedCreator.operator ?? operatorGuard.operator,
        measurementTaker.operator ?? operatorGuard.operator,
        { hasAdvancePayment: data.order.advancePaid > 0 },
      )
    ),
    timeOrderSaveStep(workflow, "syncJobCardsForOrder", () =>
      trySyncJobCardsForOrder(supabase, order.id)
    ),
    timeOrderSaveStep(workflow, "recomputeOrderTotals", () =>
      recomputeOrderTotals(createAdminClient(), order.id)
    ),
  ]);
  const finalOrder = await timeOrderSaveStep(workflow, "finalGetOrderById", () =>
    getOrderById(createAdminClient(), order.id)
  );
  return { success: true, data: finalOrder ?? order };
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

export async function getPrintableGarmentTypesAction(): Promise<CatalogGarmentType[]> {
  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (
    !permissions ||
    (!hasPermission(permissions, "orders.printCustomerReceipt") &&
      !hasPermission(permissions, "orders.printJobCard"))
  ) {
    return [];
  }
  return getActiveGarmentTypes(supabase);
}

export async function updateOrderNotesAction(
  id: string,
  orderNotes: string
): Promise<ActionResult<Order>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!id) return { success: false, error: "Order is required." };

  try {
    const order = await updateOrderNotes(supabase, id, orderNotes);
    if (!order) return { success: false, error: "Order not found." };
    return { success: true, data: order };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save order notes.",
    };
  }
}

export async function deleteUntouchedOrderAction(id: string): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!id) return { success: false, error: "Order is required." };

  const admin = createAdminClient();
  let { data: attachments, error: attachmentsError } = await admin
    .from("order_attachments")
    .select("storage_path, storage_provider")
    .eq("order_id", id);
  if (attachmentsError) {
    const fallback = await admin
      .from("order_attachments")
      .select("storage_path")
      .eq("order_id", id);
    attachments = fallback.data as unknown as typeof attachments;
    attachmentsError = fallback.error;
  }
  if (attachmentsError) return { success: false, error: attachmentsError.message };
  const { error } = await supabase.rpc("delete_untouched_order", { p_order_id: id });
  if (error) return { success: false, error: error.message };

  const supabaseStoragePaths = (attachments ?? [])
    .filter((entry) => String(entry.storage_provider ?? "supabase") !== "local")
    .map((entry) => String(entry.storage_path ?? ""))
    .filter(Boolean);
  if (supabaseStoragePaths.length > 0) {
    await admin.storage.from(ORDER_ATTACHMENTS_BUCKET).remove(supabaseStoragePaths);
  }
  const localStoragePaths = (attachments ?? [])
    .filter((entry) => String(entry.storage_provider ?? "supabase") === "local")
    .map((entry) => String(entry.storage_path ?? ""))
    .filter(Boolean);
  if (localStoragePaths.length > 0) {
    const settings = await getShopBillingSettings(admin).catch(
      () => DEFAULT_SHOP_BILLING_SETTINGS
    );
    if (settings.attachmentLocalRootPath?.trim()) {
      await Promise.all(
        localStoragePaths.map(async (storagePath) => {
          try {
            await fs.rm(
              resolveLocalAttachmentPath(settings.attachmentLocalRootPath ?? "", storagePath),
              { force: true }
            );
          } catch {
            // Best-effort cleanup after order deletion.
          }
        })
      );
    }
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

export async function getOrderDrawerDetailsAction(orderId: string): Promise<{
  payments: Payment[];
  adjustments: OrderFinancialAdjustment[];
  attachments: OrderAttachment[];
}> {
  const supabase = createServerClient();
  const [ordersGuard, paymentsGuard] = await Promise.all([
    requireServerPermission(supabase, "orders.view"),
    requireServerPermission(supabase, "orders.viewPayments"),
  ]);
  const [payments, adjustments, attachments] = await Promise.all([
    paymentsGuard.ok ? getPaymentsForOrder(supabase, orderId) : Promise.resolve([]),
    paymentsGuard.ok
      ? getOrderFinancialAdjustmentsForOrder(supabase, orderId).catch((error) => {
          if (isMissingOrderFinancialAdjustmentsSchemaError(error)) return [];
          throw error;
        })
      : Promise.resolve([]),
    ordersGuard.ok
      ? getOrderAttachments(createAdminClient(), orderId).then(withOrderAttachmentSignedUrls)
      : Promise.resolve([]),
  ]);
  return { payments, adjustments, attachments };
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
  const billingSettings = await getShopBillingSettings(admin).catch(
    () => DEFAULT_SHOP_BILLING_SETTINGS
  );
  const safeName = sanitizeStorageSegment(file.name) || "attachment";
  const storagePath = `${orderId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const storageProvider = billingSettings.attachmentStorageProvider;
  if (storageProvider === "local" && !billingSettings.attachmentLocalRootPath?.trim()) {
    return { success: false, error: "Local attachment folder is not configured in settings." };
  }
  if (storageProvider === "local") {
    try {
      const absolutePath = resolveLocalAttachmentPath(
        billingSettings.attachmentLocalRootPath ?? "",
        storagePath
      );
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, Buffer.from(await file.arrayBuffer()), {
        flag: "wx",
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save attachment file.",
      };
    }
  } else {
    const { error: uploadError } = await admin.storage
      .from(ORDER_ATTACHMENTS_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) return { success: false, error: uploadError.message };
  }

  try {
    const attachment = await createOrderAttachment(admin, {
      orderId,
      orderItemId: associatedItem?.id,
      orderItemSerialNo: associatedItem?.serialNo,
      attachmentType: attachmentType as OrderAttachmentType,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      storageProvider,
      storagePath,
      notes,
      createdBy: guard.userId,
    });
    const [withUrl] = await withOrderAttachmentSignedUrls([attachment]);
    return { success: true, data: withUrl };
  } catch (error) {
    if (storageProvider === "local") {
      try {
        const absolutePath = resolveLocalAttachmentPath(
          billingSettings.attachmentLocalRootPath ?? "",
          storagePath
        );
        await fs.rm(absolutePath, { force: true });
      } catch {
        // Metadata save failed; leave cleanup best-effort.
      }
    } else {
      await admin.storage.from(ORDER_ATTACHMENTS_BUCKET).remove([storagePath]);
    }
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

  const settings = await getShopBillingSettings(admin).catch(
    () => DEFAULT_SHOP_BILLING_SETTINGS
  );
  const shouldDeleteLocal =
    attachment.storageProvider === "local" ||
    (settings.attachmentStorageProvider === "local" &&
      (await localAttachmentExists(
        settings.attachmentLocalRootPath,
        attachment.storagePath
      )));
  if (shouldDeleteLocal) {
    if (settings.attachmentLocalRootPath?.trim()) {
      try {
        await fs.rm(
          resolveLocalAttachmentPath(
            settings.attachmentLocalRootPath,
            attachment.storagePath
          ),
          { force: true }
        );
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to delete attachment file.",
        };
      }
    }
  } else {
    const { error: storageError } = await admin.storage
      .from(ORDER_ATTACHMENTS_BUCKET)
      .remove([attachment.storagePath]);
    if (storageError) return { success: false, error: storageError.message };
  }

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
    collectorStaffId?: string;
  notes?: string;
}): Promise<ActionResult<{ order: Order; payments: Payment[] }>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.recordPayment");
  if (!guard.ok) return { success: false, error: guard.error };
  const operatorGuard = await requireActiveSharedDesktopOperator();
  if (!operatorGuard.ok) return { success: false, error: operatorGuard.error };

    try {
      const selectedCollector = data.collectorStaffId
        ? await getStaffById(supabase, data.collectorStaffId.trim())
        : undefined;
      if (data.collectorStaffId && (!selectedCollector || selectedCollector.status !== "Active")) {
        return { success: false, error: "Select an active staff member who collected the amount." };
      }
      const paymentId = await recordPayment(supabase, data);
      await recordPaymentOperatorAttribution(createAdminClient(), paymentId, selectedCollector ?? operatorGuard.operator);
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
