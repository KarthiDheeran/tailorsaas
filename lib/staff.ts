import type { Order, OrderItem, Staff, TaskType, WorkAssignment } from "@/lib/types";
import {
  getOrderById,
  getStaff,
  getStaffPaymentsForStaff,
  getWorkAssignments,
  getWorkAssignmentsForStaff,
} from "@/lib/data/stub-data";

// Same string-based date math convention as lib/dashboard.ts / lib/customers.ts
// (see CLAUDE.md's date formatting gotcha) — never Date/Intl locale APIs.

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

export function getStaffListRows(todayIso: string): StaffListRow[] {
  return getStaff().map((member) => {
    const assignments = getWorkAssignmentsForStaff(member.id);
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
  });
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

function toWorkRows(assignments: WorkAssignment[], todayIso: string): CurrentWorkRow[] {
  return assignments
    .map((assignment) => {
      const order = getOrderById(assignment.orderId);
      const item = order?.items.find(
        (i) => i.serialNo === assignment.orderItemSerialNo
      );
      if (!order || !item) return null;
      return { assignment, status: computeTaskStatus(assignment, todayIso), order, item };
    })
    .filter((row): row is CurrentWorkRow => row !== null)
    .sort((a, b) => (a.assignment.dueDate < b.assignment.dueDate ? -1 : 1));
}

export function getStaffDetail(staff: Staff, todayIso: string): StaffDetail {
  const assignments = getWorkAssignmentsForStaff(staff.id);
  const rows = toWorkRows(assignments, todayIso);

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

export function getWorkQueueRows(todayIso: string): WorkQueueRow[] {
  return getWorkAssignments()
    .map((assignment) => {
      const order = getOrderById(assignment.orderId);
      const item = order?.items.find(
        (i) => i.serialNo === assignment.orderItemSerialNo
      );
      if (!order || !item) return null;
      const staffMember = getStaff().find((s) => s.id === assignment.assignedStaffId);
      return {
        assignment,
        status: computeTaskStatus(assignment, todayIso),
        order,
        item,
        staff: staffMember,
      };
    })
    .filter((row): row is WorkQueueRow => row !== null)
    .sort((a, b) => (a.assignment.dueDate < b.assignment.dueDate ? -1 : 1));
}

export interface StaffWageSummary {
  payableAmount: number;
  paidAmount: number;
  balance: number;
}

export function getStaffWageSummary(staff: Staff, todayIso: string): StaffWageSummary {
  const assignments = getWorkAssignmentsForStaff(staff.id);

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

  const paidAmount = getStaffPaymentsForStaff(staff.id)
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
