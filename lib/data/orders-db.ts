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
  "id, order_id, serial_no, particular, garment_type_id, size, qty, delivered_qty, rate, add_ons, add_ons_total, final_rate, amount, measurements, field_schema_snapshot, fabric_source, fabric_notes, design_notes, alteration_issue, alteration_required_change, alteration_charge_type, linked_original_order_id";

const ORDER_ITEM_REPEAT_COLUMNS =
  "id, order_id, serial_no, particular, garment_type_id, size, qty, delivered_qty, rate, add_ons, add_ons_total, final_rate, amount, fabric_source, fabric_notes, design_notes, alteration_issue, alteration_required_change, alteration_charge_type, linked_original_order_id";

const ORDER_ITEM_SUMMARY_COLUMNS =
  "id, order_id, serial_no, particular, garment_type_id, size, qty, delivered_qty, rate, add_ons, add_ons_total, final_rate, amount";

interface OrderItemRow {
  id: string;
  serial_no: number;
  particular: string;
  garment_type_id: string | null;
  size: string | null;
  qty: number;
  delivered_qty?: number | null;
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
    deliveredQty: row.delivered_qty ?? 0,
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
  delivery_date, delivery_promise_note, order_notes, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
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
  order_notes?: string | null;
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
    orderNotes: row.order_notes?.trim() ? row.order_notes : undefined,
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
    message.includes("order_notes") ||
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

export async function getOrdersByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Order[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  let { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .in("id", uniqueIds)
    .order("order_date", { ascending: false });
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(LEGACY_ORDER_COLUMNS)
      .in("id", uniqueIds)
      .order("order_date", { ascending: false });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as OrderRow[]) ?? []).map(mapOrder);
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

export async function getOrderListRows(supabase: SupabaseClient): Promise<Order[]> {
  const columns = `
    id, tenant_id, shop_id, order_number, order_section, order_sequence, scan_token, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, delivery_promise_note, order_notes, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
    payment_status, created_by_operator_name, measurement_taken_by_operator_name, delivered_by_operator_name, delivered_at, created_at, updated_at,
    order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
  `;
  let { data, error } = await supabase
    .from("orders")
    .select(columns)
    .order("order_date", { ascending: false });
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(`
        id, order_number, customer_id, customer_snapshot, order_date, trial_date,
        delivery_date, total_amount, advance_paid, balance, payment_mode, status,
        payment_status, created_at, updated_at,
        order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
      `)
      .order("order_date", { ascending: false });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as OrderRow[]) ?? []).map(mapOrder);
}

export interface OrderListPageFilters {
  searchQuery?: string;
  orderDateFrom?: string;
  orderDateTo?: string;
  balanceFilter?: "all" | "paid" | "due" | "overdue";
  statusFilter?: "all" | OrderStatus;
  deliveryFilter?: "all" | "dueToday" | "dueTomorrow" | "dueWeek" | "overdue" | "custom";
  deliveryFrom?: string;
  deliveryTo?: string;
  todayIso: string;
}

export interface OrderListPageOptions {
  page: number;
  pageSize: number;
  sortKey: "orderDate" | "deliveryDate";
  sortDir: "asc" | "desc";
  filters: OrderListPageFilters;
}

export interface OrderListPageResult {
  orders: Order[];
  totalCount: number;
}

export async function getOrderListPageRows(
  supabase: SupabaseClient,
  options: OrderListPageOptions
): Promise<OrderListPageResult> {
  const columns = `
    id, tenant_id, shop_id, order_number, order_section, order_sequence, scan_token, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, delivery_promise_note, order_notes, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
    payment_status, created_by_operator_name, measurement_taken_by_operator_name, delivered_by_operator_name, delivered_at, created_at, updated_at,
    order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
  `;
  const fallbackColumns = `
    id, order_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, total_amount, advance_paid, balance, payment_mode, status,
    payment_status, created_at, updated_at,
    order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
  `;

  async function run(selectColumns: string) {
    const { filters } = options;
    const sortField = options.sortKey === "deliveryDate" ? "delivery_date" : "order_date";
    const from = Math.max(0, (options.page - 1) * options.pageSize);
    const to = from + options.pageSize - 1;
    let query = supabase
      .from("orders")
      .select(selectColumns, { count: "exact" });

    if (filters.orderDateFrom) query = query.gte("order_date", filters.orderDateFrom);
    if (filters.orderDateTo) query = query.lte("order_date", filters.orderDateTo);
    if (filters.statusFilter && filters.statusFilter !== "all") {
      query = query.eq("status", filters.statusFilter);
    }

    if (filters.balanceFilter === "paid") {
      query = query.or("balance.lte.0,status.eq.Cancelled");
    } else if (filters.balanceFilter === "due") {
      query = query.gt("balance", 0).neq("status", "Cancelled").gte("delivery_date", filters.todayIso);
    } else if (filters.balanceFilter === "overdue") {
      query = query.gt("balance", 0).neq("status", "Cancelled").lt("delivery_date", filters.todayIso);
    }

    if (filters.deliveryFilter === "dueToday") {
      query = query.eq("delivery_date", filters.todayIso);
    } else if (filters.deliveryFilter === "dueTomorrow") {
      query = query.eq("delivery_date", addDaysForQuery(filters.todayIso, 1));
    } else if (filters.deliveryFilter === "dueWeek") {
      query = query.gte("delivery_date", filters.todayIso).lte("delivery_date", addDaysForQuery(filters.todayIso, 7));
    } else if (filters.deliveryFilter === "overdue") {
      query = query.lt("delivery_date", filters.todayIso);
    } else if (filters.deliveryFilter === "custom") {
      if (filters.deliveryFrom) query = query.gte("delivery_date", filters.deliveryFrom);
      if (filters.deliveryTo) query = query.lte("delivery_date", filters.deliveryTo);
    }

    const searchText = filters.searchQuery?.trim().replace(/[%,]/g, " ");
    if (searchText) {
      const pattern = `%${searchText}%`;
      query = query.or(`order_number.ilike.${pattern},customer_snapshot->>name.ilike.${pattern},customer_snapshot->>phone.ilike.${pattern}`);
    }

    return query
      .order(sortField, { ascending: options.sortDir === "asc" })
      .order("order_sequence", { ascending: false, nullsFirst: false })
      .order("order_number", { ascending: false })
      .range(from, to);
  }

  let { data, error, count } = await run(columns);
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await run(fallbackColumns);
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
    count = fallback.count;
  }
  if (error) throw error;
  return {
    orders: ((data as unknown as OrderRow[]) ?? []).map(mapOrder),
    totalCount: count ?? 0,
  };
}

function addDaysForQuery(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export async function getOrderListRowsInDateRange(
  supabase: SupabaseClient,
  field: "order_date" | "delivery_date",
  fromIso: string,
  toIso: string,
  options: { customerQuery?: string } = {}
): Promise<Order[]> {
  const columns = `
    id, tenant_id, shop_id, order_number, order_section, order_sequence, scan_token, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, delivery_promise_note, order_notes, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
    payment_status, created_by_operator_name, measurement_taken_by_operator_name, delivered_by_operator_name, delivered_at, created_at, updated_at,
    order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
  `;
  let query = supabase
    .from("orders")
    .select(columns)
    .gte(field, fromIso)
    .lte(field, toIso)
    .order(field, { ascending: false });
  const searchText = options.customerQuery?.trim().replace(/[%,]/g, " ");
  if (searchText) {
    const pattern = `%${searchText}%`;
    query = query.or(`order_number.ilike.${pattern},customer_snapshot->>name.ilike.${pattern},customer_snapshot->>phone.ilike.${pattern}`);
  }
  let { data, error } = await query;
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    let fallback = supabase
      .from("orders")
      .select(`
        id, order_number, customer_id, customer_snapshot, order_date, trial_date,
        delivery_date, total_amount, advance_paid, balance, payment_mode, status,
        payment_status, created_at, updated_at,
        order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
      `)
      .gte(field, fromIso)
      .lte(field, toIso)
      .order(field, { ascending: false });
    if (searchText) {
      const pattern = `%${searchText}%`;
      fallback = fallback.or(`order_number.ilike.${pattern},customer_snapshot->>name.ilike.${pattern},customer_snapshot->>phone.ilike.${pattern}`);
    }
    const result = await fallback;
    data = result.data as unknown as typeof data;
    error = result.error;
  }
  if (error) throw error;
  return ((data as unknown as OrderRow[]) ?? []).map(mapOrder);
}

export async function getOrderListRowsInTrialDateRange(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string
): Promise<Order[]> {
  const columns = `
    id, tenant_id, shop_id, order_number, order_section, order_sequence, scan_token, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, delivery_promise_note, order_notes, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
    payment_status, created_by_operator_name, measurement_taken_by_operator_name, delivered_by_operator_name, delivered_at, created_at, updated_at,
    order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
  `;
  let { data, error } = await supabase
    .from("orders")
    .select(columns)
    .gte("trial_date", fromIso)
    .lte("trial_date", toIso)
    .order("trial_date", { ascending: true });
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(`
        id, order_number, customer_id, customer_snapshot, order_date, trial_date,
        delivery_date, total_amount, advance_paid, balance, payment_mode, status,
        payment_status, created_at, updated_at,
        order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
      `)
      .gte("trial_date", fromIso)
      .lte("trial_date", toIso)
      .order("trial_date", { ascending: true });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as OrderRow[]) ?? []).map(mapOrder);
}

export async function getOrderItemParticulars(
  supabase: SupabaseClient
): Promise<string[]> {
  const { data, error } = await supabase
    .from("order_items")
    .select("particular")
    .order("particular");
  if (error) throw error;
  const names = ((data as { particular: string }[] | null) ?? [])
    .map((row) => row.particular.trim())
    .filter(Boolean);
  return Array.from(new Set(names)).sort();
}

export async function getOrderListRowsByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Order[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  const columns = `
    id, tenant_id, shop_id, order_number, order_section, order_sequence, scan_token, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, delivery_promise_note, order_notes, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
    payment_status, created_by_operator_name, measurement_taken_by_operator_name, delivered_by_operator_name, delivered_at, created_at, updated_at,
    order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
  `;
  let { data, error } = await supabase
    .from("orders")
    .select(columns)
    .in("id", uniqueIds)
    .order("order_date", { ascending: false });
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(`
        id, order_number, customer_id, customer_snapshot, order_date, trial_date,
        delivery_date, total_amount, advance_paid, balance, payment_mode, status,
        payment_status, created_at, updated_at,
        order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
      `)
      .in("id", uniqueIds)
      .order("order_date", { ascending: false });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as OrderRow[]) ?? []).map(mapOrder);
}

export async function getActiveOrderIds(
  supabase: SupabaseClient
): Promise<string[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .not("status", "in", '("Delivered","Cancelled")');
  if (error) throw error;
  return ((data as { id: string }[] | null) ?? []).map((row) => row.id);
}

export async function getProductionPrintOrderRows(
  supabase: SupabaseClient
): Promise<Order[]> {
  const columns = `
    id, tenant_id, shop_id, order_number, order_section, order_sequence, scan_token, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, delivery_promise_note, order_notes, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
    payment_status, created_by_operator_name, measurement_taken_by_operator_name, delivered_by_operator_name, delivered_at, created_at, updated_at,
    order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
  `;
  let { data, error } = await supabase
    .from("orders")
    .select(columns)
    .not("status", "in", '("Delivered","Cancelled")')
    .order("order_date", { ascending: false });
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(`
        id, order_number, customer_id, customer_snapshot, order_date, trial_date,
        delivery_date, total_amount, advance_paid, balance, payment_mode, status,
        payment_status, created_at, updated_at,
        order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
      `)
      .not("status", "in", '("Delivered","Cancelled")')
      .order("order_date", { ascending: false });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as OrderRow[]) ?? []).map(mapOrder);
}

export async function getReceivableOrderRows(
  supabase: SupabaseClient
): Promise<Order[]> {
  const columns = `
    id, tenant_id, shop_id, order_number, order_section, order_sequence, scan_token, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, delivery_promise_note, order_notes, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
    payment_status, created_by_operator_name, measurement_taken_by_operator_name, delivered_by_operator_name, delivered_at, created_at, updated_at
  `;
  let { data, error } = await supabase
    .from("orders")
    .select(columns)
    .gt("balance", 0)
    .neq("status", "Cancelled")
    .order("delivery_date", { ascending: true });
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(`
        id, order_number, customer_id, customer_snapshot, order_date, trial_date,
        delivery_date, total_amount, advance_paid, balance, payment_mode, status,
        payment_status, created_at, updated_at
      `)
      .gt("balance", 0)
      .neq("status", "Cancelled")
      .order("delivery_date", { ascending: true });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as Array<OrderRow & { order_items?: OrderItemRow[] }>) ?? [])
    .map((row) => mapOrder({ ...row, order_items: row.order_items ?? [] }));
}

export async function getReceivableOrderListRows(
  supabase: SupabaseClient
): Promise<Order[]> {
  const columns = `
    id, tenant_id, shop_id, order_number, order_section, order_sequence, scan_token, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, delivery_promise_note, order_notes, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
    payment_status, created_by_operator_name, measurement_taken_by_operator_name, delivered_by_operator_name, delivered_at, created_at, updated_at,
    order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
  `;
  let { data, error } = await supabase
    .from("orders")
    .select(columns)
    .gt("balance", 0)
    .neq("status", "Cancelled")
    .order("delivery_date", { ascending: true });
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(`
        id, order_number, customer_id, customer_snapshot, order_date, trial_date,
        delivery_date, total_amount, advance_paid, balance, payment_mode, status,
        payment_status, created_at, updated_at,
        order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
      `)
      .gt("balance", 0)
      .neq("status", "Cancelled")
      .order("delivery_date", { ascending: true });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as OrderRow[]) ?? []).map(mapOrder);
}

export async function getOrderDatesByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_date")
    .in("id", uniqueIds);
  if (error) throw error;
  return new Map(
    ((data as { id: string; order_date: string }[] | null) ?? []).map((row) => [
      row.id,
      row.order_date,
    ])
  );
}

export async function getDeliveryDeskOrderRows(
  supabase: SupabaseClient
): Promise<Order[]> {
  const columns = `
    id, tenant_id, shop_id, order_number, order_section, order_sequence, scan_token, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, delivery_promise_note, order_notes, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
    payment_status, created_by_operator_name, measurement_taken_by_operator_name, delivered_by_operator_name, delivered_at, created_at, updated_at,
    order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
  `;
  let { data, error } = await supabase
    .from("orders")
    .select(columns)
    .eq("status", "Ready")
    .order("delivery_date", { ascending: true })
    .order("order_number", { ascending: true });
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(`
        id, order_number, customer_id, customer_snapshot, order_date, trial_date,
        delivery_date, total_amount, advance_paid, balance, payment_mode, status,
        payment_status, created_at, updated_at,
        order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
      `)
      .eq("status", "Ready")
      .order("delivery_date", { ascending: true })
      .order("order_number", { ascending: true });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as OrderRow[]) ?? []).map(mapOrder);
}

export async function getOrderListRowsForCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<Order[]> {
  const columns = `
    id, tenant_id, shop_id, order_number, order_section, order_sequence, scan_token, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, delivery_promise_note, order_notes, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
    payment_status, created_by_operator_name, measurement_taken_by_operator_name, delivered_by_operator_name, delivered_at, created_at, updated_at,
    order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
  `;
  let { data, error } = await supabase
    .from("orders")
    .select(columns)
    .eq("customer_id", customerId)
    .order("order_date", { ascending: false });
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(`
        id, order_number, customer_id, customer_snapshot, order_date, trial_date,
        delivery_date, total_amount, advance_paid, balance, payment_mode, status,
        payment_status, created_at, updated_at,
        order_items!order_items_order_id_fkey ( ${ORDER_ITEM_SUMMARY_COLUMNS} )
      `)
      .eq("customer_id", customerId)
      .order("order_date", { ascending: false });
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as OrderRow[]) ?? []).map(mapOrder);
}

export async function getRepeatableOrdersForCustomer(
  supabase: SupabaseClient,
  customerId: string,
  limit = 12
): Promise<Order[]> {
  const columns = `
    id, tenant_id, shop_id, order_number, order_section, order_sequence, scan_token, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, delivery_promise_note, order_notes, delivery_bin, total_amount, advance_paid, balance, payment_mode, status,
    payment_status, created_by_operator_name, measurement_taken_by_operator_name, delivered_by_operator_name, delivered_at, created_at, updated_at,
    order_items!order_items_order_id_fkey ( ${ORDER_ITEM_REPEAT_COLUMNS} )
  `;
  let { data, error } = await supabase
    .from("orders")
    .select(columns)
    .eq("customer_id", customerId)
    .order("order_date", { ascending: false })
    .limit(limit);
  if (error && isMissingInvoiceNumberSchemaError(error)) {
    const fallback = await supabase
      .from("orders")
      .select(`
        id, order_number, customer_id, customer_snapshot, order_date, trial_date,
        delivery_date, total_amount, advance_paid, balance, payment_mode, status,
        payment_status, created_at, updated_at,
        order_items!order_items_order_id_fkey ( ${ORDER_ITEM_REPEAT_COLUMNS} )
      `)
      .eq("customer_id", customerId)
      .order("order_date", { ascending: false })
      .limit(limit);
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

export async function updateOrderNotes(
  supabase: SupabaseClient,
  id: string,
  orderNotes: string
): Promise<Order | undefined> {
  const { error } = await supabase
    .from("orders")
    .update({
      order_notes: orderNotes.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  return getOrderById(supabase, id);
}
