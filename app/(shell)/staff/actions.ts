"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import {
  createStaff,
  createWorkAssignment,
  getStaff,
  getStaffById,
  getStaffPaymentsForStaff,
  getWorkAssignments,
  getWorkAssignmentsForStaff,
  recordStaffPayment,
  updateStaff,
  updateWorkAssignment,
} from "@/lib/data/staff-db";
import { getOrderById } from "@/lib/data/orders-db";
import { paymentModes } from "@/lib/constants";
import {
  getStaffListRows,
  getWorkQueueRows,
  TASK_TYPES,
  type StaffListRow,
  type WorkQueueRow,
} from "@/lib/staff";
import type {
  PaymentMode,
  Staff,
  StaffPayment,
  StaffPaymentType,
  StaffRole,
  StaffStatus,
  TaskPriority,
  TaskType,
  WorkAssignment,
} from "@/lib/types";

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
const VALID_TASK_TYPES = new Set<TaskType>(TASK_TYPES);
const VALID_PRIORITIES = new Set<TaskPriority>(["Low", "Normal", "High"]);
const VALID_PAYMENT_MODES = new Set<PaymentMode>(paymentModes);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  pieceRates?: Partial<Record<TaskType, number>>;
}

function validateStaffInput(data: StaffFormInput): string | null {
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
      if (!VALID_TASK_TYPES.has(task as TaskType)) {
        return `Unknown task type: ${task}.`;
      }
      if (rate != null && (!Number.isFinite(rate) || rate < 0)) {
        return `Rate for ${task} must be 0 or greater.`;
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

  const validationError = validateStaffInput(data);
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

  const validationError = validateStaffInput(data);
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
  if (!VALID_TASK_TYPES.has(data.taskType)) return { success: false, error: "Invalid task type." };
  if (!VALID_PRIORITIES.has(data.priority)) return { success: false, error: "Invalid priority." };
  if (!ISO_DATE.test(data.assignedDate) || !ISO_DATE.test(data.dueDate)) {
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
  const guard = await requireServerPermission(supabase, "staff.manage");
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

  const assignment = await updateWorkAssignment(supabase, id, patch);
  if (!assignment) return { success: false, error: "Work assignment not found." };
  return { success: true, data: assignment };
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
  if (!(await getStaffById(supabase, data.staffId))) {
    return { success: false, error: "Staff member not found." };
  }
  if (!ISO_DATE.test(data.date)) return { success: false, error: "A valid date is required." };
  if (!Number.isFinite(data.amount) || data.amount < 0) {
    return { success: false, error: "Amount must be 0 or greater." };
  }
  if (!VALID_PAYMENT_MODES.has(data.paymentMode)) {
    return { success: false, error: "Invalid payment mode." };
  }

  const payment = await recordStaffPayment(supabase, data);
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

export async function getStaffPaymentsForStaffAction(
  staffId: string
): Promise<StaffPayment[]> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.view");
  if (!guard.ok) return [];
  return getStaffPaymentsForStaff(supabase, staffId);
}
