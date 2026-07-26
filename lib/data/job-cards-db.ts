import type { SupabaseClient } from "@supabase/supabase-js";
import { recordStaffWorkEarning } from "@/lib/data/staff-db";
import type { JobCard, JobCardStage, ProductionBucket } from "@/lib/job-cards";
import type {
  CustomerSnapshot,
  OrderItem,
  OrderStatus,
  Staff,
  TaskPriority,
  TaskType,
} from "@/lib/types";

export type JobCardFabricSource =
  | "Not specified"
  | "Customer provided"
  | "Shop provided";

export interface JobCardAssignmentInput {
  taskType: TaskType;
  assignedStaffId: string;
  dueDate: string;
  priority: TaskPriority;
  startedDate?: string;
  notes?: string;
  fabricSource?: JobCardFabricSource;
  fabricNotes?: string;
}

export interface JobCardActivitySnapshot {
  id: string;
  orderId: string;
  currentStage: JobCardStage;
  assignedStaffId?: string;
  orderStatus: OrderStatus;
  cancelled: boolean;
}

const JOB_CARD_COLUMNS = `
  id, job_card_number, order_id, order_number, customer_id, order_status,
  order_item_serial_no, unit_no, garment_type, customer_snapshot,
  measurements_snapshot, fabric_source, fabric_notes, design_notes,
  current_stage, assigned_staff_id, priority, due_date, trial_date,
  started_date, completed_date, cancelled, notes, wage_rate, wage_amount,
  created_at, updated_at
`;

const LEGACY_JOB_CARD_COLUMNS = `
  id, job_card_number, order_id, order_number, customer_id, order_status,
  order_item_serial_no, unit_no, garment_type, customer_snapshot,
  measurements_snapshot, fabric_source, fabric_notes, design_notes,
  current_stage, assigned_staff_id, priority, due_date, trial_date,
  started_date, completed_date, cancelled, notes, created_at, updated_at
`;

interface JobCardRow {
  id: string;
  job_card_number: string;
  order_id: string;
  order_number: string;
  customer_id: string;
  order_status: OrderStatus;
  order_item_serial_no: number;
  unit_no: number;
  garment_type: string;
  customer_snapshot: CustomerSnapshot | null;
  measurements_snapshot: Record<string, string> | null;
  fabric_source: JobCardFabricSource;
  fabric_notes: string | null;
  design_notes: string | null;
  current_stage: JobCardStage;
  assigned_staff_id: string | null;
  priority: TaskPriority;
  due_date: string;
  trial_date: string | null;
  started_date: string | null;
  completed_date: string | null;
  cancelled: boolean;
  notes: string | null;
  wage_rate: number | null;
  wage_amount: number | null;
  created_at: string | null;
}

export function isMissingJobCardsSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    message.includes("job_cards") ||
    message.includes("sync_job_cards_for_order")
  );
}

function isMissingJobCardPayrollColumnError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    code === "PGRST204" ||
    message.includes("wage_rate") ||
    message.includes("wage_amount")
  );
}

export async function getJobCards(
  supabase: SupabaseClient,
  todayIso: string,
  staffList: Staff[] = [],
  options: { assignedStaffId?: string } = {}
): Promise<JobCard[]> {
  let query = supabase
    .from("job_cards")
    .select(JOB_CARD_COLUMNS)
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("order_number", { ascending: false })
    .order("order_item_serial_no", { ascending: true })
    .order("unit_no", { ascending: true });

  if (options.assignedStaffId) {
    query = query.eq("assigned_staff_id", options.assignedStaffId);
  }

  let { data, error } = await query;
  if (error && isMissingJobCardPayrollColumnError(error)) {
    let fallback = supabase
      .from("job_cards")
      .select(LEGACY_JOB_CARD_COLUMNS)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("order_number", { ascending: false })
      .order("order_item_serial_no", { ascending: true })
      .order("unit_no", { ascending: true });
    if (options.assignedStaffId) {
      fallback = fallback.eq("assigned_staff_id", options.assignedStaffId);
    }
    const result = await fallback;
    data = result.data as unknown as typeof data;
    error = result.error;
  }
  if (error) throw error;

  const rows = ((data as unknown as JobCardRow[]) ?? []);
  const totalsByLine = new Map<string, number>();
  for (const row of rows) {
    const key = lineKey(row.order_id, row.order_item_serial_no);
    totalsByLine.set(key, (totalsByLine.get(key) ?? 0) + 1);
  }

  const staffById = new Map(staffList.map((staff) => [staff.id, staff]));
  return rows.map((row) =>
    mapJobCardRow(row, todayIso, totalsByLine, staffById)
  );
}

export async function syncJobCardsForOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  const { error } = await supabase.rpc("sync_job_cards_for_order", {
    p_order_id: orderId,
  });
  if (error) throw error;
  await reconcileJobCardsForOrderStatus(supabase, orderId);
}

export async function reconcileJobCardsForOrderStatus(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!orderRow) throw new Error("Order not found.");

  const status = (orderRow as { status: OrderStatus }).status;
  const baseUpdate: Record<string, unknown> = {
    order_status: status,
    updated_at: new Date().toISOString(),
  };

  if (status === "Ready") {
    await updateJobCardsForOrder(supabase, orderId, {
      ...baseUpdate,
      current_stage: "Ready",
      completed_date: new Date().toISOString().slice(0, 10),
      cancelled: false,
    });
    return;
  }

  if (status === "Delivered") {
    await updateJobCardsForOrder(supabase, orderId, {
      ...baseUpdate,
      current_stage: "Delivered",
      completed_date: new Date().toISOString().slice(0, 10),
      cancelled: false,
    });
    return;
  }

  if (status === "Cancelled") {
    await updateJobCardsForOrder(supabase, orderId, {
      ...baseUpdate,
      current_stage: "Cancelled",
      cancelled: true,
    });
    return;
  }

  await updateJobCardsForOrder(supabase, orderId, baseUpdate);
}

async function updateJobCardsForOrder(
  supabase: SupabaseClient,
  orderId: string,
  update: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("job_cards")
    .update(update)
    .eq("order_id", orderId);
  if (error) throw error;
}

function isClosedJobCard(row: {
  order_status: OrderStatus;
  current_stage: JobCardStage;
  cancelled: boolean;
}) {
  return (
    row.cancelled ||
    row.order_status === "Delivered" ||
    row.order_status === "Cancelled" ||
    row.current_stage === "Delivered" ||
    row.current_stage === "Cancelled"
  );
}

function assertJobCardEditable(row: {
  order_status: OrderStatus;
  current_stage: JobCardStage;
  cancelled: boolean;
}) {
  if (isClosedJobCard(row)) {
    throw new Error("This job card is closed and cannot be changed.");
  }
}

function stageRequiresWorker(stage: JobCardStage) {
  return stage !== "Unassigned" && stage !== "Cancelled";
}

export async function assignJobCard(
  supabase: SupabaseClient,
  id: string,
  data: JobCardAssignmentInput
): Promise<void> {
  const { data: currentRow, error: fetchError } = await supabase
    .from("job_cards")
    .select("order_status, current_stage, cancelled")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!currentRow) throw new Error("Job card not found.");
  assertJobCardEditable(
    currentRow as {
      order_status: OrderStatus;
      current_stage: JobCardStage;
      cancelled: boolean;
    }
  );
  const wage = await getJobCardWageSnapshot(supabase, data.assignedStaffId, data.taskType);

  const update = {
    current_stage: taskTypeToStage(data.taskType),
    assigned_staff_id: data.assignedStaffId,
    due_date: data.dueDate,
    priority: data.priority,
    notes: data.notes ?? null,
    fabric_source: data.fabricSource ?? "Not specified",
    fabric_notes: data.fabricNotes?.trim() ? data.fabricNotes.trim() : null,
    wage_rate: wage.rate,
    wage_amount: wage.amount,
    started_date: data.startedDate ?? new Date().toISOString().slice(0, 10),
    completed_date: null,
    cancelled: false,
    updated_at: new Date().toISOString(),
  };
  let { error } = await supabase
    .from("job_cards")
    .update(update)
    .eq("id", id);
  if (error && isMissingJobCardPayrollColumnError(error)) {
    const legacyUpdate: Record<string, unknown> = { ...update };
    delete legacyUpdate.wage_rate;
    delete legacyUpdate.wage_amount;
    const retry = await supabase.from("job_cards").update(legacyUpdate).eq("id", id);
    error = retry.error;
  }
  if (error) throw error;
}

export async function getJobCardAssignedStaffId(
  supabase: SupabaseClient,
  id: string
): Promise<string | null | undefined> {
  const { data, error } = await supabase
    .from("job_cards")
    .select("assigned_staff_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return (data as { assigned_staff_id: string | null }).assigned_staff_id;
}

async function getJobCardWageSnapshot(
  supabase: SupabaseClient,
  staffId: string,
  taskType: TaskType
): Promise<{ rate: number; amount: number }> {
  const { data, error } = await supabase
    .from("staff")
    .select("payment_type, piece_rates")
    .eq("id", staffId)
    .maybeSingle();
  if (error) throw error;
  const row = data as
    | {
        payment_type: "Salary" | "Per Piece";
        piece_rates: Partial<Record<string, number>> | null;
      }
    | null;
  if (!row || row.payment_type !== "Per Piece") return { rate: 0, amount: 0 };
  const rate = Number(row.piece_rates?.[taskType] ?? 0);
  const normalizedRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  return { rate: normalizedRate, amount: normalizedRate };
}

export async function getJobCardActivitySnapshot(
  supabase: SupabaseClient,
  id: string
): Promise<JobCardActivitySnapshot | undefined> {
  const { data, error } = await supabase
    .from("job_cards")
    .select("id, order_id, order_status, current_stage, assigned_staff_id, cancelled")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  const row = data as {
    id: string;
    order_id: string;
    order_status: OrderStatus;
    current_stage: JobCardStage;
    assigned_staff_id: string | null;
    cancelled: boolean;
  };
  return {
    id: row.id,
    orderId: row.order_id,
    currentStage: row.current_stage,
    assignedStaffId: row.assigned_staff_id ?? undefined,
    orderStatus: row.order_status,
    cancelled: row.cancelled,
  };
}

export async function startJobCard(
  supabase: SupabaseClient,
  id: string,
  todayIso: string
): Promise<void> {
  const { data: currentRow, error: fetchError } = await supabase
    .from("job_cards")
    .select("order_status, current_stage, assigned_staff_id, cancelled")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!currentRow) throw new Error("Job card not found.");
  const current = currentRow as {
    order_status: OrderStatus;
    current_stage: JobCardStage;
    assigned_staff_id: string | null;
    cancelled: boolean;
  };
  assertJobCardEditable(current);
  if (!current.assigned_staff_id) {
    throw new Error("Assign a worker before starting this job card.");
  }

  const { error } = await supabase
    .from("job_cards")
    .update({
      started_date: todayIso,
      completed_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function completeJobCard(
  supabase: SupabaseClient,
  id: string,
  todayIso: string
): Promise<string> {
  const { data: currentRow, error: fetchError } = await supabase
    .from("job_cards")
    .select("current_stage, order_id, order_status, assigned_staff_id, cancelled, job_card_number, wage_rate, wage_amount")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!currentRow) throw new Error("Job card not found.");

  const current = currentRow as {
    current_stage: JobCardStage;
    order_id: string;
    order_status: OrderStatus;
    assigned_staff_id: string | null;
    cancelled: boolean;
    job_card_number: string;
    wage_rate: number | null;
    wage_amount: number | null;
  };
  assertJobCardEditable(current);
  if (!current.assigned_staff_id) {
    throw new Error("Assign a worker before moving this job card.");
  }
  const currentStage = current.current_stage;
  const nextStage = getNextStageAfterCompletion(currentStage);
  const isFinalCompletion = nextStage === "Ready";
  const completedTaskType = stageToTaskType(currentStage);
  if (!completedTaskType) {
    throw new Error("This stage cannot be completed for staff payables.");
  }
  await recordStaffWorkEarning(supabase, {
    staffId: current.assigned_staff_id,
    jobCardId: id,
    orderId: current.order_id,
    jobCardNumber: current.job_card_number,
    taskType: completedTaskType,
    completedDate: todayIso,
    wageRate: Number(current.wage_rate ?? 0),
    wageAmount: Number(current.wage_amount ?? 0),
  });
  const update: Record<string, unknown> = {
    current_stage: isFinalCompletion ? "Ready" : "Unassigned",
    updated_at: new Date().toISOString(),
  };
  if (isFinalCompletion) {
    update.completed_date = todayIso;
  } else {
    update.assigned_staff_id = null;
    update.started_date = null;
    update.completed_date = null;
  }

  const { error } = await supabase
    .from("job_cards")
    .update(update)
    .eq("id", id);
  if (error) throw error;
  return current.order_id;
}

export async function moveJobCardStage(
  supabase: SupabaseClient,
  id: string,
  stage: JobCardStage,
  todayIso: string
): Promise<string> {
  const { data: currentRow, error: fetchError } = await supabase
    .from("job_cards")
    .select("order_id, order_status, current_stage, assigned_staff_id, cancelled")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!currentRow) throw new Error("Job card not found.");

  const current = currentRow as {
    order_id: string;
    order_status: OrderStatus;
    current_stage: JobCardStage;
    assigned_staff_id: string | null;
    cancelled: boolean;
  };
  assertJobCardEditable(current);
  if (stageRequiresWorker(stage) && !current.assigned_staff_id) {
    throw new Error("Assign a worker before moving this job card into production.");
  }

  const isClosedStage =
    stage === "Ready" || stage === "Delivered" || stage === "Cancelled";
  const update: Record<string, unknown> = {
    current_stage: stage,
    cancelled: stage === "Cancelled",
    updated_at: new Date().toISOString(),
  };

  if (stage === "Ready" || stage === "Delivered") {
    update.completed_date = todayIso;
  } else if (!isClosedStage) {
    update.started_date = null;
    update.completed_date = null;
  }

  const { error } = await supabase
    .from("job_cards")
    .update(update)
    .eq("id", id);
  if (error) throw error;
  return current.order_id;
}

export async function syncOrderStatusFromJobCards(
  supabase: SupabaseClient,
  orderId: string
): Promise<void> {
  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!orderRow) throw new Error("Order not found.");

  const orderStatus = (orderRow as { status: OrderStatus }).status;
  if (orderStatus === "Delivered" || orderStatus === "Cancelled") return;

  const { data: rows, error } = await supabase
    .from("job_cards")
    .select("current_stage, cancelled")
    .eq("order_id", orderId);
  if (error) throw error;

  const activeRows = ((rows as { current_stage: JobCardStage; cancelled: boolean }[]) ?? [])
    .filter((row) => !row.cancelled && row.current_stage !== "Cancelled");
  if (activeRows.length === 0) return;

  const allReady = activeRows.every((row) => row.current_stage === "Ready");
  const nextStatus: OrderStatus = allReady ? "Ready" : "In Progress";
  if (orderStatus === nextStatus) return;

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (updateError) throw updateError;
}

function mapJobCardRow(
  row: JobCardRow,
  todayIso: string,
  totalsByLine: Map<string, number>,
  staffById: Map<string, Staff>
): JobCard {
  const stage =
    row.cancelled || row.order_status === "Cancelled"
      ? "Cancelled"
      : row.order_status === "Delivered"
        ? "Delivered"
        : row.current_stage;
  const assignedStaff = row.assigned_staff_id
    ? staffById.get(row.assigned_staff_id)
    : undefined;
  const taskStatus = getPersistedTaskStatus(row, todayIso);
  const item: OrderItem = {
    serialNo: row.order_item_serial_no,
    particular: row.garment_type,
    qty: totalsByLine.get(lineKey(row.order_id, row.order_item_serial_no)) ?? 1,
    rate: 0,
    amount: 0,
    measurements: row.measurements_snapshot ?? undefined,
    fabricSource: row.fabric_source,
    fabricNotes: row.fabric_notes ?? undefined,
    designNotes: row.design_notes?.trim() ? row.design_notes : undefined,
  };

  return {
    id: row.id,
    persisted: true,
    jobCardNumber: row.job_card_number,
    orderId: row.order_id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    customer: row.customer_snapshot ?? undefined,
    item,
    unitNo: row.unit_no,
    totalUnits: item.qty,
    garment: row.garment_type,
    deliveryDate: row.due_date,
    orderStatus: row.order_status,
    stage,
    productionBucket: getPersistedProductionBucket(stage),
    taskType: stageToTaskType(row.current_stage),
    taskStatus,
    assignedStaffId: row.assigned_staff_id ?? undefined,
    assignedTo: assignedStaff?.name ?? "Unassigned",
    priority: row.priority,
    fabricSource: row.fabric_source,
    fabricNotes: row.fabric_notes ?? undefined,
    designNotes: row.design_notes?.trim() ? row.design_notes : undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at ?? undefined,
    startedDate: row.started_date ?? undefined,
    completedDate: row.completed_date ?? undefined,
    wageRate: Number(row.wage_rate ?? 0),
    wageAmount: Number(row.wage_amount ?? 0),
    isDelayed:
      row.due_date < todayIso &&
      row.order_status !== "Delivered" &&
      row.order_status !== "Cancelled" &&
      stage !== "Ready" &&
      stage !== "Delivered" &&
      stage !== "Cancelled",
  };
}

function lineKey(orderId: string, serialNo: number) {
  return `${orderId}:${serialNo}`;
}

function getPersistedTaskStatus(
  row: JobCardRow,
  todayIso: string
): JobCard["taskStatus"] {
  if (row.cancelled || row.current_stage === "Cancelled") return "Cancelled";
  if (row.completed_date || row.current_stage === "Ready") return "Completed";
  if (row.due_date < todayIso || row.current_stage === "Delayed") return "Delayed";
  if (row.started_date) return "In Progress";
  if (row.assigned_staff_id) return "Assigned";
  return undefined;
}

function getPersistedProductionBucket(
  stage: JobCardStage
): ProductionBucket | "Closed" {
  if (stage === "Cancelled" || stage === "Delivered") return "Closed";
  if (stage === "Ready") return "Ready";
  if (stage === "Cutting") return "Cutting";
  if (stage === "Stitching" || stage === "Embroidery") return "Stitching";
  if (stage === "Finishing") return "Finishing";
  if (stage === "Trial" || stage === "Alteration" || stage === "Delayed") {
    return "Trial / Alteration";
  }
  return "Unassigned";
}

function taskTypeToStage(taskType: TaskType): JobCardStage {
  if (taskType === "Measurement") return "Trial";
  if (taskType === "Ironing/Packing") return "Finishing";
  if (taskType === "Delivery") return "Ready";
  return taskType;
}

function stageToTaskType(stage: JobCardStage): TaskType | undefined {
  if (stage === "Cutting") return "Cutting";
  if (stage === "Stitching") return "Stitching";
  if (stage === "Embroidery") return "Embroidery";
  if (stage === "Finishing") return "Finishing";
  if (stage === "Trial") return "Measurement";
  if (stage === "Alteration") return "Alteration";
  if (stage === "Ready") return "Delivery";
  return undefined;
}

function getNextStageAfterCompletion(stage: JobCardStage): JobCardStage {
  if (stage === "Unassigned") return "Cutting";
  if (stage === "Cutting") return "Stitching";
  if (stage === "Stitching" || stage === "Embroidery" || stage === "Alteration") {
    return "Finishing";
  }
  if (stage === "Trial" || stage === "Finishing") return "Ready";
  return "Ready";
}
