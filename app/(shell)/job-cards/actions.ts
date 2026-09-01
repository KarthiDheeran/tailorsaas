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
  createJobCardStageSlipForOrder,
  assignJobCardStageSlipForTally,
  getJobCardStageSlipsForOrders,
  getJobCardStageSlipsByIds,
  getJobCardStageSlipById,
  getJobCardStageSlipByScanCode,
  getTalliedJobCardStageSlips,
  isMissingJobCardStageSlipsSchemaError,
  markJobCardStageSlipPartiallyTallied,
  markJobCardStageSlipTallied,
  type CreateJobCardStageSlipInput,
  type JobCardStageSlip,
} from "@/lib/data/job-card-stage-slips-db";
import {
  getActiveOrderIds,
  getOrderById,
  getProductionPrintOrderRows,
  getOrdersByIds,
} from "@/lib/data/orders-db";
import {
  filterStaffOptionsForShop,
  getStaffById,
  getStaffOptions,
  recordStaffPayment,
  getWorkAssignments,
  getWorkAssignmentsForStaff,
  type StaffOption,
} from "@/lib/data/staff-db";
import {
  adjustInventoryStock,
  createCustomerFabric,
  getCustomerFabrics,
  getInventoryItems,
  getInventoryItemsByIds,
  getInventoryMovements,
  isMissingInventorySchemaError,
  type CustomerFabricInput,
  type StockAdjustmentInput,
} from "@/lib/data/inventory-db";
import { getActiveGarmentTypes, getActiveWorkStages, getFinalWorkStage } from "@/lib/data/catalog-db";
import type { JobCard, JobCardStage } from "@/lib/job-cards";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import type {
  CustomerFabric,
  InventoryMovement,
  InventoryItem,
  InventoryUnit,
  JobCardActivityLog,
  Order,
  PaymentMode,
  TaskPriority,
  TaskType,
  WorkAssignment,
} from "@/lib/types";
import { inventoryUnits } from "@/lib/constants";
import { GARMENT_SECTIONS, type CatalogGarmentType, type ProductionPrintGroup } from "@/lib/catalog";
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
const STAGE_SLIP_DISPLAY_ORDER: TaskType[] = [
  "Cutting",
  "Stitching",
  "Embroidery",
  "Finishing",
  "Alteration",
  "Ironing/Packing",
  "Delivery",
  "Measurement",
];
const COMPATIBILITY_STAGE_SLIP_NOTE_PREFIX = "[compat-batch-unit]";

function isCompatibilityStageSlip(slip: JobCardStageSlip) {
  return slip.notes?.startsWith(COMPATIBILITY_STAGE_SLIP_NOTE_PREFIX) ?? false;
}

function callerStaffScopeShopId(context: Awaited<ReturnType<typeof getServerCallerContext>>): string | null | undefined {
  if (!context?.shopId) return context?.shopId;
  const canManageAcrossSections =
    hasPermission(context.permissions, "staff.manage") &&
    GARMENT_SECTIONS.every((section) => context.allowedOrderSections.includes(section));
  return canManageAcrossSections ? undefined : context.shopId;
}

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
    getStaffById(admin, staffId),
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
  staff: StaffOption[];
  assignments: WorkAssignment[];
  customerFabrics: CustomerFabric[] | null;
  inventoryItems: InventoryItem[] | null;
  inventoryMovements: InventoryMovement[] | null;
}

export interface JobCardInventoryContext {
  customerFabrics: CustomerFabric[] | null;
  inventoryItems: InventoryItem[] | null;
  inventoryMovements: InventoryMovement[] | null;
}

export interface JobCardTallyPageData {
  slips: JobCardStageSlip[];
  staff: StaffOption[];
}

export async function getProductionPrintOrdersAction(): Promise<Order[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) return [];
  return profileDataFunction(
    { functionName: "getProductionPrintOrders", tableOrRpc: "orders,order_items" },
    () => getProductionPrintOrderRows(supabase)
  );
}

function attachStageSlipCodesToJobCards(
  cards: JobCard[] | null,
  slips: JobCardStageSlip[]
): JobCard[] | null {
  if (!cards || cards.length === 0 || slips.length === 0) return cards;
  const slipRefsByCardId = new Map<string, { slipCode: string; stage: TaskType }[]>();
  const cardsByOrderLine = new Map<string, JobCard[]>();
  for (const card of cards) {
    const key = `${card.orderId}:${card.item.serialNo}`;
    const current = cardsByOrderLine.get(key) ?? [];
    current.push(card);
    cardsByOrderLine.set(key, current);
  }
  for (const slip of slips) {
    const firstUnit = slip.unitNo;
    const lastUnit = slip.unitNo + Math.max(1, slip.quantity) - 1;
    const matchingCards =
      cardsByOrderLine.get(`${slip.orderId}:${slip.orderItemSerialNo}`) ?? [];
    for (const card of matchingCards) {
      if (card.unitNo < firstUnit || card.unitNo > lastUnit) continue;
      const current = slipRefsByCardId.get(card.id) ?? [];
      if (!current.some((entry) => entry.slipCode === slip.slipCode)) {
        current.push({ slipCode: slip.slipCode, stage: slip.stage });
      }
      slipRefsByCardId.set(card.id, current);
    }
  }
  if (slipRefsByCardId.size === 0) return cards;
  return cards.map((card) => ({
    ...card,
    stageSlipCode: slipRefsByCardId.get(card.id)?.[0]?.slipCode ?? card.stageSlipCode,
    stageSlipCodes: slipRefsByCardId.get(card.id)?.map((entry) => entry.slipCode) ?? card.stageSlipCodes,
    stageSlipRefs:
      slipRefsByCardId
        .get(card.id)
        ?.slice()
        .sort(
          (a, b) =>
            STAGE_SLIP_DISPLAY_ORDER.indexOf(a.stage) -
              STAGE_SLIP_DISPLAY_ORDER.indexOf(b.stage) ||
            a.slipCode.localeCompare(b.slipCode)
        ) ?? card.stageSlipRefs,
  }));
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
    const staffList = await getStaffOptions(supabase).catch(() => []);
    const [cards, slips] = await Promise.all([
      getJobCards(supabase, todayIso, staffList, { assignedStaffId }),
      getTalliedJobCardStageSlips(supabase),
    ]);
    return attachStageSlipCodesToJobCards(cards, slips.filter((slip) => !isCompatibilityStageSlip(slip)));
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

  const dataClient = createAdminClient();
  const staffRead = getStaffOptions(dataClient);
  const staffForCardsRaw = canViewStaff ? await staffRead : await staffRead.catch(() => []);
  const staffForCards = filterStaffOptionsForShop(staffForCardsRaw, callerStaffScopeShopId(context));
  const visibleStaff = assignedStaffId
    ? staffForCards.filter((staff) => staff.id === assignedStaffId)
    : staffForCards;
  const [jobCards, stageSlips, orders, staff, assignments, inventory] = await Promise.all([
    profileDataFunction({ functionName: "getJobCards", tableOrRpc: "job_cards" }, () => getJobCards(supabase, todayIso, visibleStaff, { assignedStaffId })).catch((error) => {
      if (isMissingJobCardsSchemaError(error)) return null;
      throw error;
    }),
    profileDataFunction({ functionName: "getTalliedJobCardStageSlips", tableOrRpc: "job_card_stage_slips" }, () => getTalliedJobCardStageSlips(supabase)),
    canViewOrders && !assignedStaffId
      ? profileDataFunction(
          { functionName: "getProductionPrintOrderRows", tableOrRpc: "orders,order_items" },
          () => getProductionPrintOrderRows(supabase)
        )
      : Promise.resolve([]),
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
    jobCards: attachStageSlipCodesToJobCards(
      jobCards,
      stageSlips.filter((slip) => !isCompatibilityStageSlip(slip))
    ),
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

export async function getProductionPrintGarmentsAction(): Promise<CatalogGarmentType[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.printJobCard");
  if (!guard.ok) return [];
  return getActiveGarmentTypes(supabase);
}

export interface QuickTallyPreview {
  slip: JobCardStageSlip;
  pendingQuantity: number;
  completedQuantity: number;
  basePerUnitWageAmount: number;
  labourPerUnitWageAmount: number;
  perUnitWageAmount: number;
  staffName: string;
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

  return confirmQuickTallyJobCardStageSlipAction({
    code: normalizedCode,
    staffId: normalizedStaffId,
    completedQuantity: 0,
  });
}

export interface QuickTallyBatchResult {
  code: string;
  result: ActionResult<JobCardStageSlip>;
}

/**
 * Processes a captured scanner chunk in one client/server request. Items stay
 * ordered deliberately: slips from the same order can advance shared job-card
 * state, so concurrent writes would trade speed for payroll races.
 */
export async function quickTallyJobCardStageSlipBatchAction(
  codes: string[],
  staffId: string
): Promise<QuickTallyBatchResult[]> {
  const normalizedStaffId = staffId.trim();
  if (!normalizedStaffId) return [];

  const uniqueCodes: string[] = [];
  const seen = new Set<string>();
  for (const rawCode of codes.slice(0, 25)) {
    const code = rawCode.trim();
    const key = code.toUpperCase();
    if (!code || seen.has(key)) continue;
    seen.add(key);
    uniqueCodes.push(code);
  }

  const results: QuickTallyBatchResult[] = [];
  for (const code of uniqueCodes) {
    results.push({
      code,
      result: await quickTallyJobCardStageSlipAction(code, normalizedStaffId),
    });
  }
  return results;
}

export async function previewQuickTallyJobCardStageSlipAction(
  code: string,
  staffId: string
): Promise<ActionResult<QuickTallyPreview>> {
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
      getStaffById(admin, normalizedStaffId),
    ]);
    if (!slip) return { success: false, error: "Job card not found." };
    if (!staff || staff.status !== "Active") return { success: false, error: "Choose an active staff member." };
    const shopError = await requireStaffSameShopForOrder(slip.orderId, staff.id);
    if (shopError) return { success: false, error: shopError };
    if (slip.staffId && slip.staffId !== staff.id) {
      return { success: false, error: `This printed slip is assigned to ${slip.staffName}. Use that staff member or transfer the job card first.` };
    }
    const pendingQuantity = Math.max(0, slip.pendingQuantity);
    if (pendingQuantity <= 0) {
      return { success: false, error: `Already tallied for ${slip.staffName}. No payroll was added.` };
    }

    let basePerUnitWageAmount = slip.wageRate;
    const labourPerUnitWageAmount = (slip.labourAddOnsSnapshot ?? []).reduce(
      (sum, addOn) => sum + Number(addOn.amount ?? 0),
      0
    );
    if (!slip.staffId) {
      const order = await getOrderById(admin, slip.orderId);
      const item = order?.items.find((candidate) => candidate.serialNo === slip.orderItemSerialNo);
      if (!order || !item) return { success: false, error: "Order item for this job card was not found." };
      const wageRate = staffGarmentStageRate(staff, item.garmentTypeId, slip.stage);
      basePerUnitWageAmount = wageRate;
    }
    const perUnitWageAmount = basePerUnitWageAmount + labourPerUnitWageAmount;

    return {
      success: true,
      data: {
        slip: { ...slip, staffId: slip.staffId ?? staff.id, staffName: staff.name },
        pendingQuantity,
        completedQuantity: pendingQuantity,
        basePerUnitWageAmount,
        labourPerUnitWageAmount,
        perUnitWageAmount,
        staffName: staff.name,
      },
    };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Failed to load the scanned job card.") };
  }
}

export async function confirmQuickTallyJobCardStageSlipAction(input: {
  code: string;
  staffId: string;
  completedQuantity: number;
  extraAmount?: number;
  notes?: string;
}): Promise<ActionResult<JobCardStageSlip>> {
  const normalizedCode = input.code.trim();
  const normalizedStaffId = input.staffId.trim();
  const requestedCompletedQuantity = Math.floor(Number(input.completedQuantity));
  const extraAmount = Math.max(0, Number(input.extraAmount ?? 0) || 0);
  if (!normalizedCode) return { success: false, error: "Scan a job card barcode." };
  if (!normalizedStaffId) return { success: false, error: "Select a staff member before scanning." };
  if (!Number.isInteger(requestedCompletedQuantity)) {
    return { success: false, error: "Completed quantity must be at least 1." };
  }

  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    const admin = createAdminClient();
    const [slip, staff] = await Promise.all([
      getJobCardStageSlipByScanCode(admin, normalizedCode),
      getStaffById(admin, normalizedStaffId),
    ]);
    if (!slip) return { success: false, error: "Job card not found." };
    if (!staff || staff.status !== "Active") return { success: false, error: "Choose an active staff member." };
    const pendingQuantity = Math.max(0, slip.pendingQuantity);
    if (pendingQuantity <= 0) {
      return { success: false, error: `Already tallied for ${slip.staffName}. No payroll was added.` };
    }
    const completedQuantity = requestedCompletedQuantity > 0 ? requestedCompletedQuantity : pendingQuantity;
    if (completedQuantity < 1) {
      return { success: false, error: "Completed quantity must be at least 1." };
    }
    if (completedQuantity > pendingQuantity) {
      return { success: false, error: `Only ${pendingQuantity} item(s) are pending for this slip.` };
    }
    const shopError = await requireStaffSameShopForOrder(slip.orderId, staff.id);
    if (shopError) return { success: false, error: shopError };
    if (slip.staffId && slip.staffId !== staff.id) {
      return { success: false, error: `This printed slip is assigned to ${slip.staffName}. Use that staff member or transfer the job card first.` };
    }

    const order = await getOrderById(admin, slip.orderId);
    const item = order?.items.find((candidate) => candidate.serialNo === slip.orderItemSerialNo);
    if (!order || !item) return { success: false, error: "Order item for this job card was not found." };
    await syncJobCardsForOrder(supabase, order.id);

    const wageRate = slip.staffId ? slip.wageRate : staffGarmentStageRate(staff, item.garmentTypeId, slip.stage);
    const labourAddOnsTotal = (slip.labourAddOnsSnapshot ?? []).reduce(
      (sum, addOn) => sum + Number(addOn.amount ?? 0),
      0
    );
    const perUnitWageAmount = wageRate + labourAddOnsTotal;
    let tallySlip = slip;
    if (!slip.staffId) {
      const assignedSlip = await assignJobCardStageSlipForTally(admin, {
        id: slip.id,
        staffId: staff.id,
        staffName: staff.name,
        wageRate,
        wageAmount: perUnitWageAmount * slip.quantity,
      });
      if (!assignedSlip) return { success: false, error: "This job card is no longer available for tally." };
      tallySlip = assignedSlip;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const finalStage = await getFinalWorkStage(admin);
    const startUnitNo = tallySlip.unitNo + tallySlip.talliedQuantity;
    const scanLabel = requestedCompletedQuantity > 0 || extraAmount > 0 ? "partial tally scan" : "quick tally scan";
    const completions = [];
    for (let offset = 0; offset < completedQuantity; offset += 1) {
      const unitNo = startUnitNo + offset;
      const unitWageAmount = perUnitWageAmount + (offset === 0 ? extraAmount : 0);
      await assignJobCardForStageSlip(admin, {
        orderId: tallySlip.orderId,
        orderItemSerialNo: tallySlip.orderItemSerialNo,
        unitNo,
        taskType: tallySlip.stage,
        staffId: staff.id,
        wageRate,
        wageAmount: unitWageAmount,
        notes: tallySlip.notes,
        allowReadyBackfill: true,
      });
      completions.push(await completeJobCardStageSlip(
        admin,
        {
          slipId: tallySlip.id,
          orderId: tallySlip.orderId,
          orderItemSerialNo: tallySlip.orderItemSerialNo,
          unitNo,
          taskType: tallySlip.stage,
          staffId: staff.id,
          wageRate,
          wageAmount: unitWageAmount,
          isFinalStage: finalStage?.stageKey === tallySlip.stage,
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
          assignedStaffId: staff.id,
          notes: `Completed by ${scanLabel}: ${tallySlip.slipCode} (${completedQuantity} item${completedQuantity === 1 ? "" : "s"}${extraAmount > 0 ? `, extra ${extraAmount}` : ""})`,
          performedBy: guard.userId,
        });
      }
    }
    const tallied = await markJobCardStageSlipPartiallyTallied(admin, {
      id: tallySlip.id,
      completedQuantity,
      wageAmount: perUnitWageAmount * completedQuantity + extraAmount,
      extraAmount,
      notes: input.notes,
    });
    return tallied
      ? { success: true, data: { ...tallied, wageAmount: perUnitWageAmount * completedQuantity + extraAmount } }
      : { success: false, error: "Job card not found." };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Failed to tally the scanned job card.") };
  }
}

export async function getQuickTallyStaffAction(): Promise<StaffOption[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return [];
  const context = await getServerCallerContext(supabase);
  const dataClient = createAdminClient();
  return filterStaffOptionsForShop(
    await getStaffOptions(dataClient, { activeOnly: true }),
    callerStaffScopeShopId(context)
  );
}

export async function getJobCardTallyPageDataAction(
  fromIso: string,
  toIso: string
): Promise<JobCardTallyPageData> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { slips: [], staff: [] };
  if (!ISO_DATE.test(fromIso) || !ISO_DATE.test(toIso)) {
    throw new Error("A valid tally date range is required.");
  }
  const context = await getServerCallerContext(supabase);
  const dataClient = createAdminClient();
  const [slips, staff] = await Promise.all([
    profileDataFunction(
      { functionName: "getTalliedJobCardStageSlips", tableOrRpc: "job_card_stage_slips" },
      () => getTalliedJobCardStageSlips(supabase, { fromIso, toIso })
    ),
    getStaffOptions(dataClient, { activeOnly: true }),
  ]);
  return {
    slips,
    staff: filterStaffOptionsForShop(staff, callerStaffScopeShopId(context)),
  };
}

export async function getTalliedJobCardStageSlipsForRangeAction(
  fromIso: string,
  toIso: string
): Promise<JobCardStageSlip[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return [];
  if (!ISO_DATE.test(fromIso) || !ISO_DATE.test(toIso)) {
    throw new Error("A valid tally date range is required.");
  }
  return withPerformanceContext("getTalliedJobCardStageSlipsForRangeAction", async () =>
    profileDataFunction(
      { functionName: "getTalliedJobCardStageSlips", tableOrRpc: "job_card_stage_slips" },
      () => getTalliedJobCardStageSlips(supabase, { fromIso, toIso })
    )
  );
}

export async function getJobCardsForOrderAction(
  orderId: string,
  todayIso: string
): Promise<JobCard[] | null> {
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
    const staffList = await getStaffOptions(supabase).catch(() => []);
    const [cards, slips] = await Promise.all([
      getJobCards(supabase, todayIso, staffList, { assignedStaffId, orderId }),
      getTalliedJobCardStageSlips(supabase),
    ]);
    return attachStageSlipCodesToJobCards(
      cards,
      slips.filter((slip) => slip.orderId === orderId && !isCompatibilityStageSlip(slip))
    );
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) return null;
    throw error;
  }
}

export async function markOrderReadyWithBinAction(
  orderId: string,
  deliveryBin?: string
): Promise<ActionResult<Order>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!orderId) return { success: false, error: "Order is required." };

  const orderBefore = await getOrderById(supabase, orderId);
  if (!orderBefore) return { success: false, error: "Order not found." };
  if (orderBefore.status === "Cancelled" || orderBefore.status === "Delivered") {
    return { success: false, error: "Cancelled or delivered orders cannot be marked ready." };
  }

  try {
    const { error } = await supabase.rpc("mark_order_ready_with_bin", {
      p_order_id: orderId,
      p_delivery_bin: deliveryBin?.trim() || null,
    });
    if (error) throw error;
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not mark the order ready.") };
  }

  const order = await getOrderById(supabase, orderId);
  return order ? { success: true, data: order } : { success: false, error: "Order not found." };
}

/** Creates/reuses one Cutting then one Stitching slip for every garment unit. */
export async function createProductionPrintBundleAction(
  orderIds: string[],
  productionGroup: ProductionPrintGroup | "All" = "All"
): Promise<ActionResult<JobCardStageSlip[]>> {
  const uniqueOrderIds = Array.from(new Set(orderIds.filter(Boolean)));
  if (uniqueOrderIds.length === 0) return { success: false, error: "Select at least one order." };

  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.printJobCard");
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    const orders = await getOrdersByIds(supabase, uniqueOrderIds);
    const garments = await getActiveGarmentTypes(supabase);
    const garmentsById = new Map(garments.map((garment) => [garment.id, garment]));
    const garmentsByName = new Map(
      garments.map((garment) => [garment.name.trim().toLowerCase(), garment])
    );
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    const existingSlips = await getJobCardStageSlipsForOrders(
      supabase,
      orders.map((order) => order.id)
    );
    const existingByBundleKey = new Map(
      existingSlips.map((slip) => [
        `${slip.orderId}:${slip.orderItemSerialNo}:${slip.unitNo}:${slip.quantity}:${slip.stage}`,
        slip,
      ])
    );
    const bundleInputs = orders
      .filter((order) => order.status !== "Cancelled" && order.status !== "Delivered")
      .flatMap((order) =>
        order.items.filter((item) => {
          if (productionGroup === "All") return true;
          const garment =
            (item.garmentTypeId ? garmentsById.get(item.garmentTypeId) : undefined) ??
            garmentsByName.get(item.particular.trim().toLowerCase());
          return garment?.productionPrintGroup === productionGroup;
        }).flatMap((item) => {
          const quantity = Math.max(1, item.qty);
          return (["Cutting", "Stitching"] as const).map((stage) => ({
            orderId: order.id,
            orderItemSerialNo: item.serialNo,
            unitNo: 1,
            quantity,
            stage,
          }));
        })
      );
    const createdByBundleKey = new Map<string, JobCardStageSlip>();
    const missingInputs = bundleInputs.filter((input) => {
      const key = `${input.orderId}:${input.orderItemSerialNo}:${input.unitNo}:${input.quantity}:${input.stage}`;
      return !existingByBundleKey.has(key);
    });
    const createdSlips = await Promise.all(
      missingInputs.map((input) => {
        const order = ordersById.get(input.orderId);
        if (!order) throw new Error("Order not found.");
        return createJobCardStageSlipForOrder(supabase, order, input);
      })
    );
    for (const slip of createdSlips) {
      createdByBundleKey.set(
        `${slip.orderId}:${slip.orderItemSerialNo}:${slip.unitNo}:${slip.quantity}:${slip.stage}`,
        slip
      );
    }
    const slips: JobCardStageSlip[] = [];
    for (const input of bundleInputs) {
      const key = `${input.orderId}:${input.orderItemSerialNo}:${input.unitNo}:${input.quantity}:${input.stage}`;
      const slip = existingByBundleKey.get(key) ?? createdByBundleKey.get(key);
      if (slip) slips.push(slip);
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
  const orders = await getOrdersByIds(supabase, orderIds);
  const ordersById = new Map(orders.map((order) => [order.id, order]));
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
          slipId: slip.id,
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
    if (tallied) {
      await createBatchUnitCompatibilitySlips(admin, tallied);
    }
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

async function createBatchUnitCompatibilitySlips(
  supabase: ReturnType<typeof createAdminClient>,
  slip: JobCardStageSlip
) {
  const quantity = Math.max(1, Number(slip.quantity) || 1);
  if (quantity <= 1 || !slip.talliedAt) return;

  const units = Array.from({ length: quantity - 1 }, (_, index) => slip.unitNo + index + 1);
  const { data: existingRows, error: existingError } = await supabase
    .from("job_card_stage_slips")
    .select("unit_no")
    .eq("order_id", slip.orderId)
    .eq("order_item_serial_no", slip.orderItemSerialNo)
    .eq("stage", slip.stage)
    .in("unit_no", units)
    .not("tallied_at", "is", null);
  if (existingError) throw existingError;

  const existingUnits = new Set(
    ((existingRows ?? []) as { unit_no: number | null }[])
      .map((row) => row.unit_no)
      .filter((unit): unit is number => typeof unit === "number")
  );
  const rows = units
    .filter((unitNo) => !existingUnits.has(unitNo))
    .map((unitNo) => ({
      order_id: slip.orderId,
      order_item_serial_no: slip.orderItemSerialNo,
      unit_no: unitNo,
      order_number: slip.orderNumber,
      customer_id: slip.customerId,
      customer_snapshot: slip.customerSnapshot ?? null,
      garment_type: slip.garmentType,
      quantity: 1,
      stage: slip.stage,
      staff_id: slip.staffId ?? null,
      staff_name: slip.staffName,
      wage_rate: 0,
      wage_amount: 0,
      measurements_snapshot: slip.measurementsSnapshot ?? null,
      field_schema_snapshot: slip.fieldSchemaSnapshot ?? null,
      add_ons_snapshot: slip.addOnsSnapshot ?? null,
      labour_add_ons_snapshot: slip.labourAddOnsSnapshot ?? null,
      notes: `${COMPATIBILITY_STAGE_SLIP_NOTE_PREFIX} ${slip.slipCode}`,
      printed_at: slip.printedAt,
      tallied_at: slip.talliedAt,
    }));

  if (rows.length === 0) return;
  const { error } = await supabase.from("job_card_stage_slips").insert(rows);
  if (error) throw error;
}

export async function getTalliedJobCardStageSlipsAction(): Promise<JobCardStageSlip[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return [];
  return withPerformanceContext("getTalliedJobCardStageSlipsAction", async () => {
    const slips = await profileDataFunction({ functionName: "getTalliedJobCardStageSlips", tableOrRpc: "job_card_stage_slips" }, () => getTalliedJobCardStageSlips(supabase));
    return slips.filter((slip) => !isCompatibilityStageSlip(slip));
  });
}

export async function getJobCardInventoryContextAction(
  input: { orderId: string; jobCardId: string; includeStockItems?: boolean }
): Promise<JobCardInventoryContext> {
  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (!hasAnyPermission(permissions, ["inventory.view", "inventory.manage"])) {
    return { customerFabrics: [], inventoryItems: [], inventoryMovements: [] };
  }

  try {
    const [customerFabrics, inventoryMovements] = await Promise.all([
      getCustomerFabrics(supabase, { orderId: input.orderId }),
      getInventoryMovements(supabase, undefined, { jobCardId: input.jobCardId }),
    ]);
    const movementItemIds = inventoryMovements.map((movement) => movement.itemId);
    const inventoryItems = input.includeStockItems
      ? await getInventoryItems(supabase)
      : await getInventoryItemsByIds(supabase, movementItemIds);

    return { customerFabrics, inventoryItems, inventoryMovements };
  } catch (error) {
    if (isMissingInventorySchemaError(error)) {
      return { customerFabrics: null, inventoryItems: null, inventoryMovements: null };
    }
    throw error;
  }
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
    const staff = await getStaffOptions(admin);
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
    const activeOrderIds = await getActiveOrderIds(supabase);
    for (const orderId of activeOrderIds) {
      await syncJobCardsForOrder(supabase, orderId);
    }
    return { success: true, data: { synced: activeOrderIds.length } };
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
