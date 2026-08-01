"use server";

import {
  getServerCallerContext,
  getServerCallerPermissions,
  requireServerPermission,
} from "@/lib/auth/require-server-permission";
import {
  assignJobCard,
  assignJobCardForStageSlip,
  assertJobCardAvailableForStageSlip,
  completeJobCard,
  completeJobCardStageSlip,
  getJobCardActivitySnapshot,
  getJobCardAssignedStaffId,
  getJobCards,
  isMissingJobCardsSchemaError,
  moveJobCardStage,
  startJobCard,
  syncOrderStatusFromJobCards,
  syncJobCardsForOrder,
  transferJobCard,
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
  assignJobCardStageSlipForTally,
  getJobCardStageSlipsByIds,
  getJobCardStageSlipById,
  getJobCardStageSlipByScanCode,
  getPendingJobCardStageSlip,
  getTalliedJobCardStageSlips,
  isMissingJobCardStageSlipsSchemaError,
  markJobCardStageSlipTallied,
  type CreateJobCardStageSlipInput,
  type JobCardStageSlip,
} from "@/lib/data/job-card-stage-slips-db";
import { getAllOrders, getOrderById } from "@/lib/data/orders-db";
import {
  getStaff,
  recordStaffPayment,
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
import { getActiveWorkStages, getFinalWorkStage } from "@/lib/data/catalog-db";
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
  PaymentMode,
  TaskPriority,
  TaskType,
  WorkAssignment,
} from "@/lib/types";
import { inventoryUnits } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { profileDataFunction, withPerformanceContext } from "@/lib/performance/query-profiler";
import { staffGarmentStageRate } from "@/lib/staff-rates";

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
const VALID_PAYMENT_MODES = new Set<PaymentMode>([
  "Cash",
  "GPay",
  "UPI",
  "Card",
  "Bank Transfer",
  "Cheque",
]);
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

async function requireStaffSameShopForOrder(
  orderId: string,
  staffId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const [order, staff] = await Promise.all([
    getOrderById(admin, orderId),
    getStaff(admin).then((members) => members.find((member) => member.id === staffId)),
  ]);
  if (!order) return "Order not found.";
  if (!staff) return "Staff member not found.";
  if (staff.status !== "Active") return "Choose an active staff member.";
  if (!order.shopId) return "Order shop/location is missing.";
  if (!staff.shopId) {
    return `Set shop/location for ${staff.name} before assigning job cards.`;
  }
  if (staff.shopId !== order.shopId) {
    return `${staff.name} belongs to another shop/location and cannot be assigned to this order.`;
  }
  return null;
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
  return withPerformanceContext("getJobCardsPageDataAction", async () => {
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
    profileDataFunction({ functionName: "getJobCards", tableOrRpc: "job_cards" }, () => getJobCards(supabase, todayIso, visibleStaff, { assignedStaffId })).catch((error) => {
      if (isMissingJobCardsSchemaError(error)) return null;
      throw error;
    }),
    canViewOrders && !assignedStaffId ? profileDataFunction({ functionName: "getAllOrders", tableOrRpc: "orders,order_items" }, () => getAllOrders(supabase)) : Promise.resolve([]),
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
  });
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
    const shopError = data.staffId?.trim()
      ? await requireStaffSameShopForOrder(data.orderId, data.staffId)
      : null;
    if (shopError) return { success: false, error: shopError };
    if (data.staffId?.trim()) {
      await assertJobCardAvailableForStageSlip(createAdminClient(), {
        orderId: data.orderId,
        orderItemSerialNo: data.orderItemSerialNo,
        unitNo: data.unitNo,
        taskType: data.stage,
        staffId: data.staffId,
      });
    }
    const slip = await createJobCardStageSlip(supabase, data);
    if (slip.staffId) {
      const jobCardId = await assignJobCardForStageSlip(createAdminClient(), {
        orderId: slip.orderId,
        orderItemSerialNo: slip.orderItemSerialNo,
        unitNo: slip.unitNo,
        taskType: slip.stage,
        staffId: slip.staffId,
        wageRate: slip.wageRate,
        wageAmount: slip.wageAmount,
        notes: slip.notes,
      });
      await logJobCardActivityBestEffort({
        jobCardId,
        orderId: slip.orderId,
        actionType: "Assigned",
        fromStage: "Unassigned",
        toStage: taskTypeToStage(slip.stage),
        assignedStaffId: slip.staffId,
        notes: `Stage card printed: ${slip.slipCode}`,
        performedBy: guard.userId,
      });
    }
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
  return confirmStageSlipTally(slip, guard.userId);
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
  return confirmStageSlipTally(slip, guard.userId);
}

/**
 * Fast shop-floor tally: the operator selects a worker once and each scanned
 * barcode is immediately credited to that worker. Printed slips may be
 * unassigned; legacy slips that were already assigned still require the same
 * worker to prevent accidental payroll transfers.
 */
export async function quickTallyJobCardStageSlipAction(
  code: string,
  staffId: string
): Promise<ActionResult<JobCardStageSlip>> {
  const normalizedCode = code.trim();
  const normalizedStaffId = staffId.trim();
  if (!normalizedCode) return { success: false, error: "Scan a job card barcode." };
  if (!normalizedStaffId) return { success: false, error: "Select a staff member before scanning." };

  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    const admin = createAdminClient();
    const [slip, staff] = await Promise.all([
      getJobCardStageSlipByScanCode(admin, normalizedCode),
      getStaff(admin).then((members) => members.find((member) => member.id === normalizedStaffId)),
    ]);
    if (!slip) return { success: false, error: "Job card not found." };
    if (slip.talliedAt) return { success: false, error: `Already tallied for ${slip.staffName}. No payroll was added.` };
    if (!staff || staff.status !== "Active") {
      return { success: false, error: "Choose an active staff member." };
    }
    const shopError = await requireStaffSameShopForOrder(slip.orderId, staff.id);
    if (shopError) return { success: false, error: shopError };
    if (slip.staffId && slip.staffId !== staff.id) {
      return { success: false, error: `This printed slip is assigned to ${slip.staffName}. Use that staff member or transfer the job card first.` };
    }

    let tallySlip = slip;
    if (!slip.staffId) {
      const order = await getOrderById(admin, slip.orderId);
      const item = order?.items.find((candidate) => candidate.serialNo === slip.orderItemSerialNo);
      if (!order || !item) return { success: false, error: "Order item for this job card was not found." };
      const wageRate = staffGarmentStageRate(staff, item.garmentTypeId, slip.stage);
      const labourAddOnsTotal = (slip.labourAddOnsSnapshot ?? []).reduce(
        (sum, addOn) => sum + Number(addOn.amount ?? 0),
        0
      );
      const perUnitWageAmount = wageRate + labourAddOnsTotal;
      // Assign every internal garment unit first. The operation is idempotent
      // for the same worker/stage, so an interrupted batch can be retried
      // while the still-unassigned slip remains safely unpayable.
      for (let offset = 0; offset < slip.quantity; offset += 1) {
        await assignJobCardForStageSlip(admin, {
          orderId: slip.orderId,
          orderItemSerialNo: slip.orderItemSerialNo,
          unitNo: slip.unitNo + offset,
          taskType: slip.stage,
          staffId: staff.id,
          wageRate,
          wageAmount: perUnitWageAmount,
          notes: slip.notes,
        });
      }

      const assignedSlip = await assignJobCardStageSlipForTally(admin, {
        id: slip.id,
        staffId: staff.id,
        staffName: staff.name,
        wageRate,
        wageAmount: perUnitWageAmount * slip.quantity,
      });
      if (!assignedSlip) {
        const latest = await getJobCardStageSlipById(admin, slip.id);
        return latest?.talliedAt
          ? { success: false, error: `Already tallied for ${latest.staffName}. No payroll was added.` }
          : { success: false, error: "This job card is no longer available for tally." };
      }
      tallySlip = assignedSlip;
    }

    const result = await confirmStageSlipTally(tallySlip, guard.userId);
    if (result.success) return result;
    const latest = await getJobCardStageSlipById(admin, slip.id);
    if (latest?.talliedAt) {
      return { success: false, error: `Already tallied for ${latest.staffName}. No payroll was added.` };
    }
    return result;
  } catch (error) {
    return { success: false, error: errorMessage(error, "Failed to tally the scanned job card.") };
  }
}

export async function getQuickTallyStaffAction(): Promise<Staff[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return [];
  const context = await getServerCallerContext(supabase);
  return (await getStaff(supabase)).filter(
    (staff) =>
      staff.status === "Active" &&
      (!context?.shopId || !staff.shopId || staff.shopId === context.shopId)
  );
}

export async function markOrderReadyWithBinAction(
  orderId: string,
  deliveryBin?: string
): Promise<ActionResult<Order>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!orderId) return { success: false, error: "Order is required." };

  const { error } = await supabase.rpc("mark_order_ready_with_bin", {
    p_order_id: orderId,
    p_delivery_bin: deliveryBin?.trim() || null,
  });
  if (error) return { success: false, error: errorMessage(error, "Could not mark the order ready.") };
  const order = await getOrderById(supabase, orderId);
  return order ? { success: true, data: order } : { success: false, error: "Order not found." };
}

/** Creates/reuses one Cutting then one Stitching slip for every garment unit. */
export async function createProductionPrintBundleAction(
  orderIds: string[]
): Promise<ActionResult<JobCardStageSlip[]>> {
  const uniqueOrderIds = Array.from(new Set(orderIds.filter(Boolean)));
  if (uniqueOrderIds.length === 0) return { success: false, error: "Select at least one order." };

  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.printJobCard");
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    const slips: JobCardStageSlip[] = [];
    for (const orderId of uniqueOrderIds) {
      const order = await getOrderById(supabase, orderId);
      if (!order || order.status === "Cancelled" || order.status === "Delivered") continue;
      for (const item of order.items) {
        const quantity = Math.max(1, item.qty);
        for (const stage of ["Cutting", "Stitching"] as const) {
          const input = {
            orderId,
            orderItemSerialNo: item.serialNo,
            unitNo: 1,
            quantity,
            stage,
          };
          const existing = await getPendingJobCardStageSlip(supabase, input);
          slips.push(existing ?? await createJobCardStageSlip(supabase, input));
        }
      }
    }
    return { success: true, data: slips };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Failed to create the production print bundle.") };
  }
}

export async function getProductionPrintBundleAction(ids: string[]): Promise<JobCardStageSlip[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.printJobCard");
  if (!guard.ok) return [];
  const slips = await getJobCardStageSlipsByIds(supabase, Array.from(new Set(ids.filter(Boolean))));
  const orderIds = Array.from(new Set(slips.map((slip) => slip.orderId)));
  const orders = await Promise.all(orderIds.map((orderId) => getOrderById(supabase, orderId)));
  const ordersById = new Map(orders.filter(Boolean).map((order) => [order!.id, order!]));
  return slips.map((slip) => {
    const item = ordersById
      .get(slip.orderId)
      ?.items.find((candidate) => candidate.serialNo === slip.orderItemSerialNo);
    const color = item?.size?.trim();
    return color ? { ...slip, garmentType: `${item!.particular} · ${color}` } : slip;
  });
}

async function confirmStageSlipTally(
  slip: JobCardStageSlip,
  performedBy: string
): Promise<ActionResult<JobCardStageSlip>> {
  if (slip.talliedAt) return { success: true, data: slip };
  if (!slip.staffId) {
    return { success: false, error: "This stage card has no worker assigned." };
  }

  try {
    const admin = createAdminClient();
    const todayIso = new Date().toISOString().slice(0, 10);
    const finalStage = await getFinalWorkStage(admin);
    const perUnitWageAmount = slip.quantity > 0
      ? slip.wageAmount / slip.quantity
      : slip.wageAmount;
    const completions = [];
    for (let offset = 0; offset < slip.quantity; offset += 1) {
      completions.push(await completeJobCardStageSlip(
        admin,
        {
          orderId: slip.orderId,
          orderItemSerialNo: slip.orderItemSerialNo,
          unitNo: slip.unitNo + offset,
          taskType: slip.stage,
          staffId: slip.staffId,
          wageRate: slip.wageRate,
          wageAmount: perUnitWageAmount,
          // This shop moves cards to Ready manually after Stitching. A final
          // stage is therefore optional; when one is configured it still keeps
          // the established automatic-ready behaviour.
          isFinalStage: finalStage?.stageKey === slip.stage,
        },
        todayIso
      ));
    }
    const completion = completions[0];
    if (!completion) return { success: false, error: "This job card has no garment units." };
    await syncOrderStatusFromJobCards(admin, completion.orderId);

    for (const unitCompletion of completions) {
      if (!unitCompletion.alreadyCompleted) {
        await logJobCardActivityBestEffort({
          jobCardId: unitCompletion.jobCardId,
          orderId: unitCompletion.orderId,
          actionType: unitCompletion.toStage === "Ready" ? "Completed" : "Stage Moved",
          fromStage: unitCompletion.fromStage,
          toStage: unitCompletion.toStage,
          assignedStaffId: slip.staffId,
          notes: `Completed by batch tally scan: ${slip.slipCode}`,
          performedBy,
        });
      }
    }

    const tallied = await markJobCardStageSlipTallied(admin, slip.id);
    return tallied
      ? { success: true, data: tallied }
      : { success: false, error: "Job card not found." };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: errorMessage(error, "Failed to complete the scanned job card stage."),
    };
  }
}

export async function getTalliedJobCardStageSlipsAction(): Promise<JobCardStageSlip[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return [];
  return withPerformanceContext("getTalliedJobCardStageSlipsAction", () => profileDataFunction({ functionName: "getTalliedJobCardStageSlips", tableOrRpc: "job_card_stage_slips" }, () => getTalliedJobCardStageSlips(supabase)));
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
    if (!before) return { success: false, error: "Job card not found." };
    const shopError = await requireStaffSameShopForOrder(before.orderId, data.assignedStaffId);
    if (shopError) return { success: false, error: shopError };
    await assignJobCard(supabase, id, data);
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

export interface JobCardTransferInput {
  newStaffId: string;
  reason: string;
  recordAdvance: boolean;
  advanceAmount?: number;
  advancePaymentMode?: PaymentMode;
  advanceNotes?: string;
}

export async function transferJobCardAction(
  id: string,
  data: JobCardTransferInput
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!data.newStaffId.trim()) return { success: false, error: "Select the new tailor." };
  if (!data.reason.trim()) return { success: false, error: "Transfer reason is required." };
  if (data.recordAdvance) {
    if (!Number.isFinite(data.advanceAmount) || Number(data.advanceAmount) <= 0) {
      return { success: false, error: "Enter the advance amount given to the previous tailor." };
    }
    if (!data.advancePaymentMode || !VALID_PAYMENT_MODES.has(data.advancePaymentMode)) {
      return { success: false, error: "Select how the advance was paid." };
    }
  }

  try {
    const admin = createAdminClient();
    const before = await getJobCardActivitySnapshot(admin, id);
    if (!before?.assignedStaffId) {
      return { success: false, error: "This job card has no tailor to transfer." };
    }
    const shopError = await requireStaffSameShopForOrder(before.orderId, data.newStaffId);
    if (shopError) return { success: false, error: shopError };
    const transfer = await transferJobCard(admin, id, data.newStaffId);
    const staff = await getStaff(admin);
    const previousStaffName =
      staff.find((member) => member.id === transfer.previousStaffId)?.name ?? "previous tailor";
    const newStaffName =
      staff.find((member) => member.id === transfer.newStaffId)?.name ?? "new tailor";
    if (data.recordAdvance) {
      await recordStaffPayment(admin, {
        staffId: transfer.previousStaffId,
        date: new Date().toISOString().slice(0, 10),
        description: `Job card advance before transfer (${id})`,
        amount: Number(data.advanceAmount),
        paymentMode: data.advancePaymentMode!,
        notes: data.advanceNotes?.trim() || `Transferred to another tailor. ${data.reason.trim()}`,
      });
    }
    const advanceNote = data.recordAdvance
      ? ` Advance of ₹${Number(data.advanceAmount).toFixed(2)} recorded against the previous tailor's payroll.`
      : "";
    await logJobCardActivityBestEffort({
      jobCardId: id,
      orderId: transfer.orderId,
      actionType: "Transferred",
      fromStage: transfer.currentStage,
      toStage: transfer.currentStage,
      assignedStaffId: transfer.newStaffId,
      notes: `Transferred from ${previousStaffName} to ${newStaffName}. Reason: ${data.reason.trim()}.${advanceNote}`,
      performedBy: guard.userId,
    });
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return { success: false, error: errorMessage(error, "Failed to transfer job card.") };
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
