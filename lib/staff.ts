import type { Order, OrderItem, Staff, TaskType, WorkAssignment } from "@/lib/types";

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

export interface WorkQueueRow {
  assignment: WorkAssignment;
  status: TaskStatus;
  order: Order;
  item: OrderItem;
  staff: Staff | undefined;
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
