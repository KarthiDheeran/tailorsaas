"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import {
  adjustInventoryStock,
  createCustomerFabric,
  createInventoryItem,
  getCustomerFabrics,
  getInventoryMovements,
  getInventoryItems,
  isMissingInventorySchemaError,
  updateCustomerFabricStatus,
  type CustomerFabricInput,
  type InventoryItemInput,
  type StockAdjustmentInput,
} from "@/lib/data/inventory-db";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  customerFabricStatuses,
  inventoryItemTypes,
  inventoryMovementTypes,
  inventoryUnits,
} from "@/lib/constants";
import type {
  CustomerFabric,
  CustomerFabricStatus,
  InventoryItem,
  InventoryItemType,
  InventoryMovement,
  InventoryMovementType,
  InventoryUnit,
} from "@/lib/types";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_ITEM_TYPES = new Set<InventoryItemType>(inventoryItemTypes);
const VALID_UNITS = new Set<InventoryUnit>(inventoryUnits);
const VALID_MOVEMENT_TYPES = new Set<InventoryMovementType>(inventoryMovementTypes);
const VALID_FABRIC_STATUSES = new Set<CustomerFabricStatus>(customerFabricStatuses);

export interface InventoryPageData {
  items: InventoryItem[] | null;
  customerFabrics: CustomerFabric[] | null;
}

export async function getInventoryItemsAction(): Promise<InventoryItem[] | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.view");
  if (!guard.ok) return [];
  try {
    return await getInventoryItems(supabase);
  } catch (error) {
    if (isMissingInventorySchemaError(error)) return null;
    throw error;
  }
}

export async function getInventoryPageDataAction(): Promise<InventoryPageData> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.view");
  if (!guard.ok) return { items: [], customerFabrics: [] };

  const dataClient = createAdminClient();
  try {
    const [items, customerFabrics] = await Promise.all([
      getInventoryItems(dataClient),
      getCustomerFabrics(dataClient),
    ]);
    return { items, customerFabrics };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) {
      return { items: null, customerFabrics: null };
    }
    throw error;
  }
}

export async function getInventoryMovementsAction(): Promise<InventoryMovement[] | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.view");
  if (!guard.ok) return [];
  try {
    return await getInventoryMovements(supabase);
  } catch (error) {
    if (isMissingInventorySchemaError(error)) return null;
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

export async function getCustomerFabricsAction(): Promise<CustomerFabric[] | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.view");
  if (!guard.ok) return [];
  try {
    return await getCustomerFabrics(supabase);
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
  if (!VALID_ITEM_TYPES.has(input.itemType)) return "Invalid item type.";
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
