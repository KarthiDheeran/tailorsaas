import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerById } from "@/lib/data/customers-db";
import type {
  AlterationChargeType,
  CustomerSnapshot,
  Order,
  OrderItem,
  OrderItemAddOn,
  OrderItemFabricSource,
  OrderStatus,
  PaymentMode,
} from "@/lib/types";
import type { GarmentSection } from "@/lib/catalog";

// ---------------------------------------------------------------------------
// Phase 6C: real, Supabase-backed replacements for lib/data/stub-data.ts's
// order functions — same names/shapes, each taking an already-constructed
// Supabase client first (same pattern as customers-db.ts/catalog-db.ts).
//
// lib/data/stub-data.ts's mock `orders` array is left completely untouched —
// lib/dashboard.ts and lib/reports.ts (and lib/customers.ts, the
// Reports-only selector fork from Phase 6A) all read it directly and aren't
// migrating in this phase, so there was no way to convert it in place
// without breaking them, exactly like the Customers fork in 6A.
//
// createOrder/updateOrder go through the create_order_with_items /
// update_order_with_items RPCs (supabase/migrations/0006_orders.sql) rather
// than separate insert/delete/insert statements from here — those RPCs are
// each a single atomic Postgres function call, so a failure partway through
// can never leave a half-created order or one that's lost its items.
// ---------------------------------------------------------------------------

const ORDER_ITEM_COLUMNS =
  "id, order_id, serial_no, particular, garment_type_id, size, qty, rate, add_ons, add_ons_total, final_rate, amount, measurements, field_schema_snapshot, fabric_source, fabric_notes, design_notes, alteration_issue, alteration_required_change, alteration_charge_type, linked_original_order_id";

interface OrderItemRow {
  id: string;
  serial_no: number;
  particular: string;
  garment_type_id: string | null;
  size: string | null;
  qty: number;
  rate: number;
  add_ons: OrderItemAddOn[] | null;
  add_ons_total: number | null;
  final_rate: number | null;
  amount: number;
  measurements: Record<string, unknown> | null;
  field_schema_snapshot: Record<string, unknown> | null;
  fabric_source: OrderItemFabricSource | null;
  fabric_notes: string | null;
  design_notes: string | null;
  alteration_issue: string | null;
  alteration_required_change: string | null;
  alteration_charge_type: AlterationChargeType | null;
  linked_original_order_id: string | null;
}

function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    serialNo: row.serial_no,
    particular: row.particular,
    garmentTypeId: row.garment_type_id ?? undefined,
    size: row.size ?? undefined,
    qty: row.qty,
    rate: row.rate,
    addOns: row.add_ons ?? undefined,
    addOnsTotal: row.add_ons_total ?? undefined,
    finalRate: row.final_rate ?? undefined,
    amount: row.amount,
    measurements: row.measurements ?? undefined,
    fieldSchemaSnapshot: row.field_schema_snapshot ?? undefined,
    fabricSource: row.fabric_source ?? undefined,
    fabricNotes: row.fabric_notes?.trim() ? row.fabric_notes : undefined,
    designNotes: row.design_notes?.trim() ? row.design_notes : undefined,
    alterationIssue: row.alteration_issue?.trim() ? row.alteration_issue : undefined,
    alterationRequiredChange: row.alteration_required_change?.trim()
      ? row.alteration_required_change
      : undefined,
    alterationChargeType: row.alteration_charge_type ?? undefined,
    linkedOriginalOrderId: row.linked_original_order_id ?? undefined,
  };
}

const ORDER_COLUMNS = `
  id, tenant_id, shop_id, order_number, order_section, order_sequence, scan_token, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
  delivery_date, delivery_promise_note, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
  payment_status, created_by_operator_name, measurement_taken_by_operator_name, delivered_by_operator_name, delivered_at, created_at, updated_at,
  order_items!order_items_order_id_fkey ( ${ORDER_ITEM_COLUMNS} )
`;

const LEGACY_ORDER_COLUMNS = `
  id, order_number, customer_id, customer_snapshot, order_date, trial_date,
  delivery_date, total_amount, advance_paid, balance, payment_mode, status,
  payment_status, created_at, updated_at,
  order_items!order_items_order_id_fkey ( ${ORDER_ITEM_COLUMNS} )
`;

interface OrderRow {
  id: string;
  tenant_id?: string | null;
  shop_id?: string | null;
  order_number: string;
  order_section?: GarmentSection | null;
  order_sequence?: number | null;
  scan_token?: string | null;
  invoice_number?: string | null;
  customer_id: string;
  customer_snapshot: CustomerSnapshot | null;
  order_date: string;
  trial_date: string | null;
  delivery_date: string;
  delivery_promise_note?: string | null;
  delivery_bin?: string | null;
  created_by_operator_name?: string | null;
  measurement_taken_by_operator_name?: string | null;
  delivered_by_operator_name?: string | null;
  delivered_at?: string | null;
  total_amount: number;
  advance_paid: number;
  balance: number;
  payment_mode: PaymentMode;
  status: OrderStatus;
  payment_status: Order["paymentStatus"] | null;
  created_at: string;
  updated_at: string;
  order_items: OrderItemRow[];
}

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? undefined,
    shopId: row.shop_id ?? undefined,
    orderNumber: row.order_number,
    orderSection: row.order_section ?? undefined,
    orderSequence: row.order_sequence ?? undefined,
    scanToken: row.scan_token ?? undefined,
    invoiceNumber: row.invoice_number ?? undefined,
    customerId: row.customer_id,
    customerSnapshot: row.customer_snapshot ?? undefined,
    orderDate: row.order_date,
    trialDate: row.trial_date ?? "",
    deliveryDate: row.delivery_date,
    deliveryPromiseNote: row.delivery_promise_note?.trim()
      ? row.delivery_promise_note
      : undefined,
    deliveryBin: row.delivery_bin?.trim() ? row.delivery_bin : undefined,
    createdByOperatorName: row.created_by_operator_name?.trim() ? row.created_by_operator_name : undefined,
    measurementTakenByOperatorName: row.measurement_taken_by_operator_name?.trim() ? row.measurement_taken_by_operator_name : undefined,
    deliveredByOperatorName: row.delivered_by_operator_name?.trim() ? row.delivered_by_operator_name : undefined,
    deliveredAt: row.delivered_at ?? undefined,
    items: [...row.order_items]
      .sort((a, b) => a.serial_no - b.serial_no)
      .map(mapOrderItem),
    totalAmount: row.total_amount,
    advancePaid: row.advance_paid,
    balance: row.balance,
    paymentMode: row.payment_mode,
    status: row.status,
    paymentStatus: row.payment_status ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingInvoiceNumberSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    candidate.code === "PGRST204" ||
    message.includes("scan_token") ||
    message.includes("invoice_number") ||
    message.includes("delivery_promise_note") ||
    message.includes("delivery_bin") ||
    message.includes("created_by_operator_name") ||
    message.includes("measurement_taken_by_operator_name") ||
    message.includes("delivered_by_operator_name") ||
    message.includes("delivered_at")
  );
}

export interface OrderScanLookupResult {
  id: string;
  orderNumber: string;
}

export async function findOrderByScanToken(
  supabase: SupabaseClient,
  scanToken: string
): Promise<OrderScanLookupResult | undefined> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("scan_token", scanToken)
    .maybeSingle();
  if (error) {
    const candidate = error as { code?: string; message?: string; details?: string };
    const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
    if (candidate.code === "PGRST204" || message.includes("scan_token")) return undefined;
    throw error;
  }
  const row = data as { id: string; order_number: string } | null;
  return row ? { id: row.id, orderNumber: row.order_number } : undefined;
}

export async function findOrderByOrderNumber(
  supabase: SupabaseClient,
  orderNumber: string
): Promise<OrderScanLookupResult | undefined> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("order_number", orderNumber)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = ((data as { id: string; order_number: string }[] | null) ?? [])[0];
  return row ? { id: row.id, orderNumber: row.order_number } : undefined;
}

export async function getAllOrders(supabase: SupabaseClient): Promise<Order[]> {
  let { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .order("order_date", { ascending: false });
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(LEGACY_ORDER_COLUMNS)
      .order("order_date", { ascending: false });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as OrderRow[]) ?? []).map(mapOrder);
}

export async function getOrderById(
  supabase: SupabaseClient,
  id: string
): Promise<Order | undefined> {
  let { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(LEGACY_ORDER_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return data ? mapOrder(data as unknown as OrderRow) : undefined;
}

export async function getOrdersForCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<Order[]> {
  let { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("customer_id", customerId)
    .order("order_date", { ascending: false });
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(LEGACY_ORDER_COLUMNS)
      .eq("customer_id", customerId)
      .order("order_date", { ascending: false });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as OrderRow[]) ?? []).map(mapOrder);
}

// Non-mutating preview only — see peek_next_order_number()'s own comment in
// the migration. The real, unique number is only ever assigned inside
// create_order_with_items at actual save time.
export async function peekNextOrderNumber(
  supabase: SupabaseClient,
  orderSection: GarmentSection
): Promise<string> {
  const { data, error } = await supabase.rpc("peek_next_order_number", {
    p_order_section: orderSection,
  });
  if (error) throw error;
  return (data as string) ?? "";
}

export async function createOrder(
  supabase: SupabaseClient,
  data: {
    customerId: string;
    orderDate: string;
    trialDate: string;
    deliveryDate: string;
    deliveryPromiseNote?: string;
    items: OrderItem[];
    advancePaid: number;
    paymentMode: PaymentMode;
    orderSection: GarmentSection;
    status?: OrderStatus;
  }
): Promise<Order> {
  // Real customer lookup (lib/data/customers-db.ts, real since Phase 6A) —
  // fixes a live gap the old mock createOrder had: it resolved the snapshot
  // via the mock customer array, which never contains a real Supabase
  // customer id, so customerSnapshot silently came back undefined for any
  // order placed for a post-6A customer.
  const customer = await getCustomerById(supabase, data.customerId);
  const customerSnapshot = customer
    ? { name: customer.name, phone: customer.phone, area: customer.area }
    : null;

  const { data: orderId, error } = await supabase.rpc("create_order_with_items", {
    p_customer_id: data.customerId,
    p_customer_snapshot: customerSnapshot,
    p_order_date: data.orderDate,
    p_trial_date: data.trialDate || null,
    p_delivery_date: data.deliveryDate,
    p_delivery_promise_note: data.deliveryPromiseNote?.trim() || null,
    p_advance_paid: data.advancePaid,
    p_payment_mode: data.paymentMode,
    p_status: data.status ?? "In Progress",
    p_order_section: data.orderSection,
    p_items: data.items,
  });
  if (error) throw error;

  const order = await getOrderById(supabase, orderId as string);
  if (!order) throw new Error("Order was created but could not be re-fetched.");
  return order;
}

export async function updateOrder(
  supabase: SupabaseClient,
  id: string,
  data: {
    orderDate: string;
    trialDate: string;
    deliveryDate: string;
    deliveryPromiseNote?: string;
    items: OrderItem[];
    status: OrderStatus;
  }
): Promise<Order | undefined> {
  const { error } = await supabase.rpc("update_order_with_items", {
    p_order_id: id,
    p_order_date: data.orderDate,
    p_trial_date: data.trialDate || null,
    p_delivery_date: data.deliveryDate,
    p_delivery_promise_note: data.deliveryPromiseNote?.trim() || null,
    p_status: data.status,
    p_items: data.items,
  });
  if (error) throw error;
  return getOrderById(supabase, id);
}

export async function updateOrderStatus(
  supabase: SupabaseClient,
  id: string,
  status: OrderStatus
): Promise<Order | undefined> {
  const { error } = await supabase
    .from("orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  return getOrderById(supabase, id);
}
