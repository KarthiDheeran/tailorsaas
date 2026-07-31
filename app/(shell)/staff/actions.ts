"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getServerCallerContext,
  requireServerPermission,
} from "@/lib/auth/require-server-permission";
import {
  createStaff,
  createWorkAssignment,
  getStaff,
  getStaffById,
  getStaffPayments,
  getStaffPaymentsForStaff,
  getStaffWorkEarnings,
  getWorkAssignmentAssignedStaffId,
  getWorkAssignments,
  getWorkAssignmentsForStaff,
  recordStaffPayment,
  updateStaff,
  updateWorkAssignment,
} from "@/lib/data/staff-db";
import {
  getJobCards,
  isMissingJobCardsSchemaError,
} from "@/lib/data/job-cards-db";
import { getTalliedJobCardStageSlips } from "@/lib/data/job-card-stage-slips-db";
import { getActiveWorkStages, getAllGarmentTypes } from "@/lib/data/catalog-db";
import {
  createExpense,
  isMissingExpensesSchemaError,
} from "@/lib/data/expenses-db";
import { getAllOrders, getOrderById } from "@/lib/data/orders-db";
import { paymentModes } from "@/lib/constants";
import {
  computeTaskStatus,
  getStaffListRows,
  getWorkQueueRows,
  type StaffListRow,
  type WorkQueueRow,
} from "@/lib/staff";
import { hasPermission } from "@/lib/permissions";
import type { JobCard } from "@/lib/job-cards";
import type {
  Order,
  PaymentMode,
  Staff,
  StaffPayment,
  StaffPaymentType,
  StaffRole,
  StaffStatus,
  StaffWorkEarning,
  TaskPriority,
  TaskType,
  WorkAssignment,
} from "@/lib/types";
import type { JobCardStageSlip } from "@/lib/data/job-card-stage-slips-db";

// ---------------------------------------------------------------------------
// Phase 6D: Staff HR, Work Assignments, and Staff Payments are now real,
// Supabase-backed tables (the pre-existing `staff` table from Phase 1, plus
// new `work_assignments`/`staff_payments` from
// supabase/migrations/0007_staff.sql). Reads AND writes both go through
// lib/data/staff-db.ts — same read-relocation reasoning as every prior
// phase. `paymentModes` (fixed vocabulary) still comes from
// lib/data/stub-data.ts, unchanged; that file's mock staff/work-assignment/
// payment arrays and functions were deleted outright — confirmed via grep
// that nothing outside this module ever referenced them (unlike Customers'
// 6A fork, there was no third consumer like Reports to protect).
//
// createWorkAssignmentAction/updateWorkAssignmentAction/
// recordStaffPaymentAction still have no UI caller (Work Queue/Payments
// tabs remain placeholder text) — migrated anyway for full data-layer
// parity, per explicit instruction. createWorkAssignmentAction now also
// validates that the referenced order and order item actually exist
// (previously only checked that orderId was a non-empty string), since the
// DB-level composite FK would otherwise reject with a raw Postgres error
// instead of a clean validation message.
// ---------------------------------------------------------------------------

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const VALID_ROLES = new Set<StaffRole>([
  "Master Tailor",
  "Cutter",
  "Stitching Staff",
  "Embroidery Staff",
  "Finishing Staff",
  "Alteration Staff",
  "Delivery Staff",
  "Manager",
  "Owner/Admin",
]);
const VALID_STATUSES = new Set<StaffStatus>(["Active", "Inactive", "On Leave"]);
const VALID_PAYMENT_TYPES = new Set<StaffPaymentType>(["Salary", "Per Piece"]);
const VALID_PRIORITIES = new Set<TaskPriority>(["Low", "Normal", "High"]);
const VALID_PAYMENT_MODES = new Set<PaymentMode>(paymentModes);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function tallyDateKey(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function buildStageSlipWorkEarnings(slips: JobCardStageSlip[]): StaffWorkEarning[] {
  return slips
    .filter((slip) => slip.staffId && slip.talliedAt)
    .map((slip) => ({
      id: `stage-slip:${slip.id}`,
      staffId: slip.staffId!,
      jobCardId: slip.id,
      orderId: slip.orderId,
      jobCardNumber: `${slip.orderNumber} - ${slip.garmentType} Unit ${slip.unitNo}`,
      taskType: slip.stage,
      completedDate: tallyDateKey(slip.talliedAt),
      wageRate: slip.wageRate,
      wageAmount: slip.wageAmount,
      createdAt: slip.talliedAt ?? slip.createdAt,
    }));
}

export interface StaffFormInput {
  name: string;
  phone: string;
  role: StaffRole;
  joiningDate: string;
  address: string;
  emergencyContact: string;
  status: StaffStatus;
  notes?: string;
  paymentType: StaffPaymentType;
  baseSalary?: number;
  pieceRates?: Partial<Record<string, number>>;
  garmentStageRates?: Record<string, Partial<Record<string, number>>>;
}

export interface StaffPageData {
  staffRows: StaffListRow[];
  workQueueRows: WorkQueueRow[];
  jobCardQueueRows: JobCard[] | null;
  staffPayments: StaffPayment[];
  staffWorkEarnings: StaffWorkEarning[];
}

function validStageKeys(stages: { stageKey: string }[]) {
  return new Set(stages.map((stage) => stage.stageKey));
}

function validateStaffInput(
  data: StaffFormInput,
  validStages: Set<string>,
  validGarments: Set<string>
): string | null {
  if (!data.name.trim()) return "Name is required.";
  if (!data.phone.trim()) return "Phone is required.";
  if (!VALID_ROLES.has(data.role)) return "Invalid role.";
  if (!ISO_DATE.test(data.joiningDate)) return "A valid joining date is required.";
  if (!VALID_STATUSES.has(data.status)) return "Invalid status.";
  if (!VALID_PAYMENT_TYPES.has(data.paymentType)) return "Invalid payment type.";
  if (
    data.paymentType === "Salary" &&
    data.baseSalary != null &&
    (!Number.isFinite(data.baseSalary) || data.baseSalary < 0)
  ) {
    return "Base salary must be 0 or greater.";
  }
  if (data.paymentType === "Per Piece" && data.pieceRates) {
    for (const [task, rate] of Object.entries(data.pieceRates)) {
      if (!validStages.has(task)) {
        return `Unknown task type: ${task}.`;
      }
      if (rate != null && (!Number.isFinite(rate) || rate < 0)) {
        return `Rate for ${task} must be 0 or greater.`;
      }
    }
  }
  if (data.paymentType === "Per Piece" && data.garmentStageRates) {
    for (const [garmentId, stageRates] of Object.entries(data.garmentStageRates)) {
      if (!garmentId.trim()) return "Invalid garment rate mapping.";
      if (!validGarments.has(garmentId)) return "Unknown garment type in staff rate mapping.";
      for (const [stage, rate] of Object.entries(stageRates ?? {})) {
        if (!validStages.has(stage)) return `Unknown task type: ${stage}.`;
        if (rate != null && (!Number.isFinite(rate) || rate < 0)) {
          return `Rate for ${stage} must be 0 or greater.`;
        }
      }
    }
  }
  return null;
}

export async function getStaffListRowsAction(todayIso: string): Promise<StaffListRow[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.view");
  if (!guard.ok) return [];
  return getStaffListRows(supabase, todayIso);
}

export async function getWorkQueueRowsAction(todayIso: string): Promise<WorkQueueRow[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.view");
  if (!guard.ok) return [];
  return getWorkQueueRows(supabase, todayIso);
}

export async function getStaffPageDataAction(todayIso: string): Promise<StaffPageData> {
  if (!ISO_DATE.test(todayIso)) throw new Error("A valid date is required.");

  const supabase = createServerClient();
  const context = await getServerCallerContext(supabase);
  if (!context || !hasPermission(context.permissions, "staff.view")) {
    return {
      staffRows: [],
      workQueueRows: [],
      jobCardQueueRows: null,
      staffPayments: [],
      staffWorkEarnings: [],
    };
  }

  const canManage = hasPermission(context.permissions, "staff.manage");
  const dataClient = createAdminClient();
  const [
    staffList,
    assignments,
    orders,
    staffPayments,
    staffWorkEarnings,
    talliedStageSlips,
  ] = await Promise.all([
    getStaff(dataClient),
    getWorkAssignments(dataClient),
    getAllOrders(supabase),
    getStaffPayments(dataClient),
    getStaffWorkEarnings(dataClient),
    getTalliedJobCardStageSlips(dataClient),
  ]);

  let jobCardQueueRows: JobCard[] | null = null;
  try {
    jobCardQueueRows = await getJobCards(supabase, todayIso, staffList);
  } catch (error) {
    if (!isMissingJobCardsSchemaError(error)) throw error;
  }

  return {
    staffRows: canManage
      ? jobCardQueueRows
        ? buildJobCardStaffListRows(staffList, jobCardQueueRows, todayIso)
        : buildStaffListRows(staffList, assignments, todayIso)
      : [],
    workQueueRows: buildWorkQueueRows(staffList, assignments, orders, todayIso),
    jobCardQueueRows,
    staffPayments,
    staffWorkEarnings: [...staffWorkEarnings, ...buildStageSlipWorkEarnings(talliedStageSlips)],
  };
}

export async function getStaffAction(): Promise<Staff[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.view");
  if (!guard.ok) return [];
  return getStaff(supabase);
}

export async function getStaffByIdAction(id: string): Promise<Staff | undefined> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.view");
  if (!guard.ok) return undefined;
  return getStaffById(supabase, id);
}

export async function createStaffAction(
  data: StaffFormInput
): Promise<ActionResult<Staff>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const [stages, garments] = await Promise.all([
    getActiveWorkStages(supabase),
    getAllGarmentTypes(supabase),
  ]);
  const validationError = validateStaffInput(
    data,
    validStageKeys(stages),
    new Set(garments.map((garment) => garment.id))
  );
  if (validationError) return { success: false, error: validationError };

  const member = await createStaff(supabase, data);
  return { success: true, data: member };
}

export async function updateStaffAction(
  id: string,
  data: StaffFormInput
): Promise<ActionResult<Staff>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const [stages, garments] = await Promise.all([
    getActiveWorkStages(supabase),
    getAllGarmentTypes(supabase),
  ]);
  const validationError = validateStaffInput(
    data,
    validStageKeys(stages),
    new Set(garments.map((garment) => garment.id))
  );
  if (validationError) return { success: false, error: validationError };

  const member = await updateStaff(supabase, id, data);
  if (!member) return { success: false, error: "Staff member not found." };
  return { success: true, data: member };
}

export interface WorkAssignmentInput {
  orderId: string;
  orderItemSerialNo: number;
  taskType: TaskType;
  assignedStaffId: string;
  assignedDate: string;
  startedDate?: string;
  dueDate: string;
  priority: TaskPriority;
  workNotes?: string;
}

export async function createWorkAssignmentAction(
  data: WorkAssignmentInput
): Promise<ActionResult<WorkAssignment>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  if (!data.orderId.trim()) return { success: false, error: "Order is required." };
  if (!data.assignedStaffId.trim()) {
    return { success: false, error: "Assigned staff member is required." };
  }
  if (!(await getStaffById(supabase, data.assignedStaffId))) {
    return { success: false, error: "Assigned staff member not found." };
  }
  const order = await getOrderById(supabase, data.orderId);
  if (!order) return { success: false, error: "Order not found." };
  if (!order.items.some((i) => i.serialNo === data.orderItemSerialNo)) {
    return { success: false, error: "Order item not found on this order." };
  }
  const stages = await getActiveWorkStages(supabase);
  if (!validStageKeys(stages).has(data.taskType)) return { success: false, error: "Invalid task type." };
  if (!VALID_PRIORITIES.has(data.priority)) return { success: false, error: "Invalid priority." };
  if (
    !ISO_DATE.test(data.assignedDate) ||
    !ISO_DATE.test(data.dueDate) ||
    (data.startedDate != null && !ISO_DATE.test(data.startedDate))
  ) {
    return { success: false, error: "Valid assigned/due dates are required." };
  }

  const assignment = await createWorkAssignment(supabase, data);
  return { success: true, data: assignment };
}

export interface WorkAssignmentPatch {
  assignedStaffId?: string;
  dueDate?: string;
  priority?: TaskPriority;
  startedDate?: string;
  completedDate?: string;
  cancelled?: boolean;
  workNotes?: string;
}

export async function updateWorkAssignmentAction(
  id: string,
  patch: WorkAssignmentPatch
): Promise<ActionResult<WorkAssignment>> {
  const supabase = createServerClient();
  const guard = await requireWorkAssignmentUpdateAccess(supabase, id, patch);
  if (!guard.ok) return { success: false, error: guard.error };

  if (patch.assignedStaffId && !(await getStaffById(supabase, patch.assignedStaffId))) {
    return { success: false, error: "Assigned staff member not found." };
  }
  if (patch.priority && !VALID_PRIORITIES.has(patch.priority)) {
    return { success: false, error: "Invalid priority." };
  }
  for (const dateField of [patch.dueDate, patch.startedDate, patch.completedDate]) {
    if (dateField && !ISO_DATE.test(dateField)) {
      return { success: false, error: "Dates must be valid." };
    }
  }

  const assignment = await updateWorkAssignment(createAdminClient(), id, patch);
  if (!assignment) return { success: false, error: "Work assignment not found." };
  return { success: true, data: assignment };
}

async function requireWorkAssignmentUpdateAccess(
  supabase: ReturnType<typeof createServerClient>,
  id: string,
  patch: WorkAssignmentPatch
): Promise<{ ok: true } | { ok: false; error: string }> {
  const context = await getServerCallerContext(supabase);
  if (!context) return { ok: false, error: "Not signed in." };
  if (hasPermission(context.permissions, "staff.manage")) return { ok: true };

  const progressOnly =
    patch.assignedStaffId === undefined &&
    patch.dueDate === undefined &&
    patch.priority === undefined &&
    patch.cancelled === undefined &&
    patch.workNotes === undefined &&
    (patch.startedDate !== undefined || patch.completedDate !== undefined);

  if (!progressOnly || !hasPermission(context.permissions, "staff.view") || !context.staffId) {
    return { ok: false, error: "You don't have permission to update this assignment." };
  }

  const assignedStaffId = await getWorkAssignmentAssignedStaffId(supabase, id);
  if (!assignedStaffId) return { ok: false, error: "Work assignment not found." };
  if (assignedStaffId !== context.staffId) {
    return { ok: false, error: "You can only update work assigned to you." };
  }
  return { ok: true };
}

export interface StaffPaymentInput {
  staffId: string;
  date: string;
  description: string;
  amount: number;
  paymentMode: PaymentMode;
  notes?: string;
}

export async function recordStaffPaymentAction(
  data: StaffPaymentInput
): Promise<ActionResult<StaffPayment>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  if (!data.staffId.trim()) return { success: false, error: "Staff member is required." };
  const staffMember = await getStaffById(supabase, data.staffId);
  if (!staffMember) {
    return { success: false, error: "Staff member not found." };
  }
  if (!ISO_DATE.test(data.date)) return { success: false, error: "A valid date is required." };
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    return { success: false, error: "Amount must be greater than zero." };
  }
  if (!VALID_PAYMENT_MODES.has(data.paymentMode)) {
    return { success: false, error: "Invalid payment mode." };
  }

  const payment = await recordStaffPayment(supabase, data);
  try {
    await createExpense(createAdminClient(), {
      expenseDate: data.date,
      category: "Salary",
      source: "Staff Payment",
      reference: payment.id,
      vendor: staffMember.name,
      description: `Staff payment - ${staffMember.name}`,
      amount: data.amount,
      paymentMode: data.paymentMode,
      notes: [
        "Source: Staff Payment",
        `Staff: ${staffMember.name} (${staffMember.staffNumber})`,
        `Staff payment ID: ${payment.id}`,
        data.description ? `Description: ${data.description}` : "",
        data.notes ? `Notes: ${data.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      recordedBy: guard.userId,
    });
  } catch (error) {
    if (!isMissingExpensesSchemaError(error)) {
      return {
        success: false,
        error:
          "Staff payment was recorded, but the Finance expense could not be created. Please add the expense manually.",
      };
    }
  }
  return { success: true, data: payment };
}

export async function getWorkAssignmentsForStaffAction(
  staffId: string
): Promise<WorkAssignment[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.view");
  if (!guard.ok) return [];
  return getWorkAssignmentsForStaff(supabase, staffId);
}

export async function getWorkAssignmentsAction(): Promise<WorkAssignment[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.view");
  if (!guard.ok) return [];
  return getWorkAssignments(supabase);
}

function isSameMonth(dateIso: string, todayIso: string): boolean {
  return dateIso.slice(0, 7) === todayIso.slice(0, 7);
}

function buildStaffListRows(
  staffList: Staff[],
  assignments: WorkAssignment[],
  todayIso: string
): StaffListRow[] {
  const assignmentsByStaff = new Map<string, WorkAssignment[]>();
  for (const assignment of assignments) {
    const current = assignmentsByStaff.get(assignment.assignedStaffId) ?? [];
    current.push(assignment);
    assignmentsByStaff.set(assignment.assignedStaffId, current);
  }

  return staffList.map((staff) => {
    const rows = assignmentsByStaff.get(staff.id) ?? [];
    const withStatus = rows.map((assignment) => ({
      assignment,
      status: computeTaskStatus(assignment, todayIso),
    }));
    const active = withStatus.filter(
      ({ status }) => status !== "Completed" && status !== "Cancelled"
    );
    const completedThisMonth = withStatus.filter(
      ({ assignment, status }) =>
        status === "Completed" &&
        assignment.completedDate &&
        isSameMonth(assignment.completedDate, todayIso)
    ).length;

    return {
      staff,
      activeOrders: new Set(active.map(({ assignment }) => assignment.orderId)).size,
      completedThisMonth,
      pendingWork: active.length,
    };
  });
}

function buildJobCardStaffListRows(
  staffList: Staff[],
  jobCards: JobCard[],
  todayIso: string
): StaffListRow[] {
  const cardsByStaff = new Map<string, JobCard[]>();
  for (const card of jobCards) {
    if (!card.assignedStaffId) continue;
    const current = cardsByStaff.get(card.assignedStaffId) ?? [];
    current.push(card);
    cardsByStaff.set(card.assignedStaffId, current);
  }

  return staffList.map((staff) => {
    const rows = cardsByStaff.get(staff.id) ?? [];
    const active = rows.filter(
      (card) =>
        card.productionBucket !== "Closed" &&
        card.stage !== "Ready" &&
        card.stage !== "Delivered" &&
        card.stage !== "Cancelled"
    );
    const completedThisMonth = rows.filter(
      (card) =>
        card.completedDate &&
        card.completedDate.slice(0, 7) === todayIso.slice(0, 7)
    ).length;

    return {
      staff,
      activeOrders: new Set(active.map((card) => card.orderId)).size,
      completedThisMonth,
      pendingWork: active.length,
    };
  });
}

function buildWorkQueueRows(
  staffList: Staff[],
  assignments: WorkAssignment[],
  orders: Order[],
  todayIso: string
): WorkQueueRow[] {
  const staffById = new Map(staffList.map((staff) => [staff.id, staff]));
  const ordersById = new Map(orders.map((order) => [order.id, order]));

  return assignments
    .map((assignment) => {
      const order = ordersById.get(assignment.orderId);
      const item = order?.items.find((i) => i.serialNo === assignment.orderItemSerialNo);
      if (!order || !item) return null;
      return {
        assignment,
        status: computeTaskStatus(assignment, todayIso),
        order,
        item,
        staff: staffById.get(assignment.assignedStaffId),
      };
    })
    .filter((row): row is WorkQueueRow => row !== null)
    .sort((a, b) => (a.assignment.dueDate < b.assignment.dueDate ? -1 : 1));
}

export async function getStaffPaymentsForStaffAction(
  staffId: string
): Promise<StaffPayment[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.view");
  if (!guard.ok) return [];
  return getStaffPaymentsForStaff(supabase, staffId);
}
