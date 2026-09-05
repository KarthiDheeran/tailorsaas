"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import {
  adjustInventoryStock,
  createCustomerFabric,
  createInventoryItem,
  updateInventoryItem,
  setInventoryItemActive,
  getInventoryItemsByIds,
  getCustomerFabrics,
  getInventoryItemStats,
  getInventoryMovements,
  getInventoryItems,
  isMissingInventorySchemaError,
  updateCustomerFabricStatus,
  type CustomerFabricInput,
  type InventoryItemInput,
  type InventoryItemStats,
  type StockAdjustmentInput,
} from "@/lib/data/inventory-db";
import {
  createExpense,
  isMissingExpensesSchemaError,
} from "@/lib/data/expenses-db";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { profileDataFunction, withPerformanceContext } from "@/lib/performance/query-profiler";
import {
  customerFabricStatuses,
  inventoryMovementTypes,
  inventoryUnits,
  paymentModes,
} from "@/lib/constants";
import type {
  CustomerFabric,
  CustomerFabricStatus,
  ExpenseCategory,
  InventoryItem,
  InventoryItemType,
  InventoryMovement,
  InventoryMovementType,
  InventoryUnit,
  PaymentMode,
} from "@/lib/types";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_UNITS = new Set<InventoryUnit>(inventoryUnits);
const VALID_MOVEMENT_TYPES = new Set<InventoryMovementType>(inventoryMovementTypes);
const VALID_FABRIC_STATUSES = new Set<CustomerFabricStatus>(customerFabricStatuses);
const VALID_PAYMENT_MODES = new Set<PaymentMode>(paymentModes);
const DEFAULT_STOCK_ITEM_LIMIT = 300;
const DEFAULT_CUSTOMER_FABRIC_LIMIT = 200;

export interface InventoryPageData {
  items: InventoryItem[] | null;
  itemStats: InventoryItemStats | null;
  customerFabrics?: CustomerFabric[] | null;
}

export interface InventoryItemTypeMaster { id: string; name: string; isActive: boolean }
export interface InventoryRuleRange { id?: string; fromValue: number; toValue: number; quantity: number }
export interface InventoryConsumptionRule {
  id: string;
  garmentTypeId: string;
  garmentName: string;
  inventoryItemId: string;
  inventoryItemName: string;
  calculationType: "Fixed" | "Measurement Range";
  measurementFieldCode?: string;
  measurementFieldName?: string;
  fixedQuantity?: number;
  isActive: boolean;
  ranges: InventoryRuleRange[];
}
export interface InventoryConsumptionMasterData {
  itemTypes: InventoryItemTypeMaster[];
  garments: Array<{ id: string; name: string }>;
  measurementFields: Array<{ code: string; name: string }>;
  rules: InventoryConsumptionRule[];
}

function isMissingConsumptionMaster(error: unknown) {
  const candidate = error as { code?: string; message?: string };
  return candidate.code === "42P01" || candidate.code === "PGRST205" || `${candidate.message ?? ""}`.includes("inventory_consumption");
}

export async function getInventoryConsumptionMasterDataAction(): Promise<InventoryConsumptionMasterData | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.view");
  if (!guard.ok) return { itemTypes: [], garments: [], measurementFields: [], rules: [] };
  const admin = createAdminClient();
  try {
    const [typesResult, garmentsResult, fieldsResult, rulesResult, rangesResult] = await Promise.all([
      admin.from("inventory_item_types").select("id,name,is_active").order("name"),
      admin.from("catalog_garment_types").select("id,name").eq("is_active", true).order("name"),
      admin.from("catalog_fields").select("code,name").eq("field_type", "measurement").eq("is_active", true).order("display_order"),
      admin.from("inventory_consumption_rules").select("id,garment_type_id,inventory_item_id,calculation_type,measurement_field_code,fixed_quantity,is_active,catalog_garment_types(name),inventory_items(name)").order("created_at"),
      admin.from("inventory_consumption_ranges").select("id,rule_id,from_value,to_value,quantity").order("from_value"),
    ]);
    const error = typesResult.error || garmentsResult.error || fieldsResult.error || rulesResult.error || rangesResult.error;
    if (error) throw error;
    const fieldNames = new Map((fieldsResult.data ?? []).map((field) => [field.code, field.name]));
    const rangesByRule = new Map<string, InventoryRuleRange[]>();
    for (const range of rangesResult.data ?? []) {
      const list = rangesByRule.get(range.rule_id) ?? [];
      list.push({ id: range.id, fromValue: Number(range.from_value), toValue: Number(range.to_value), quantity: Number(range.quantity) });
      rangesByRule.set(range.rule_id, list);
    }
    return {
      itemTypes: (typesResult.data ?? []).map((row) => ({ id: row.id, name: row.name, isActive: row.is_active })),
      garments: garmentsResult.data ?? [],
      measurementFields: fieldsResult.data ?? [],
      rules: (rulesResult.data ?? []).map((row) => ({
        id: row.id,
        garmentTypeId: row.garment_type_id,
        garmentName: (row.catalog_garment_types as unknown as { name?: string } | null)?.name ?? "Garment",
        inventoryItemId: row.inventory_item_id,
        inventoryItemName: (row.inventory_items as unknown as { name?: string } | null)?.name ?? "Stock item",
        calculationType: row.calculation_type as "Fixed" | "Measurement Range",
        measurementFieldCode: row.measurement_field_code ?? undefined,
        measurementFieldName: row.measurement_field_code ? fieldNames.get(row.measurement_field_code) : undefined,
        fixedQuantity: row.fixed_quantity == null ? undefined : Number(row.fixed_quantity),
        isActive: row.is_active,
        ranges: rangesByRule.get(row.id) ?? [],
      })),
    };
  } catch (error) {
    if (isMissingConsumptionMaster(error)) return null;
    throw error;
  }
}

export async function saveInventoryItemTypeAction(input: { id?: string; name: string; isActive?: boolean }): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  const name = input.name.trim();
  if (!name) return { success: false, error: "Item type name is required." };
  const query = input.id
    ? supabase.from("inventory_item_types").update({ name, is_active: input.isActive ?? true, updated_at: new Date().toISOString() }).eq("id", input.id)
    : supabase.from("inventory_item_types").insert({ name, is_active: true });
  const { error } = await query;
  return error ? { success: false, error: error.message } : { success: true, data: undefined };
}

export async function saveInventoryConsumptionRuleAction(input: {
  id?: string; garmentTypeId: string; inventoryItemId: string;
  calculationType: "Fixed" | "Measurement Range"; measurementFieldCode?: string;
  fixedQuantity?: number; ranges: InventoryRuleRange[];
}): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!input.garmentTypeId || !input.inventoryItemId) return { success: false, error: "Select garment and stock item." };
  if (input.calculationType === "Fixed" && (!Number.isFinite(input.fixedQuantity) || Number(input.fixedQuantity) <= 0)) return { success: false, error: "Enter a fixed quantity greater than zero." };
  if (input.calculationType === "Measurement Range") {
    if (!input.measurementFieldCode) return { success: false, error: "Select a measurement." };
    if (!input.ranges.length) return { success: false, error: "Add at least one measurement range." };
    const sorted = [...input.ranges].sort((a, b) => a.fromValue - b.fromValue);
    for (let index = 0; index < sorted.length; index += 1) {
      const range = sorted[index];
      if (![range.fromValue, range.toValue, range.quantity].every(Number.isFinite) || range.fromValue > range.toValue || range.quantity <= 0) return { success: false, error: "Enter valid, positive measurement ranges." };
      if (index > 0 && range.fromValue <= sorted[index - 1].toValue) return { success: false, error: "Measurement ranges cannot overlap." };
    }
  }
  const payload = {
    garment_type_id: input.garmentTypeId, inventory_item_id: input.inventoryItemId,
    calculation_type: input.calculationType,
    measurement_field_code: input.calculationType === "Measurement Range" ? input.measurementFieldCode : null,
    fixed_quantity: input.calculationType === "Fixed" ? input.fixedQuantity : null,
    is_active: true, updated_at: new Date().toISOString(),
  };
  const result = input.id
    ? await supabase.from("inventory_consumption_rules").update(payload).eq("id", input.id).select("id").single()
    : await supabase.from("inventory_consumption_rules").insert(payload).select("id").single();
  if (result.error) return { success: false, error: result.error.message };
  const ruleId = result.data.id;
  const { error: deleteError } = await supabase.from("inventory_consumption_ranges").delete().eq("rule_id", ruleId);
  if (deleteError) return { success: false, error: deleteError.message };
  if (input.calculationType === "Measurement Range") {
    const { error } = await supabase.from("inventory_consumption_ranges").insert(input.ranges.map((range) => ({ rule_id: ruleId, from_value: range.fromValue, to_value: range.toValue, quantity: range.quantity })));
    if (error) return { success: false, error: error.message };
  }
  return { success: true, data: undefined };
}

export async function setInventoryConsumptionRuleActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  const { error } = await supabase.from("inventory_consumption_rules").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? { success: false, error: error.message } : { success: true, data: undefined };
}

export interface OrderInventoryData {
  inventoryItems: InventoryItem[] | null;
  inventoryMovements: InventoryMovement[] | null;
  customerFabrics: CustomerFabric[] | null;
}

export async function getInventoryItemsAction(
  options: { query?: string; limit?: number } = {}
): Promise<InventoryItem[] | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.view");
  if (!guard.ok) return [];
  const limit = Math.max(
    1,
    Math.min(options.limit ?? DEFAULT_STOCK_ITEM_LIMIT, DEFAULT_STOCK_ITEM_LIMIT)
  );
  try {
    return await getInventoryItems(supabase, { query: options.query, limit });
  } catch (error) {
    if (isMissingInventorySchemaError(error)) return null;
    throw error;
  }
}

export async function getInventoryPageDataAction(
  options: { includeCustomerFabrics?: boolean; stockQuery?: string; stockLimit?: number } = {}
): Promise<InventoryPageData> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.view");
  if (!guard.ok) return { items: [], itemStats: { stockItemsCount: 0, lowStockCount: 0, stockValue: 0 }, customerFabrics: [] };
  const stockLimit = Math.max(
    1,
    Math.min(options.stockLimit ?? DEFAULT_STOCK_ITEM_LIMIT, DEFAULT_STOCK_ITEM_LIMIT)
  );

  const dataClient = createAdminClient();
  try {
    const [items, itemStats, customerFabrics] = await Promise.all([
      getInventoryItems(dataClient, { query: options.stockQuery, limit: stockLimit }),
      getInventoryItemStats(dataClient),
      options.includeCustomerFabrics ? getCustomerFabrics(dataClient) : Promise.resolve(undefined),
    ]);
    return { items, itemStats, customerFabrics };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) {
      return { items: null, itemStats: null, customerFabrics: null };
    }
    throw error;
  }
}

export async function getInventoryMovementsAction(): Promise<InventoryMovement[] | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.view");
  if (!guard.ok) return [];
  try {
    return await withPerformanceContext("getInventoryMovementsAction", () => profileDataFunction({ functionName: "getInventoryMovements", tableOrRpc: "inventory_movements" }, () => getInventoryMovements(supabase)));
  } catch (error) {
    if (isMissingInventorySchemaError(error)) return null;
    throw error;
  }
}

export async function getOrderInventoryDataAction(orderId: string): Promise<OrderInventoryData> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.view");
  if (!guard.ok) {
    return { inventoryItems: [], inventoryMovements: [], customerFabrics: [] };
  }
  try {
    const [inventoryMovements, customerFabrics] = await Promise.all([
      getInventoryMovements(supabase, undefined, { orderId }),
      getCustomerFabrics(supabase, { orderId }),
    ]);
    const inventoryItems = await getInventoryItemsByIds(
      supabase,
      inventoryMovements.map((movement) => movement.itemId)
    );
    return { inventoryItems, inventoryMovements, customerFabrics };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) {
      return { inventoryItems: null, inventoryMovements: null, customerFabrics: null };
    }
    throw error;
  }
}

export async function createInventoryItemAction(
  input: InventoryItemInput
): Promise<ActionResult<InventoryItem>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const validationError = validateInventoryItem(input);
  if (validationError) return { success: false, error: validationError };

  try {
    const item = await createInventoryItem(supabase, input);
    if (input.purchaseCost && input.purchaseCost > 0) {
      await createInventoryPurchaseExpenseBestEffort({
        itemName: item.name,
        itemType: item.itemType,
        vendorName: input.vendorName,
        purchaseDate: input.purchaseDate || new Date().toISOString().slice(0, 10),
        purchaseCost: input.purchaseCost,
        paymentMode: input.purchasePaymentMode ?? "Cash",
        notes: input.notes,
        recordedBy: guard.userId,
      });
    }
    return { success: true, data: item };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) {
      return { success: false, error: "Inventory is not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create inventory item.",
    };
  }
}

export async function updateInventoryItemAction(
  id: string,
  input: InventoryItemInput
): Promise<ActionResult<InventoryItem>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  const validationError = validateInventoryItem(input);
  if (validationError) return { success: false, error: validationError };
  try {
    return { success: true, data: await updateInventoryItem(supabase, id, input) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update inventory item." };
  }
}

export async function setInventoryItemActiveAction(
  id: string,
  active: boolean
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  try {
    await setInventoryItemActive(supabase, id, active);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to update inventory item status." };
  }
}

export async function adjustInventoryStockAction(
  input: Omit<StockAdjustmentInput, "recordedBy">
): Promise<ActionResult<InventoryItem>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const validationError = validateStockAdjustment(input);
  if (validationError) return { success: false, error: validationError };

  try {
    const item = await adjustInventoryStock(supabase, {
      ...input,
      recordedBy: guard.userId,
    });
    if (input.movementType === "Stock In" && input.purchaseCost && input.purchaseCost > 0) {
      await createInventoryPurchaseExpenseBestEffort({
        itemName: item.name,
        itemType: item.itemType,
        vendorName: input.purchaseVendor,
        purchaseDate: input.movementDate,
        purchaseCost: input.purchaseCost,
        paymentMode: input.purchasePaymentMode ?? "Cash",
        notes: input.reason,
        recordedBy: guard.userId,
      });
    }
    return { success: true, data: item };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) {
      return { success: false, error: "Inventory is not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update stock.",
    };
  }
}

async function createInventoryPurchaseExpenseBestEffort(input: {
  itemName: string;
  itemType: InventoryItemType;
  vendorName?: string;
  purchaseDate: string;
  purchaseCost: number;
  paymentMode: PaymentMode;
  notes?: string;
  recordedBy: string;
}) {
  const category: ExpenseCategory = input.itemType === "Fabric" ? "Fabric" : "Accessories";
  try {
    await createExpense(createAdminClient(), {
      expenseDate: input.purchaseDate,
      category,
      source: "Inventory Purchase",
      reference: input.itemName,
      vendor: input.vendorName,
      description: `Inventory purchase - ${input.itemName}`,
      amount: input.purchaseCost,
      paymentMode: input.paymentMode,
      notes: [
        "Source: Inventory Purchase",
        `Stock item: ${input.itemName}`,
        input.notes ? `Notes: ${input.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      recordedBy: input.recordedBy,
    });
  } catch (error) {
    if (!isMissingExpensesSchemaError(error)) throw error;
  }
}

export async function getCustomerFabricsAction(
  options: { query?: string; limit?: number } = {}
): Promise<CustomerFabric[] | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.view");
  if (!guard.ok) return [];
  const limit = Math.max(
    1,
    Math.min(options.limit ?? DEFAULT_CUSTOMER_FABRIC_LIMIT, DEFAULT_CUSTOMER_FABRIC_LIMIT)
  );
  try {
    return await getCustomerFabrics(supabase, {
      query: options.query,
      limit,
    });
  } catch (error) {
    if (isMissingInventorySchemaError(error)) return null;
    throw error;
  }
}

export async function createCustomerFabricAction(
  input: CustomerFabricInput
): Promise<ActionResult<CustomerFabric>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const validationError = validateCustomerFabric(input);
  if (validationError) return { success: false, error: validationError };

  try {
    const fabric = await createCustomerFabric(supabase, input);
    return { success: true, data: fabric };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) {
      return { success: false, error: "Inventory is not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record customer fabric.",
    };
  }
}

export async function updateCustomerFabricStatusAction(
  id: string,
  status: CustomerFabricStatus,
  todayIso: string
): Promise<ActionResult<CustomerFabric>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!VALID_FABRIC_STATUSES.has(status)) return { success: false, error: "Invalid status." };
  if (!ISO_DATE.test(todayIso)) return { success: false, error: "A valid date is required." };

  try {
    const fabric = await updateCustomerFabricStatus(supabase, id, status, todayIso);
    if (!fabric) return { success: false, error: "Customer fabric not found." };
    return { success: true, data: fabric };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) {
      return { success: false, error: "Inventory is not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update customer fabric.",
    };
  }
}

function validateInventoryItem(input: InventoryItemInput): string | null {
  if (!input.itemType.trim()) return "Item type is required.";
  if (!input.name.trim()) return "Item name is required.";
  if (!VALID_UNITS.has(input.unit)) return "Invalid unit.";
  if (!Number.isFinite(input.quantityOnHand) || input.quantityOnHand < 0) {
    return "Quantity must be 0 or greater.";
  }
  if (!Number.isFinite(input.reorderLevel) || input.reorderLevel < 0) {
    return "Reorder level must be 0 or greater.";
  }
  if (input.costPerUnit != null && (!Number.isFinite(input.costPerUnit) || input.costPerUnit < 0)) {
    return "Cost per unit must be 0 or greater.";
  }
  if (input.purchaseDate && !ISO_DATE.test(input.purchaseDate)) {
    return "A valid purchase date is required.";
  }
  if (input.purchaseCost != null && (!Number.isFinite(input.purchaseCost) || input.purchaseCost < 0)) {
    return "Purchase cost must be 0 or greater.";
  }
  if (input.purchasePaymentMode && !VALID_PAYMENT_MODES.has(input.purchasePaymentMode)) {
    return "Invalid purchase payment mode.";
  }
  return null;
}

function validateStockAdjustment(
  input: Omit<StockAdjustmentInput, "recordedBy">
): string | null {
  if (!input.itemId.trim()) return "Inventory item is required.";
  if (!VALID_MOVEMENT_TYPES.has(input.movementType)) return "Invalid movement type.";
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return "Quantity must be greater than zero.";
  }
  if (!ISO_DATE.test(input.movementDate)) return "A valid movement date is required.";
  if (input.purchaseCost != null && (!Number.isFinite(input.purchaseCost) || input.purchaseCost < 0)) {
    return "Purchase cost must be 0 or greater.";
  }
  if (input.purchasePaymentMode && !VALID_PAYMENT_MODES.has(input.purchasePaymentMode)) {
    return "Invalid purchase payment mode.";
  }
  if (input.movementType !== "Stock In" && input.purchaseCost && input.purchaseCost > 0) {
    return "Purchase cost can be recorded only for Stock In.";
  }
  return null;
}

function validateCustomerFabric(input: CustomerFabricInput): string | null {
  if (!input.customerName.trim()) return "Customer name is required.";
  if (!input.fabricDescription.trim()) return "Fabric description is required.";
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return "Quantity must be greater than zero.";
  }
  if (!VALID_UNITS.has(input.unit)) return "Invalid unit.";
  if (!ISO_DATE.test(input.receivedDate)) return "A valid received date is required.";
  return null;
}
