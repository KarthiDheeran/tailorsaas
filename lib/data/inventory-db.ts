import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CustomerFabric,
  CustomerFabricStatus,
  InventoryItem,
  InventoryItemType,
  InventoryMovement,
  InventoryMovementType,
  InventoryUnit,
  PaymentMode,
} from "@/lib/types";

const INVENTORY_ITEM_COLUMNS =
  "id, item_type, name, sku, color, unit, quantity_on_hand, reorder_level, cost_per_unit, vendor_name, purchase_date, purchase_cost, active, notes, created_at, updated_at";

const LEGACY_INVENTORY_ITEM_COLUMNS =
  "id, item_type, name, sku, color, unit, quantity_on_hand, reorder_level, cost_per_unit, active, notes, created_at, updated_at";

const INVENTORY_REPORT_ITEM_COLUMNS =
  "id, item_type, name, sku, unit, quantity_on_hand, reorder_level, cost_per_unit, vendor_name, purchase_date, purchase_cost, active";

const LEGACY_INVENTORY_REPORT_ITEM_COLUMNS =
  "id, item_type, name, sku, unit, quantity_on_hand, reorder_level, cost_per_unit, active";

const INVENTORY_MOVEMENT_COLUMNS =
  "id, item_id, movement_type, quantity, movement_date, reason, order_id, job_card_id, recorded_by, created_at";

const LEGACY_INVENTORY_MOVEMENT_COLUMNS =
  "id, item_id, movement_type, quantity, movement_date, reason, recorded_by, created_at";

const CUSTOMER_FABRIC_COLUMNS =
  "id, customer_id, order_id, customer_name, customer_phone, fabric_description, color, quantity, unit, received_date, status, notes, returned_date, created_at, updated_at";

interface InventoryItemRow {
  id: string;
  item_type: InventoryItemType;
  name: string;
  sku: string | null;
  color: string | null;
  unit: InventoryUnit;
  quantity_on_hand: number;
  reorder_level: number;
  cost_per_unit: number | null;
  vendor_name?: string | null;
  purchase_date?: string | null;
  purchase_cost?: number | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface InventoryReportItemRow {
  id: string;
  item_type: InventoryItemType;
  name: string;
  sku: string | null;
  unit: InventoryUnit;
  quantity_on_hand: number;
  reorder_level: number;
  cost_per_unit: number | null;
  vendor_name?: string | null;
  purchase_date?: string | null;
  purchase_cost?: number | null;
  active: boolean;
}

interface InventoryMovementRow {
  id: string;
  item_id: string;
  movement_type: InventoryMovementType;
  quantity: number;
  movement_date: string;
  reason: string | null;
  order_id?: string | null;
  job_card_id?: string | null;
  recorded_by: string | null;
  created_at: string;
}

interface CustomerFabricRow {
  id: string;
  customer_id: string | null;
  order_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  fabric_description: string;
  color: string | null;
  quantity: number;
  unit: InventoryUnit;
  received_date: string;
  status: CustomerFabricStatus;
  notes: string | null;
  returned_date: string | null;
  created_at: string;
  updated_at: string;
}

export function isMissingInventorySchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("inventory_items") ||
    message.includes("inventory_movements") ||
    message.includes("customer_fabrics")
  );
}

export interface InventoryItemInput {
  itemType: InventoryItemType;
  name: string;
  sku?: string;
  color?: string;
  unit: InventoryUnit;
  quantityOnHand: number;
  reorderLevel: number;
  costPerUnit?: number;
  vendorName?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  purchasePaymentMode?: PaymentMode;
  notes?: string;
}

export interface StockAdjustmentInput {
  itemId: string;
  movementType: InventoryMovementType;
  quantity: number;
  movementDate: string;
  reason?: string;
  orderId?: string;
  jobCardId?: string;
  purchaseCost?: number;
  purchasePaymentMode?: PaymentMode;
  purchaseVendor?: string;
  recordedBy: string;
}

function isMissingInventoryPurchaseSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    candidate.code === "PGRST204" ||
    message.includes("vendor_name") ||
    message.includes("purchase_date") ||
    message.includes("purchase_cost") ||
    message.includes("order_id") ||
    message.includes("job_card_id")
  );
}

export interface CustomerFabricInput {
  customerId?: string;
  orderId?: string;
  customerName: string;
  customerPhone?: string;
  fabricDescription: string;
  color?: string;
  quantity: number;
  unit: InventoryUnit;
  receivedDate: string;
  notes?: string;
}

export async function getInventoryItems(
  supabase: SupabaseClient,
  options: { query?: string; limit?: number } = {}
): Promise<InventoryItem[]> {
  let query = supabase
    .from("inventory_items")
    .select(INVENTORY_ITEM_COLUMNS)
    .order("name");
  const searchText = options.query?.trim().replace(/[%,]/g, " ");
  if (searchText) {
    const pattern = `%${searchText}%`;
    query = query.or(
      [
        `name.ilike.${pattern}`,
        `sku.ilike.${pattern}`,
        `color.ilike.${pattern}`,
        `item_type.ilike.${pattern}`,
        `notes.ilike.${pattern}`,
      ].join(",")
    );
  }
  if (options.limit && options.limit > 0) query = query.limit(options.limit);
  let { data, error } = await query;
  if (error && isMissingInventoryPurchaseSchemaError(error)) {
    let fallback = supabase
      .from("inventory_items")
      .select(LEGACY_INVENTORY_ITEM_COLUMNS)
      .order("name");
    if (searchText) {
      const pattern = `%${searchText}%`;
      fallback = fallback.or(
        [
          `name.ilike.${pattern}`,
          `sku.ilike.${pattern}`,
          `color.ilike.${pattern}`,
          `item_type.ilike.${pattern}`,
          `notes.ilike.${pattern}`,
        ].join(",")
      );
    }
    if (options.limit && options.limit > 0) fallback = fallback.limit(options.limit);
    const result = await fallback;
    data = result.data as unknown as typeof data;
    error = result.error;
  }
  if (error) throw error;
  return ((data as unknown as InventoryItemRow[]) ?? []).map(mapInventoryItem);
}

export async function getInventoryReportItems(
  supabase: SupabaseClient,
  options: { itemType?: InventoryItemType; query?: string } = {}
): Promise<InventoryItem[]> {
  let query = supabase
    .from("inventory_items")
    .select(INVENTORY_REPORT_ITEM_COLUMNS)
    .eq("active", true)
    .order("name");
  if (options.itemType) query = query.eq("item_type", options.itemType);
  const searchText = options.query?.trim().replace(/[%,]/g, " ");
  if (searchText) {
    const pattern = `%${searchText}%`;
    query = query.or(
      [
        `name.ilike.${pattern}`,
        `sku.ilike.${pattern}`,
        `item_type.ilike.${pattern}`,
      ].join(",")
    );
  }

  let { data, error } = await query;
  if (error && isMissingInventoryPurchaseSchemaError(error)) {
    let fallback = supabase
      .from("inventory_items")
      .select(LEGACY_INVENTORY_REPORT_ITEM_COLUMNS)
      .eq("active", true)
      .order("name");
    if (options.itemType) fallback = fallback.eq("item_type", options.itemType);
    if (searchText) {
      const pattern = `%${searchText}%`;
      fallback = fallback.or(
        [
          `name.ilike.${pattern}`,
          `sku.ilike.${pattern}`,
          `item_type.ilike.${pattern}`,
        ].join(",")
      );
    }
    const result = await fallback;
    data = result.data as unknown as typeof data;
    error = result.error;
  }
  if (error) throw error;
  return ((data as unknown as InventoryReportItemRow[]) ?? []).map(
    mapInventoryReportItem
  );
}

export interface InventoryItemStats {
  stockItemsCount: number;
  lowStockCount: number;
  stockValue: number;
}

export async function getInventoryItemStats(
  supabase: SupabaseClient
): Promise<InventoryItemStats> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("active, quantity_on_hand, reorder_level, cost_per_unit");
  if (error) throw error;
  const rows =
    (data as Array<{
      active: boolean;
      quantity_on_hand: number;
      reorder_level: number;
      cost_per_unit: number | null;
    }> | null) ?? [];
  return {
    stockItemsCount: rows.filter((row) => row.active).length,
    lowStockCount: rows.filter(
      (row) => row.active && Number(row.quantity_on_hand) <= Number(row.reorder_level)
    ).length,
    stockValue: rows.filter((row) => row.active).reduce(
      (sum, row) => sum + Number(row.quantity_on_hand) * Number(row.cost_per_unit ?? 0),
      0
    ),
  };
}

export async function getInventoryItemsByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<InventoryItem[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  let { data, error } = await supabase
    .from("inventory_items")
    .select(INVENTORY_ITEM_COLUMNS)
    .in("id", uniqueIds)
    .order("name");
  if (error && isMissingInventoryPurchaseSchemaError(error)) {
    const fallback = await supabase
      .from("inventory_items")
      .select(LEGACY_INVENTORY_ITEM_COLUMNS)
      .in("id", uniqueIds)
      .order("name");
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as InventoryItemRow[]) ?? []).map(mapInventoryItem);
}

export async function createInventoryItem(
  supabase: SupabaseClient,
  input: InventoryItemInput
): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      item_type: input.itemType,
      name: input.name.trim(),
      sku: input.sku?.trim() || null,
      color: input.color?.trim() || null,
      unit: input.unit,
      quantity_on_hand: input.quantityOnHand,
      reorder_level: input.reorderLevel,
      cost_per_unit: input.costPerUnit ?? null,
      vendor_name: input.vendorName?.trim() || "",
      purchase_date: input.purchaseDate || null,
      purchase_cost: input.purchaseCost ?? null,
      notes: input.notes?.trim() || null,
    })
    .select(INVENTORY_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return mapInventoryItem(data as unknown as InventoryItemRow);
}

export async function updateInventoryItem(
  supabase: SupabaseClient,
  id: string,
  input: InventoryItemInput
): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from("inventory_items")
    .update({
      item_type: input.itemType,
      name: input.name.trim(),
      sku: input.sku?.trim() || null,
      color: input.color?.trim() || null,
      unit: input.unit,
      reorder_level: input.reorderLevel,
      cost_per_unit: input.costPerUnit ?? null,
      vendor_name: input.vendorName?.trim() || "",
      purchase_date: input.purchaseDate || null,
      purchase_cost: input.purchaseCost ?? null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(INVENTORY_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return mapInventoryItem(data as unknown as InventoryItemRow);
}

export async function setInventoryItemActive(
  supabase: SupabaseClient,
  id: string,
  active: boolean
): Promise<void> {
  const { error } = await supabase
    .from("inventory_items")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function adjustInventoryStock(
  supabase: SupabaseClient,
  input: StockAdjustmentInput
): Promise<InventoryItem> {
  const item = await getInventoryItemById(supabase, input.itemId);
  if (!item) throw new Error("Inventory item not found.");

  const nextQuantity = getNextQuantity(item.quantityOnHand, input);
  if (nextQuantity < 0) throw new Error("Stock cannot go below zero.");

  const { error: movementError } = await supabase.from("inventory_movements").insert({
    item_id: input.itemId,
    movement_type: input.movementType,
    quantity: input.quantity,
    movement_date: input.movementDate,
    reason: input.reason?.trim() || null,
    order_id: input.orderId ?? null,
    job_card_id: input.jobCardId ?? null,
    recorded_by: input.recordedBy,
  });
  if (movementError) throw movementError;

  const { data, error } = await supabase
    .from("inventory_items")
    .update({
      quantity_on_hand: nextQuantity,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.itemId)
    .select(INVENTORY_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return mapInventoryItem(data as unknown as InventoryItemRow);
}

export async function getInventoryMovements(
  supabase: SupabaseClient,
  itemId?: string,
  options: { orderId?: string; jobCardId?: string } = {}
): Promise<InventoryMovement[]> {
  let query = supabase
    .from("inventory_movements")
    .select(INVENTORY_MOVEMENT_COLUMNS)
    .order("movement_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (itemId) query = query.eq("item_id", itemId);
  if (options.orderId) query = query.eq("order_id", options.orderId);
  if (options.jobCardId) query = query.eq("job_card_id", options.jobCardId);
  let { data, error } = await query;
  if (error && isMissingInventoryPurchaseSchemaError(error)) {
    let fallback = supabase
      .from("inventory_movements")
      .select(LEGACY_INVENTORY_MOVEMENT_COLUMNS)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (itemId) fallback = fallback.eq("item_id", itemId);
    if (options.orderId) fallback = fallback.eq("order_id", options.orderId);
    if (options.jobCardId) fallback = fallback.eq("job_card_id", options.jobCardId);
    const result = await fallback;
    data = result.data as unknown as typeof data;
    error = result.error;
  }
  if (error) throw error;
  return ((data as unknown as InventoryMovementRow[]) ?? []).map(mapInventoryMovement);
}

export async function getCustomerFabrics(
  supabase: SupabaseClient,
  options: { orderId?: string; query?: string; limit?: number } = {}
): Promise<CustomerFabric[]> {
  let query = supabase
    .from("customer_fabrics")
    .select(CUSTOMER_FABRIC_COLUMNS)
    .order("received_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (options.orderId) query = query.eq("order_id", options.orderId);
  const searchText = options.query?.trim().replace(/[%,]/g, " ");
  if (searchText) {
    const pattern = `%${searchText}%`;
    query = query.or(
      [
        `customer_name.ilike.${pattern}`,
        `customer_phone.ilike.${pattern}`,
        `fabric_description.ilike.${pattern}`,
        `color.ilike.${pattern}`,
        `status.ilike.${pattern}`,
        `notes.ilike.${pattern}`,
      ].join(",")
    );
  }
  if (options.limit && options.limit > 0) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw error;
  return ((data as unknown as CustomerFabricRow[]) ?? []).map(mapCustomerFabric);
}

export async function createCustomerFabric(
  supabase: SupabaseClient,
  input: CustomerFabricInput
): Promise<CustomerFabric> {
  const { data, error } = await supabase
    .from("customer_fabrics")
    .insert({
      customer_id: input.customerId || null,
      order_id: input.orderId || null,
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone?.trim() || null,
      fabric_description: input.fabricDescription.trim(),
      color: input.color?.trim() || null,
      quantity: input.quantity,
      unit: input.unit,
      received_date: input.receivedDate,
      notes: input.notes?.trim() || null,
    })
    .select(CUSTOMER_FABRIC_COLUMNS)
    .single();
  if (error) throw error;
  return mapCustomerFabric(data as unknown as CustomerFabricRow);
}

export async function updateCustomerFabricStatus(
  supabase: SupabaseClient,
  id: string,
  status: CustomerFabricStatus,
  todayIso: string
): Promise<CustomerFabric | undefined> {
  const { data, error } = await supabase
    .from("customer_fabrics")
    .update({
      status,
      returned_date: status === "Returned" ? todayIso : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(CUSTOMER_FABRIC_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCustomerFabric(data as unknown as CustomerFabricRow) : undefined;
}

async function getInventoryItemById(
  supabase: SupabaseClient,
  id: string
): Promise<InventoryItem | undefined> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select(INVENTORY_ITEM_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInventoryItem(data as unknown as InventoryItemRow) : undefined;
}

function getNextQuantity(current: number, input: StockAdjustmentInput): number {
  if (input.movementType === "Stock In") return current + input.quantity;
  if (input.movementType === "Stock Out" || input.movementType === "Wastage") {
    return current - input.quantity;
  }
  return input.quantity;
}

function mapInventoryItem(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    itemType: row.item_type,
    name: row.name,
    sku: row.sku ?? undefined,
    color: row.color ?? undefined,
    unit: row.unit,
    quantityOnHand: row.quantity_on_hand,
    reorderLevel: row.reorder_level,
    costPerUnit: row.cost_per_unit ?? undefined,
    vendorName: row.vendor_name?.trim() ? row.vendor_name : undefined,
    purchaseDate: row.purchase_date ?? undefined,
    purchaseCost: row.purchase_cost ?? undefined,
    active: row.active,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInventoryReportItem(row: InventoryReportItemRow): InventoryItem {
  return {
    id: row.id,
    itemType: row.item_type,
    name: row.name,
    sku: row.sku ?? undefined,
    unit: row.unit,
    quantityOnHand: row.quantity_on_hand,
    reorderLevel: row.reorder_level,
    costPerUnit: row.cost_per_unit ?? undefined,
    vendorName: row.vendor_name?.trim() ? row.vendor_name : undefined,
    purchaseDate: row.purchase_date ?? undefined,
    purchaseCost: row.purchase_cost ?? undefined,
    active: row.active,
    createdAt: "",
    updatedAt: "",
  };
}

function mapInventoryMovement(row: InventoryMovementRow): InventoryMovement {
  return {
    id: row.id,
    itemId: row.item_id,
    movementType: row.movement_type,
    quantity: row.quantity,
    movementDate: row.movement_date,
    reason: row.reason ?? undefined,
    orderId: row.order_id ?? undefined,
    jobCardId: row.job_card_id ?? undefined,
    recordedBy: row.recorded_by ?? undefined,
    createdAt: row.created_at,
  };
}

function mapCustomerFabric(row: CustomerFabricRow): CustomerFabric {
  return {
    id: row.id,
    customerId: row.customer_id ?? undefined,
    orderId: row.order_id ?? undefined,
    customerName: row.customer_name,
    customerPhone: row.customer_phone ?? undefined,
    fabricDescription: row.fabric_description,
    color: row.color ?? undefined,
    quantity: row.quantity,
    unit: row.unit,
    receivedDate: row.received_date,
    status: row.status,
    notes: row.notes ?? undefined,
    returnedDate: row.returned_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
