"use server";

import {
  getServerCallerContext,
  getServerCallerPermissions,
  requireServerPermission,
} from "@/lib/auth/require-server-permission";
import {
  assignJobCard,
  completeJobCard,
  getJobCardActivitySnapshot,
  getJobCardAssignedStaffId,
  getJobCards,
  isMissingJobCardsSchemaError,
  moveJobCardStage,
  startJobCard,
  syncOrderStatusFromJobCards,
  syncJobCardsForOrder,
  type JobCardAssignmentInput,
  type JobCardFabricSource,
} from "@/lib/data/job-cards-db";
import {
  getJobCardActivityLogs,
  isMissingJobCardActivitySchemaError,
  logJobCardActivity,
} from "@/lib/data/job-card-activity-db";
import {
  createJobCardStageSlip,
  getJobCardStageSlipById,
  getJobCardStageSlipByScanCode,
  getTalliedJobCardStageSlips,
  isMissingJobCardStageSlipsSchemaError,
  markJobCardStageSlipTallied,
  type CreateJobCardStageSlipInput,
  type JobCardStageSlip,
} from "@/lib/data/job-card-stage-slips-db";
import { getAllOrders } from "@/lib/data/orders-db";
import {
  getStaff,
  getWorkAssignments,
  getWorkAssignmentsForStaff,
} from "@/lib/data/staff-db";
import {
  adjustInventoryStock,
  createCustomerFabric,
  getCustomerFabrics,
  getInventoryItems,
  getInventoryMovements,
  isMissingInventorySchemaError,
  type CustomerFabricInput,
  type StockAdjustmentInput,
} from "@/lib/data/inventory-db";
import { getActiveWorkStages } from "@/lib/data/catalog-db";
import type { JobCard, JobCardStage } from "@/lib/job-cards";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import type {
  CustomerFabric,
  InventoryMovement,
  InventoryItem,
  InventoryUnit,
  JobCardActivityLog,
  Order,
  Staff,
  TaskPriority,
  TaskType,
  WorkAssignment,
} from "@/lib/types";
import { inventoryUnits } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

const VALID_PRIORITIES = new Set<TaskPriority>(["Low", "Normal", "High"]);
const VALID_FABRIC_SOURCES = new Set<JobCardFabricSource>([
  "Not specified",
  "Customer provided",
  "Shop provided",
]);
const VALID_INVENTORY_UNITS = new Set<InventoryUnit>(inventoryUnits);
const VALID_STAGES = new Set<JobCardStage>([
  "Unassigned",
  "Cutting",
  "Stitching",
  "Embroidery",
  "Finishing",
  "Trial",
  "Alteration",
  "Delayed",
  "Ready",
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function isConfiguredWorkStage(stage: string): Promise<boolean> {
  const supabase = createServerClient();
  const stages = await getActiveWorkStages(supabase);
  return stages.some((candidate) => candidate.stageKey === stage);
}

export interface JobCardsPageData {
  jobCards: JobCard[] | null;
  orders: Order[];
  staff: Staff[];
  assignments: WorkAssignment[];
  customerFabrics: CustomerFabric[] | null;
  inventoryItems: InventoryItem[] | null;
  inventoryMovements: InventoryMovement[] | null;
}

export async function getJobCardsAction(todayIso: string): Promise<JobCard[] | null> {
  const supabase = createServerClient();
  const context = await getServerCallerContext(supabase);
  const permissions = context?.permissions ?? null;
  if (!hasAnyPermission(permissions, ["orders.view", "staff.view"])) return [];

  const assignedStaffId =
    context &&
    context.staffId &&
    !hasAnyPermission(context.permissions, ["orders.view", "orders.edit", "staff.manage"])
      ? context.staffId
      : undefined;

  try {
    const staffList = await getStaff(supabase).catch(() => []);
    return await getJobCards(supabase, todayIso, staffList, { assignedStaffId });
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) return null;
    throw error;
  }
}

export async function getJobCardsPageDataAction(
  todayIso: string,
  options: { includeInventoryItems?: boolean } = {}
): Promise<JobCardsPageData> {
  const empty: JobCardsPageData = {
    jobCards: [],
    orders: [],
    staff: [],
    assignments: [],
    customerFabrics: [],
    inventoryItems: [],
    inventoryMovements: [],
  };
  if (!ISO_DATE.test(todayIso)) throw new Error("A valid date is required.");

  const supabase = createServerClient();
  const context = await getServerCallerContext(supabase);
  const permissions = context?.permissions ?? null;
  const canViewWork = hasAnyPermission(permissions, ["orders.view", "staff.view"]);
  if (!canViewWork) return empty;

  const canViewOrders = hasPermission(permissions, "orders.view");
  const canViewStaff = hasPermission(permissions, "staff.view");
  const canViewInventory = hasAnyPermission(permissions, ["inventory.view", "inventory.manage"]);
  const ownWorkOnly =
    Boolean(context?.staffId) &&
    !hasAnyPermission(permissions, ["orders.view", "orders.edit", "staff.manage"]);
  const assignedStaffId = ownWorkOnly ? context!.staffId! : undefined;

  const staffRead = getStaff(supabase);
  const staffForCards = canViewStaff ? await staffRead : await staffRead.catch(() => []);
  const visibleStaff = assignedStaffId
    ? staffForCards.filter((staff) => staff.id === assignedStaffId)
    : staffForCards;
  const [jobCards, orders, staff, assignments, inventory] = await Promise.all([
    getJobCards(supabase, todayIso, visibleStaff, { assignedStaffId }).catch((error) => {
      if (isMissingJobCardsSchemaError(error)) return null;
      throw error;
    }),
    canViewOrders && !assignedStaffId ? getAllOrders(supabase) : Promise.resolve([]),
    canViewStaff ? Promise.resolve(visibleStaff) : Promise.resolve([]),
    canViewStaff
      ? assignedStaffId
        ? getWorkAssignmentsForStaff(supabase, assignedStaffId)
        : getWorkAssignments(supabase)
      : Promise.resolve([]),
    canViewInventory && options.includeInventoryItems
      ? getJobCardsInventoryData(supabase, Boolean(options.includeInventoryItems))
      : Promise.resolve({ customerFabrics: [], inventoryItems: [], inventoryMovements: [] }),
  ]);

  return {
    jobCards,
    orders,
    staff,
    assignments,
    customerFabrics: inventory.customerFabrics,
    inventoryItems: inventory.inventoryItems,
    inventoryMovements: inventory.inventoryMovements,
  };
}

export async function getJobCardActivityLogsAction(
  id: string
): Promise<JobCardActivityLog[] | null> {
  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (!hasAnyPermission(permissions, ["orders.view", "staff.view"])) return [];

  try {
    return await getJobCardActivityLogs(supabase, id);
  } catch (error) {
    if (isMissingJobCardActivitySchemaError(error)) return null;
    throw error;
  }
}

export async function createJobCardStageSlipAction(
  data: CreateJobCardStageSlipInput
): Promise<ActionResult<JobCardStageSlip>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.printJobCard");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!data.orderId) return { success: false, error: "Order is required." };
  if (!Number.isInteger(data.orderItemSerialNo) || data.orderItemSerialNo < 1) {
    return { success: false, error: "Order item is required." };
  }
  if (!Number.isInteger(data.unitNo) || data.unitNo < 1) {
    return { success: false, error: "Unit is required." };
  }
  if (!(await isConfiguredWorkStage(data.stage))) {
    return { success: false, error: "Stage is required." };
  }
  if (
    data.wageRate !== undefined &&
    (!Number.isFinite(data.wageRate) || data.wageRate < 0)
  ) {
    return { success: false, error: "Rate must be zero or more." };
  }

  try {
    const slip = await createJobCardStageSlip(supabase, data);
    return { success: true, data: slip };
  } catch (error) {
    if (isMissingJobCardStageSlipsSchemaError(error)) {
      return {
        success: false,
        error: "Job card slip schema is missing. Run Supabase migrations 0044, 0045 and 0046.",
      };
    }
    return {
      success: false,
      error: errorMessage(error, "Failed to create job card slip."),
    };
  }
}

export async function getJobCardStageSlipAction(
  id: string
): Promise<JobCardStageSlip | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.printJobCard");
  if (!guard.ok) return undefined;
  return getJobCardStageSlipById(supabase, id);
}

export async function scanJobCardStageSlipAction(
  code: string
): Promise<ActionResult<JobCardStageSlip>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const slip = await getJobCardStageSlipByScanCode(supabase, code);
  if (!slip) return { success: false, error: "Job card not found." };
  if (slip.talliedAt) return { success: true, data: slip };
  const tallied = await markJobCardStageSlipTallied(supabase, slip.id);
  return tallied
    ? { success: true, data: tallied }
    : { success: false, error: "Job card not found." };
}

export async function previewJobCardStageSlipAction(
  code: string
): Promise<ActionResult<JobCardStageSlip>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const slip = await getJobCardStageSlipByScanCode(supabase, code);
  return slip ? { success: true, data: slip } : { success: false, error: "Job card not found." };
}

export async function confirmJobCardStageSlipTallyAction(
  id: string
): Promise<ActionResult<JobCardStageSlip>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const slip = await getJobCardStageSlipById(supabase, id);
  if (!slip) return { success: false, error: "Job card not found." };
  if (slip.talliedAt) return { success: true, data: slip };
  const tallied = await markJobCardStageSlipTallied(supabase, slip.id);
  return tallied
    ? { success: true, data: tallied }
    : { success: false, error: "Job card not found." };
}

export async function getTalliedJobCardStageSlipsAction(): Promise<JobCardStageSlip[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return [];
  return getTalliedJobCardStageSlips(supabase);
}

export async function assignJobCardAction(
  id: string,
  data: JobCardAssignmentInput
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const validationError = await validateAssignment(data);
  if (validationError) return { success: false, error: validationError };

  try {
    const before = await getJobCardActivitySnapshot(supabase, id);
    await assignJobCard(supabase, id, data);
    if (before) {
      await logJobCardActivityBestEffort({
        jobCardId: id,
        orderId: before.orderId,
        actionType: "Assigned",
        fromStage: before.currentStage,
        toStage: taskTypeToStage(data.taskType),
        assignedStaffId: data.assignedStaffId,
        notes: data.notes,
        performedBy: guard.userId,
      });
    }
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to assign job card.",
    };
  }
}

export async function startJobCardAction(
  id: string,
  todayIso: string
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireJobCardProgressAccess(supabase, id);
  if (!guard.ok) return { success: false, error: guard.error };
  if (!ISO_DATE.test(todayIso)) return { success: false, error: "A valid date is required." };

  try {
    const admin = createAdminClient();
    const before = await getJobCardActivitySnapshot(admin, id);
    await startJobCard(admin, id, todayIso);
    if (before) {
      await logJobCardActivityBestEffort({
        jobCardId: id,
        orderId: before.orderId,
        actionType: "Started",
        fromStage: before.currentStage,
        toStage: before.currentStage,
        assignedStaffId: before.assignedStaffId,
        performedBy: guard.userId,
      });
    }
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to start job card.",
    };
  }
}

export async function completeJobCardAction(
  id: string,
  todayIso: string
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireJobCardProgressAccess(supabase, id);
  if (!guard.ok) return { success: false, error: guard.error };
  if (!ISO_DATE.test(todayIso)) return { success: false, error: "A valid date is required." };

  try {
    const admin = createAdminClient();
    const before = await getJobCardActivitySnapshot(admin, id);
    const orderId = await completeJobCard(admin, id, todayIso);
    await syncOrderStatusFromJobCards(admin, orderId);
    const after = await getJobCardActivitySnapshot(admin, id);
    if (before) {
      await logJobCardActivityBestEffort({
        jobCardId: id,
        orderId,
        actionType: after?.currentStage === "Ready" ? "Completed" : "Stage Moved",
        fromStage: before.currentStage,
        toStage: after?.currentStage ?? before.currentStage,
        assignedStaffId: before.assignedStaffId,
        performedBy: guard.userId,
      });
    }
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to complete job card.",
    };
  }
}

export async function moveJobCardStageAction(
  id: string,
  stage: JobCardStage,
  todayIso: string,
  reason?: string
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!VALID_STAGES.has(stage)) return { success: false, error: "Invalid stage." };
  if (!ISO_DATE.test(todayIso)) return { success: false, error: "A valid date is required." };
  if ((stage === "Delayed" || stage === "Alteration") && !reason?.trim()) {
    return {
      success: false,
      error: stage === "Delayed" ? "Delay reason is required." : "Rework reason is required.",
    };
  }

  try {
    const admin = createAdminClient();
    const before = await getJobCardActivitySnapshot(admin, id);
    const orderId = await moveJobCardStage(admin, id, stage, todayIso);
    await syncOrderStatusFromJobCards(admin, orderId);
    if (before) {
      await logJobCardActivityBestEffort({
        jobCardId: id,
        orderId,
        actionType:
          stage === "Ready"
            ? "Completed"
            : stage === "Delayed"
              ? "Delayed"
              : stage === "Alteration"
                ? "Rework"
                : "Stage Moved",
        fromStage: before.currentStage,
        toStage: stage,
        assignedStaffId: before.assignedStaffId,
        notes: reason,
        performedBy: guard.userId,
      });
    }
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to move job card stage.",
    };
  }
}

export async function recordJobCardStockUsageAction(
  id: string,
  input: Pick<StockAdjustmentInput, "itemId" | "quantity" | "movementDate" | "reason">
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!input.itemId) return { success: false, error: "Select a stock item." };
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { success: false, error: "Quantity must be greater than zero." };
  }
  if (!ISO_DATE.test(input.movementDate)) {
    return { success: false, error: "A valid movement date is required." };
  }

  try {
    const admin = createAdminClient();
    const context = await getJobCardFabricContext(admin, id);
    ensureFabricActionAllowed(context);
    const item = await adjustInventoryStock(admin, {
      itemId: input.itemId,
      movementType: "Stock Out",
      quantity: input.quantity,
      movementDate: input.movementDate,
      reason: input.reason,
      orderId: context.orderId,
      jobCardId: id,
      recordedBy: guard.userId,
    });
    await updateFabricSourceForJobCardItem(admin, context, "Shop provided");
    await logJobCardActivityBestEffort({
      jobCardId: id,
      orderId: context.orderId,
      actionType: "Stage Moved",
      fromStage: context.currentStage,
      toStage: context.currentStage,
      assignedStaffId: context.assignedStaffId,
      notes: [
        `Stock used: ${item.name}${item.color ? `, ${item.color}` : ""} - ${input.quantity} ${item.unit}`,
        context.fabricSource !== "Shop provided"
          ? `Fabric Source changed: ${context.fabricSource} -> Shop provided`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      performedBy: guard.userId,
    });
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) {
      return { success: false, error: "Inventory is not enabled in this database yet." };
    }
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record stock usage.",
    };
  }
}

export async function recordJobCardCustomerFabricAction(
  id: string,
  input: CustomerFabricInput
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "inventory.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const validationError = validateJobCardCustomerFabric(input);
  if (validationError) return { success: false, error: validationError };

  try {
    const admin = createAdminClient();
    const context = await getJobCardFabricContext(admin, id);
    ensureFabricActionAllowed(context);
    const fabric = await createCustomerFabric(admin, {
      ...input,
      customerId: input.customerId || context.customerId,
      orderId: context.orderId,
    });
    await updateFabricSourceForJobCardItem(admin, context, "Customer provided");
    await logJobCardActivityBestEffort({
      jobCardId: id,
      orderId: context.orderId,
      actionType: "Stage Moved",
      fromStage: context.currentStage,
      toStage: context.currentStage,
      assignedStaffId: context.assignedStaffId,
      notes: [
        `Customer fabric recorded: ${fabric.fabricDescription}${fabric.color ? `, ${fabric.color}` : ""} - ${fabric.quantity} ${fabric.unit}`,
        context.fabricSource !== "Customer provided"
          ? `Fabric Source changed: ${context.fabricSource} -> Customer provided`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      performedBy: guard.userId,
    });
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) {
      return { success: false, error: "Inventory is not enabled in this database yet." };
    }
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record customer fabric.",
    };
  }
}

interface JobCardFabricContext {
  id: string;
  orderId: string;
  customerId: string;
  orderItemSerialNo: number;
  currentStage: JobCardStage;
  assignedStaffId?: string;
  orderStatus: Order["status"];
  cancelled: boolean;
  fabricSource: JobCardFabricSource;
}

async function getJobCardFabricContext(
  supabase: ReturnType<typeof createAdminClient>,
  id: string
): Promise<JobCardFabricContext> {
  const { data, error } = await supabase
    .from("job_cards")
    .select(
      "id, order_id, customer_id, order_item_serial_no, current_stage, assigned_staff_id, order_status, cancelled, fabric_source"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Job card not found.");
  const row = data as {
    id: string;
    order_id: string;
    customer_id: string;
    order_item_serial_no: number;
    current_stage: JobCardStage;
    assigned_staff_id: string | null;
    order_status: Order["status"];
    cancelled: boolean;
    fabric_source: JobCardFabricSource;
  };
  return {
    id: row.id,
    orderId: row.order_id,
    customerId: row.customer_id,
    orderItemSerialNo: row.order_item_serial_no,
    currentStage: row.current_stage,
    assignedStaffId: row.assigned_staff_id ?? undefined,
    orderStatus: row.order_status,
    cancelled: row.cancelled,
    fabricSource: row.fabric_source,
  };
}

function ensureFabricActionAllowed(context: JobCardFabricContext) {
  if (context.orderStatus === "Delivered" || context.orderStatus === "Cancelled" || context.cancelled) {
    throw new Error("Delivered or cancelled job cards cannot be changed.");
  }
}

async function updateFabricSourceForJobCardItem(
  supabase: ReturnType<typeof createAdminClient>,
  context: JobCardFabricContext,
  fabricSource: JobCardFabricSource
) {
  if (context.fabricSource === fabricSource) return;
  const now = new Date().toISOString();
  const { error: itemError } = await supabase
    .from("order_items")
    .update({ fabric_source: fabricSource })
    .eq("order_id", context.orderId)
    .eq("serial_no", context.orderItemSerialNo);
  if (itemError) throw itemError;

  const { error: cardError } = await supabase
    .from("job_cards")
    .update({ fabric_source: fabricSource, updated_at: now })
    .eq("order_id", context.orderId)
    .eq("order_item_serial_no", context.orderItemSerialNo);
  if (cardError) throw cardError;
}

function validateJobCardCustomerFabric(input: CustomerFabricInput) {
  if (!input.customerName.trim()) return "Customer name is required.";
  if (!input.fabricDescription.trim()) return "Fabric description is required.";
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return "Quantity must be greater than zero.";
  }
  if (!VALID_INVENTORY_UNITS.has(input.unit)) return "Invalid unit.";
  if (!ISO_DATE.test(input.receivedDate)) return "A valid received date is required.";
  return null;
}

async function logJobCardActivityBestEffort(input: Parameters<typeof logJobCardActivity>[1]) {
  try {
    await logJobCardActivity(createAdminClient(), input);
  } catch (error) {
    if (isMissingJobCardActivitySchemaError(error)) return;
    console.error("Failed to log job card activity", error);
  }
}

async function getJobCardsInventoryData(
  supabase: ReturnType<typeof createServerClient>,
  includeInventoryItems: boolean
): Promise<{
  customerFabrics: CustomerFabric[] | null;
  inventoryItems: InventoryItem[] | null;
  inventoryMovements: InventoryMovement[] | null;
}> {
  try {
    const [customerFabrics, inventoryItems, inventoryMovements] = await Promise.all([
      getCustomerFabrics(supabase),
      includeInventoryItems ? getInventoryItems(supabase) : Promise.resolve([]),
      includeInventoryItems ? getInventoryMovements(supabase) : Promise.resolve([]),
    ]);
    return { customerFabrics, inventoryItems, inventoryMovements };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) {
      return { customerFabrics: null, inventoryItems: null, inventoryMovements: null };
    }
    throw error;
  }
}

function taskTypeToStage(taskType: TaskType): JobCardStage {
  if (taskType === "Measurement") return "Trial";
  if (taskType === "Ironing/Packing") return "Finishing";
  if (taskType === "Delivery") return "Ready";
  return taskType;
}

export async function syncJobCardsForOrderAction(orderId: string): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    await syncJobCardsForOrder(supabase, orderId);
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to sync job cards.",
    };
  }
}

export async function syncMissingJobCardsAction(): Promise<ActionResult<{ synced: number }>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    const orders = await getAllOrders(supabase);
    const activeOrders = orders.filter(
      (order) => order.status !== "Delivered" && order.status !== "Cancelled"
    );
    for (const order of activeOrders) {
      await syncJobCardsForOrder(supabase, order.id);
    }
    return { success: true, data: { synced: activeOrders.length } };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create missing job cards.",
    };
  }
}

async function validateAssignment(data: JobCardAssignmentInput): Promise<string | null> {
  if (!(await isConfiguredWorkStage(data.taskType))) return "Invalid task type.";
  if (!data.assignedStaffId.trim()) return "Assigned staff member is required.";
  if (!ISO_DATE.test(data.dueDate)) return "A valid due date is required.";
  if (data.startedDate && !ISO_DATE.test(data.startedDate)) return "A valid start date is required.";
  if (!VALID_PRIORITIES.has(data.priority)) return "Invalid priority.";
  if (data.fabricSource && !VALID_FABRIC_SOURCES.has(data.fabricSource)) {
    return "Invalid fabric source.";
  }
  return null;
}

async function requireJobCardProgressAccess(
  supabase: ReturnType<typeof createServerClient>,
  id: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const context = await getServerCallerContext(supabase);
  if (!context) return { ok: false, error: "Not signed in." };
  if (hasPermission(context.permissions, "staff.manage")) {
    return { ok: true, userId: context.userId };
  }
  if (!hasPermission(context.permissions, "staff.view") || !context.staffId) {
    return { ok: false, error: "You don't have permission to update this job card." };
  }

  const assignedStaffId = await getJobCardAssignedStaffId(supabase, id);
  if (assignedStaffId === undefined) return { ok: false, error: "Job card not found." };
  if (assignedStaffId !== context.staffId) {
    return { ok: false, error: "You can only update job cards assigned to you." };
  }
  return { ok: true, userId: context.userId };
}
