import type {
  CustomerSnapshot,
  Order,
  OrderItem,
  OrderStatus,
  Staff,
  TaskType,
  WorkAssignment,
} from "@/lib/types";

export type JobCardStage =
  | "Unassigned"
  | "Cutting"
  | "Stitching"
  | "Embroidery"
  | "Finishing"
  | "Trial"
  | "Alteration"
  | "Delayed"
  | "Ready"
  | "Delivered"
  | "Cancelled";

export type ProductionBucket =
  | "Unassigned"
  | "Cutting"
  | "Stitching"
  | "Finishing"
  | "Trial / Alteration"
  | "Ready";

export interface JobCard {
  id: string;
  persisted: boolean;
  jobCardNumber: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customer: CustomerSnapshot | undefined;
  item: OrderItem;
  unitNo: number;
  totalUnits: number;
  garment: string;
  deliveryDate: string;
  orderStatus: OrderStatus;
  stage: JobCardStage;
  productionBucket: ProductionBucket | "Closed";
  assignment?: WorkAssignment;
  taskType?: TaskType;
  taskStatus?: "Assigned" | "In Progress" | "Completed" | "Delayed" | "Cancelled";
  assignedStaffId?: string;
  assignedTo: string;
  priority?: "Low" | "Normal" | "High";
  fabricSource?: "Not specified" | "Customer provided" | "Shop provided";
  fabricNotes?: string;
  designNotes?: string;
  notes?: string;
  createdAt?: string;
  startedDate?: string;
  completedDate?: string;
  wageRate?: number;
  wageAmount?: number;
  isDelayed: boolean;
}

export function buildJobCards(
  orders: Order[],
  todayIso: string,
  assignments: WorkAssignment[] = [],
  staffList: Staff[] = []
): JobCard[] {
  const staffById = new Map(staffList.map((staff) => [staff.id, staff]));
  const assignmentByLine = new Map<string, WorkAssignment>();
  for (const assignment of assignments) {
    const key = assignmentKey(assignment.orderId, assignment.orderItemSerialNo);
    const current = assignmentByLine.get(key);
    if (!current || rankAssignment(assignment) > rankAssignment(current)) {
      assignmentByLine.set(key, assignment);
    }
  }

  return orders.flatMap((order) =>
    order.items.flatMap((item) => {
      const qty = Math.max(1, item.qty);
      const assignment = assignmentByLine.get(assignmentKey(order.id, item.serialNo));
      const taskStatus = assignment ? getTaskStatus(assignment, todayIso) : undefined;
      return Array.from({ length: qty }, (_, index) => {
        const unitNo = index + 1;
        const stage = getJobCardStage(order, item, todayIso, taskStatus);
        const assignedStaff = assignment ? staffById.get(assignment.assignedStaffId) : undefined;
        return {
          id: `${order.id}-${item.serialNo}-${unitNo}`,
          persisted: false,
          jobCardNumber: `${order.orderNumber}-G${item.serialNo}.${unitNo}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerId: order.customerId,
          customer: order.customerSnapshot,
          item,
          unitNo,
          totalUnits: qty,
          garment: item.particular,
          deliveryDate: order.deliveryDate,
          orderStatus: order.status,
          stage,
          productionBucket: getProductionBucket(stage, item, assignment),
          assignment,
          taskType: assignment?.taskType,
          taskStatus,
          assignedStaffId: assignment?.assignedStaffId,
          assignedTo: assignedStaff?.name ?? "Unassigned",
          priority: assignment?.priority,
          fabricSource: item.fabricSource,
          fabricNotes: item.fabricNotes,
          designNotes: item.designNotes,
          notes: assignment?.workNotes,
          startedDate: assignment?.startedDate,
          completedDate: assignment?.completedDate,
          wageRate: assignment && assignment.wageAmount > 0 ? assignment.wageAmount / qty : 0,
          wageAmount: assignment?.wageAmount ?? 0,
          isDelayed:
            order.deliveryDate < todayIso &&
            order.status !== "Delivered" &&
            order.status !== "Cancelled" &&
            taskStatus !== "Completed",
        };
      });
    })
  );
}

function assignmentKey(orderId: string, serialNo: number) {
  return `${orderId}:${serialNo}`;
}

function rankAssignment(assignment: WorkAssignment): number {
  if (assignment.cancelled) return 0;
  if (assignment.completedDate) return 1;
  if (assignment.startedDate) return 3;
  return 2;
}

function getTaskStatus(
  assignment: WorkAssignment,
  todayIso: string
): "Assigned" | "In Progress" | "Completed" | "Delayed" | "Cancelled" {
  if (assignment.cancelled) return "Cancelled";
  if (assignment.completedDate) return "Completed";
  if (assignment.dueDate < todayIso) return "Delayed";
  if (assignment.startedDate) return "In Progress";
  return "Assigned";
}

function getJobCardStage(
  order: Order,
  item: OrderItem,
  todayIso: string,
  taskStatus?: "Assigned" | "In Progress" | "Completed" | "Delayed" | "Cancelled"
): JobCardStage {
  if (order.status === "Cancelled") return "Cancelled";
  if (order.status === "Delivered") return "Delivered";
  if (order.status === "Ready") return "Ready";
  if (taskStatus === "Completed") return "Ready";
  if (taskStatus === "Delayed") return "Delayed";
  if (order.status === "Delayed" || order.deliveryDate < todayIso) return "Delayed";
  return "Unassigned";
}

function getProductionBucket(
  stage: JobCardStage,
  item: OrderItem,
  assignment?: WorkAssignment
): ProductionBucket | "Closed" {
  if (stage === "Cancelled" || stage === "Delivered") return "Closed";
  if (stage === "Ready") return "Ready";
  if (stage === "Cutting") return "Cutting";
  if (stage === "Stitching" || stage === "Embroidery") return "Stitching";
  if (stage === "Finishing") return "Finishing";
  if (stage === "Trial" || stage === "Alteration") return "Trial / Alteration";
  if (assignment) {
    if (assignment.taskType === "Cutting") return "Cutting";
    if (assignment.taskType === "Stitching" || assignment.taskType === "Embroidery") {
      return "Stitching";
    }
    if (assignment.taskType === "Finishing" || assignment.taskType === "Ironing/Packing") {
      return "Finishing";
    }
    if (assignment.taskType === "Measurement" || assignment.taskType === "Alteration") {
      return "Trial / Alteration";
    }
    if (assignment.taskType === "Delivery") return "Ready";
  }
  if (stage === "Delayed" || item.particular.toLowerCase().includes("alteration")) {
    return "Trial / Alteration";
  }
  return "Unassigned";
}
