import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order, OrderItem, Staff, TaskType, WorkAssignment } from "@/lib/types";
import { getOrderById } from "@/lib/data/orders-db";
import {
  getStaff,
  getStaffPaymentsForStaff,
  getWorkAssignments,
  getWorkAssignmentsForStaff,
} from "@/lib/data/staff-db";

// ---------------------------------------------------------------------------
// Phase 6D: all selectors here are now async and Supabase-backed, via
// lib/data/staff-db.ts (staff/work assignments) and lib/data/orders-db.ts
// (real orders, since 6C). Converted even though only getStaffListRows has
// a live caller today (app/(shell)/staff/actions.ts) — getStaffDetail/
// getWorkQueueRows/getStaffWageSummary stay dead code with zero callers,
// same as before, just no longer pointing at deleted mock functions.
//
// Same string-based date math convention as lib/dashboard.ts / lib/customers.ts
// (see CLAUDE.md's date formatting gotcha) — never Date/Intl locale APIs.
// ---------------------------------------------------------------------------

function isSameMonth(dateIso: string, todayIso: string): boolean {
  return dateIso.slice(0, 7) === todayIso.slice(0, 7);
}

// Task status is always computed from dates/events, never a manually-picked
// stage — same convention as Order's Overdue badge and Customer's status.
export type TaskStatus =
  | "Assigned"
  | "In Progress"
  | "Completed"
  | "Delayed"
  | "Cancelled";

export function computeTaskStatus(
  assignment: WorkAssignment,
  todayIso: string
): TaskStatus {
  if (assignment.cancelled) return "Cancelled";
  if (assignment.completedDate) return "Completed";
  if (assignment.dueDate < todayIso) return "Delayed";
  if (assignment.startedDate) return "In Progress";
  return "Assigned";
}

export interface StaffListRow {
  staff: Staff;
  activeOrders: number;
  completedThisMonth: number;
  pendingWork: number;
}

export async function getStaffListRows(
  supabase: SupabaseClient,
  todayIso: string
): Promise<StaffListRow[]> {
  const staffList = await getStaff(supabase);
  return Promise.all(
    staffList.map(async (member) => {
      const assignments = await getWorkAssignmentsForStaff(supabase, member.id);
      const withStatus = assignments.map((a) => ({
        assignment: a,
        status: computeTaskStatus(a, todayIso),
      }));

      const active = withStatus.filter(
        ({ status }) => status !== "Completed" && status !== "Cancelled"
      );
      const activeOrders = new Set(active.map(({ assignment }) => assignment.orderId))
        .size;

      const completedThisMonth = withStatus.filter(
        ({ assignment, status }) =>
          status === "Completed" &&
          assignment.completedDate &&
          isSameMonth(assignment.completedDate, todayIso)
      ).length;

      return {
        staff: member,
        activeOrders,
        completedThisMonth,
        pendingWork: active.length,
      };
    })
  );
}

export interface CurrentWorkRow {
  assignment: WorkAssignment;
  status: TaskStatus;
  order: Order;
  item: OrderItem;
}

export interface StaffDetail {
  staff: Staff;
  assignedCount: number;
  pendingCount: number;
  completedCount: number;
  delayedCount: number;
  thisMonthEarnings: number;
  currentWork: CurrentWorkRow[];
}

async function toWorkRows(
  supabase: SupabaseClient,
  assignments: WorkAssignment[],
  todayIso: string
): Promise<CurrentWorkRow[]> {
  const rows = await Promise.all(
    assignments.map(async (assignment) => {
      const order = await getOrderById(supabase, assignment.orderId);
      const item = order?.items.find(
        (i) => i.serialNo === assignment.orderItemSerialNo
      );
      if (!order || !item) return null;
      return { assignment, status: computeTaskStatus(assignment, todayIso), order, item };
    })
  );
  return rows
    .filter((row): row is CurrentWorkRow => row !== null)
    .sort((a, b) => (a.assignment.dueDate < b.assignment.dueDate ? -1 : 1));
}

export async function getStaffDetail(
  supabase: SupabaseClient,
  staff: Staff,
  todayIso: string
): Promise<StaffDetail> {
  const assignments = await getWorkAssignmentsForStaff(supabase, staff.id);
  const rows = await toWorkRows(supabase, assignments, todayIso);

  const assignedCount = rows.filter((r) => r.status === "Assigned").length;
  const delayedCount = rows.filter((r) => r.status === "Delayed").length;
  const completedCount = rows.filter((r) => r.status === "Completed").length;
  const pendingCount = rows.filter(
    (r) => r.status === "Assigned" || r.status === "In Progress" || r.status === "Delayed"
  ).length;

  const thisMonthEarnings =
    staff.paymentType === "Salary"
      ? staff.baseSalary ?? 0
      : rows
          .filter(
            (r) =>
              r.status === "Completed" &&
              r.assignment.completedDate &&
              isSameMonth(r.assignment.completedDate, todayIso)
          )
          .reduce((sum, r) => sum + r.assignment.wageAmount, 0);

  return {
    staff,
    assignedCount,
    pendingCount,
    completedCount,
    delayedCount,
    thisMonthEarnings,
    currentWork: rows,
  };
}

export interface WorkQueueRow {
  assignment: WorkAssignment;
  status: TaskStatus;
  order: Order;
  item: OrderItem;
  staff: Staff | undefined;
}

export async function getWorkQueueRows(
  supabase: SupabaseClient,
  todayIso: string
): Promise<WorkQueueRow[]> {
  const [assignments, staffList] = await Promise.all([
    getWorkAssignments(supabase),
    getStaff(supabase),
  ]);
  const rows = await Promise.all(
    assignments.map(async (assignment) => {
      const order = await getOrderById(supabase, assignment.orderId);
      const item = order?.items.find(
        (i) => i.serialNo === assignment.orderItemSerialNo
      );
      if (!order || !item) return null;
      const staffMember = staffList.find((s) => s.id === assignment.assignedStaffId);
      return {
        assignment,
        status: computeTaskStatus(assignment, todayIso),
        order,
        item,
        staff: staffMember,
      };
    })
  );
  return rows
    .filter((row): row is WorkQueueRow => row !== null)
    .sort((a, b) => (a.assignment.dueDate < b.assignment.dueDate ? -1 : 1));
}

export interface StaffWageSummary {
  payableAmount: number;
  paidAmount: number;
  balance: number;
}

export async function getStaffWageSummary(
  supabase: SupabaseClient,
  staff: Staff,
  todayIso: string
): Promise<StaffWageSummary> {
  const assignments = await getWorkAssignmentsForStaff(supabase, staff.id);

  const payableAmount =
    staff.paymentType === "Salary"
      ? staff.baseSalary ?? 0
      : assignments
          .filter(
            (a) =>
              computeTaskStatus(a, todayIso) === "Completed" &&
              a.completedDate &&
              isSameMonth(a.completedDate, todayIso)
          )
          .reduce((sum, a) => sum + a.wageAmount, 0);

  const payments = await getStaffPaymentsForStaff(supabase, staff.id);
  const paidAmount = payments
    .filter((p) => isSameMonth(p.date, todayIso))
    .reduce((sum, p) => sum + p.amount, 0);

  return {
    payableAmount,
    paidAmount,
    balance: payableAmount - paidAmount,
  };
}

export const TASK_TYPES: TaskType[] = [
  "Measurement",
  "Cutting",
  "Stitching",
  "Embroidery",
  "Finishing",
  "Alteration",
  "Ironing/Packing",
  "Delivery",
];
