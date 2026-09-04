import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrderById } from "@/lib/data/orders-db";
import { staffGarmentStageRate } from "@/lib/staff-rates";
import type {
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

// ---------------------------------------------------------------------------
// Phase 6D: real, Supabase-backed replacements for lib/data/stub-data.ts's
// staff/work-assignment/payment functions — same names/shapes, each taking
// an already-constructed Supabase client first (same pattern as
// customers-db.ts/catalog-db.ts/orders-db.ts). Unlike Customers (6A),
// nothing outside the Staff module ever read these mock functions directly
// (confirmed — Reports/Dashboard have no staff dependency at all), so the
// old mock arrays/functions in stub-data.ts were deleted outright rather
// than left in place, same as Catalog (6B).
//
// work_assignments/staff_payments are built here for full data-layer parity
// with the mock, even though no UI reads/writes them yet (Work Queue/
// Payments tabs are still literal placeholder text) — same "migrate the
// whole surface, not just what's currently rendered" call already made for
// these same three functions when they were first wrapped in Server Actions
// back in Phase 5C.
// ---------------------------------------------------------------------------

const STAFF_COLUMNS = `
  id, tenant_id, shop_id, staff_number, staff_code, name, phone, role, joining_date, address,
  emergency_contact, status, notes, payment_type, base_salary, piece_rates, garment_stage_rates
`;
const LEGACY_STAFF_COLUMNS = `
  id, staff_number, staff_code, name, phone, role, joining_date, address,
  emergency_contact, status, notes, payment_type, base_salary, piece_rates, garment_stage_rates
`;

const STAFF_OPTION_COLUMNS = "id, tenant_id, shop_id, staff_number, staff_code, name, role, status";
const LEGACY_STAFF_OPTION_COLUMNS = "id, staff_number, staff_code, name, role, status";

interface StaffRow {
  id: string;
  tenant_id?: string | null;
  shop_id?: string | null;
  staff_number: string;
  staff_code: number;
  name: string;
  phone: string;
  role: StaffRole;
  joining_date: string;
  address: string | null;
  emergency_contact: string | null;
  status: StaffStatus;
  notes: string | null;
  payment_type: StaffPaymentType;
  base_salary: number | null;
  piece_rates: Partial<Record<string, number>> | null;
  garment_stage_rates: Record<string, Partial<Record<string, number>>> | null;
}

interface StaffOptionRow {
  id: string;
  tenant_id?: string | null;
  shop_id?: string | null;
  staff_number: string;
  staff_code: number;
  name: string;
  role: StaffRole;
  status: StaffStatus;
}

export interface StaffOption {
  id: string;
  tenantId?: string;
  shopId?: string;
  staffNumber: string;
  staffCode?: number;
  name: string;
  role: StaffRole;
  status: StaffStatus;
}

function mapStaff(row: StaffRow): Staff {
  return {
    id: row.id,
    staffNumber: String(row.staff_code),
    tenantId: row.tenant_id ?? undefined,
    shopId: row.shop_id ?? undefined,
    name: row.name,
    phone: row.phone,
    role: row.role,
    joiningDate: row.joining_date,
    address: row.address ?? "",
    emergencyContact: row.emergency_contact ?? "",
    status: row.status,
    notes: row.notes ?? undefined,
    paymentType: row.payment_type,
    baseSalary: row.base_salary ?? undefined,
    pieceRates: row.piece_rates ?? undefined,
    garmentStageRates: row.garment_stage_rates ?? undefined,
  };
}

function mapStaffOption(row: StaffOptionRow): StaffOption {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? undefined,
    shopId: row.shop_id ?? undefined,
    staffNumber: String(row.staff_code ?? row.staff_number),
    staffCode: row.staff_code ?? undefined,
    name: row.name,
    role: row.role,
    status: row.status,
  };
}

export async function getStaff(supabase: SupabaseClient): Promise<Staff[]> {
  let { data, error } = await supabase
    .from("staff")
    .select(STAFF_COLUMNS)
    .order("name");
  if (isMissingStaffShopColumnError(error)) {
    const fallback = await supabase.from("staff").select(LEGACY_STAFF_COLUMNS).order("name");
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return ((data as unknown as StaffRow[]) ?? []).map(mapStaff);
}

export async function getStaffOptions(
  supabase: SupabaseClient,
  options: { activeOnly?: boolean } = {}
): Promise<StaffOption[]> {
  let query = supabase
    .from("staff")
    .select(STAFF_OPTION_COLUMNS)
    .order("name");
  if (options.activeOnly) query = query.eq("status", "Active");
  let { data, error } = await query;
  if (isMissingStaffShopColumnError(error)) {
    let fallback = supabase.from("staff").select(LEGACY_STAFF_OPTION_COLUMNS).order("name");
    if (options.activeOnly) fallback = fallback.eq("status", "Active");
    const result = await fallback;
    data = result.data as unknown as typeof data;
    error = result.error;
  }
  if (error) throw error;
  return ((data as unknown as StaffOptionRow[]) ?? []).map(mapStaffOption);
}

export function filterStaffOptionsForShop(
  staff: StaffOption[],
  shopId: string | null | undefined
): StaffOption[] {
  if (!shopId) return staff;
  return staff.filter((member) => !member.shopId || member.shopId === shopId);
}

export async function getStaffById(
  supabase: SupabaseClient,
  id: string
): Promise<Staff | undefined> {
  let { data, error } = await supabase
    .from("staff")
    .select(STAFF_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (isMissingStaffShopColumnError(error)) {
    const fallback = await supabase
      .from("staff")
      .select(LEGACY_STAFF_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    data = fallback.data as unknown as typeof data;
    error = fallback.error;
  }
  if (error) throw error;
  return data ? mapStaff(data as unknown as StaffRow) : undefined;
}

export interface StaffInput {
  name: string;
  phone: string;
  tenantId?: string;
  shopId?: string;
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

export async function createStaff(
  supabase: SupabaseClient,
  data: StaffInput
): Promise<Staff> {
  const { data: numberResult, error: numberError } = await supabase.rpc(
    "generate_staff_number"
  );
  if (numberError) throw numberError;

  const insertPayload = {
    tenant_id: data.tenantId ?? null,
    shop_id: data.shopId ?? null,
    staff_number: numberResult as string,
    name: data.name,
    phone: data.phone,
    role: data.role,
    joining_date: data.joiningDate,
    address: data.address,
    emergency_contact: data.emergencyContact,
    status: data.status,
    notes: data.notes ?? null,
    payment_type: data.paymentType,
    base_salary: data.baseSalary ?? null,
    piece_rates: data.pieceRates ?? null,
    garment_stage_rates: data.garmentStageRates ?? null,
  };
  let { data: row, error } = await supabase
    .from("staff")
    .insert(insertPayload)
    .select(STAFF_COLUMNS)
    .single();
  if (isMissingStaffShopColumnError(error)) {
    const legacyPayload: Record<string, unknown> = { ...insertPayload };
    delete legacyPayload.tenant_id;
    delete legacyPayload.shop_id;
    const retry = await supabase
      .from("staff")
      .insert(legacyPayload)
      .select(LEGACY_STAFF_COLUMNS)
      .single();
    row = retry.data as unknown as typeof row;
    error = retry.error;
  }
  if (error) throw error;
  return mapStaff(row as unknown as StaffRow);
}

export async function updateStaff(
  supabase: SupabaseClient,
  id: string,
  data: StaffInput
): Promise<Staff | undefined> {
  const updatePayload = {
    tenant_id: data.tenantId ?? null,
    shop_id: data.shopId ?? null,
    name: data.name,
    phone: data.phone,
    role: data.role,
    joining_date: data.joiningDate,
    address: data.address,
    emergency_contact: data.emergencyContact,
    status: data.status,
    notes: data.notes ?? null,
    payment_type: data.paymentType,
    base_salary: data.baseSalary ?? null,
    piece_rates: data.pieceRates ?? null,
    garment_stage_rates: data.garmentStageRates ?? null,
    updated_at: new Date().toISOString(),
  };
  let { data: row, error } = await supabase
    .from("staff")
    .update(updatePayload)
    .eq("id", id)
    .select(STAFF_COLUMNS)
    .maybeSingle();
  if (isMissingStaffShopColumnError(error)) {
    const legacyPayload: Record<string, unknown> = { ...updatePayload };
    delete legacyPayload.tenant_id;
    delete legacyPayload.shop_id;
    const retry = await supabase
      .from("staff")
      .update(legacyPayload)
      .eq("id", id)
      .select(LEGACY_STAFF_COLUMNS)
      .maybeSingle();
    row = retry.data as unknown as typeof row;
    error = retry.error;
  }
  if (error) throw error;
  return row ? mapStaff(row as unknown as StaffRow) : undefined;
}

export function isMissingStaffShopColumnError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate?.code ?? "";
  const message = `${candidate?.message ?? ""} ${candidate?.details ?? ""}`.toLowerCase();
  return code === "PGRST204" || message.includes("tenant_id") || message.includes("shop_id");
}

const WORK_ASSIGNMENT_COLUMNS = `
  id, order_id, order_item_serial_no, task_type, assigned_staff_id,
  assigned_date, due_date, priority, started_date, completed_date,
  cancelled, work_notes, wage_amount
`;

interface WorkAssignmentRow {
  id: string;
  order_id: string;
  order_item_serial_no: number;
  task_type: TaskType;
  assigned_staff_id: string;
  assigned_date: string;
  due_date: string;
  priority: TaskPriority;
  started_date: string | null;
  completed_date: string | null;
  cancelled: boolean;
  work_notes: string | null;
  wage_amount: number;
}

function mapWorkAssignment(row: WorkAssignmentRow): WorkAssignment {
  return {
    id: row.id,
    orderId: row.order_id,
    orderItemSerialNo: row.order_item_serial_no,
    taskType: row.task_type,
    assignedStaffId: row.assigned_staff_id,
    assignedDate: row.assigned_date,
    dueDate: row.due_date,
    priority: row.priority,
    startedDate: row.started_date ?? undefined,
    completedDate: row.completed_date ?? undefined,
    cancelled: row.cancelled,
    workNotes: row.work_notes ?? undefined,
    wageAmount: row.wage_amount,
  };
}

export async function getWorkAssignments(
  supabase: SupabaseClient
): Promise<WorkAssignment[]> {
  const { data, error } = await supabase
    .from("work_assignments")
    .select(WORK_ASSIGNMENT_COLUMNS);
  if (error) throw error;
  return ((data as unknown as WorkAssignmentRow[]) ?? []).map(mapWorkAssignment);
}

export async function getWorkAssignmentsForStaff(
  supabase: SupabaseClient,
  staffId: string
): Promise<WorkAssignment[]> {
  const { data, error } = await supabase
    .from("work_assignments")
    .select(WORK_ASSIGNMENT_COLUMNS)
    .eq("assigned_staff_id", staffId);
  if (error) throw error;
  return ((data as unknown as WorkAssignmentRow[]) ?? []).map(mapWorkAssignment);
}

export async function getWorkAssignmentsForOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<WorkAssignment[]> {
  const { data, error } = await supabase
    .from("work_assignments")
    .select(WORK_ASSIGNMENT_COLUMNS)
    .eq("order_id", orderId);
  if (error) throw error;
  return ((data as unknown as WorkAssignmentRow[]) ?? []).map(mapWorkAssignment);
}

export async function getWorkAssignmentAssignedStaffId(
  supabase: SupabaseClient,
  id: string
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("work_assignments")
    .select("assigned_staff_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? (data as { assigned_staff_id: string }).assigned_staff_id : undefined;
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

// Resolves the real order/order item (lib/data/orders-db.ts, real since 6C)
// and the real staff member's piece rate to compute wageAmount — fixes the
// same class of "mock lookup against a real id" gap 6C already fixed for
// createOrder's customerSnapshot.
export async function createWorkAssignment(
  supabase: SupabaseClient,
  data: WorkAssignmentInput
): Promise<WorkAssignment> {
  const order = await getOrderById(supabase, data.orderId);
  const item = order?.items.find((i) => i.serialNo === data.orderItemSerialNo);
  const assignedStaff = await getStaffById(supabase, data.assignedStaffId);
  const rate = staffGarmentStageRate(assignedStaff, item?.garmentTypeId, data.taskType);
  const wageAmount = item ? rate * item.qty : 0;

  const { data: row, error } = await supabase
    .from("work_assignments")
    .insert({
      order_id: data.orderId,
      order_item_serial_no: data.orderItemSerialNo,
      task_type: data.taskType,
      assigned_staff_id: data.assignedStaffId,
      assigned_date: data.assignedDate,
      started_date: data.startedDate ?? null,
      due_date: data.dueDate,
      priority: data.priority,
      work_notes: data.workNotes ?? null,
      wage_amount: wageAmount,
    })
    .select(WORK_ASSIGNMENT_COLUMNS)
    .single();
  if (error) throw error;
  return mapWorkAssignment(row as unknown as WorkAssignmentRow);
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

export async function updateWorkAssignment(
  supabase: SupabaseClient,
  id: string,
  patch: WorkAssignmentPatch
): Promise<WorkAssignment | undefined> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.assignedStaffId !== undefined) update.assigned_staff_id = patch.assignedStaffId;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.startedDate !== undefined) update.started_date = patch.startedDate;
  if (patch.completedDate !== undefined) update.completed_date = patch.completedDate;
  if (patch.cancelled !== undefined) update.cancelled = patch.cancelled;
  if (patch.workNotes !== undefined) update.work_notes = patch.workNotes;

  const { data: row, error } = await supabase
    .from("work_assignments")
    .update(update)
    .eq("id", id)
    .select(WORK_ASSIGNMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return row ? mapWorkAssignment(row as unknown as WorkAssignmentRow) : undefined;
}

const STAFF_PAYMENT_COLUMNS = "id, staff_id, date, description, amount, payment_mode, notes, entry_type, created_at";
const LEGACY_STAFF_PAYMENT_COLUMNS = "id, staff_id, date, description, amount, payment_mode, notes, created_at";
const STAFF_WORK_EARNING_COLUMNS =
  "id, staff_id, job_card_id, order_id, job_card_number, task_type, completed_date, wage_rate, wage_amount, created_at";

interface StaffPaymentRow {
  id: string;
  staff_id: string;
  date: string;
  description: string;
  amount: number;
  payment_mode: PaymentMode;
  entry_type?: "Advance" | "Tea" | null;
  notes: string | null;
  created_at: string;
}

interface StaffWorkEarningRow {
  id: string;
  staff_id: string;
  job_card_id: string;
  order_id: string;
  job_card_number: string;
  task_type: TaskType;
  completed_date: string;
  wage_rate: number;
  wage_amount: number;
  created_at: string;
}

function mapStaffPayment(row: StaffPaymentRow): StaffPayment {
  return {
    id: row.id,
    staffId: row.staff_id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    paymentMode: row.payment_mode,
    entryType: row.entry_type ?? "Advance",
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function mapStaffWorkEarning(row: StaffWorkEarningRow): StaffWorkEarning {
  return {
    id: row.id,
    staffId: row.staff_id,
    jobCardId: row.job_card_id,
    orderId: row.order_id,
    jobCardNumber: row.job_card_number,
    taskType: row.task_type,
    completedDate: row.completed_date,
    wageRate: Number(row.wage_rate),
    wageAmount: Number(row.wage_amount),
    createdAt: row.created_at,
  };
}

export function isMissingStaffWorkEarningsSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("staff_work_earnings");
}

export async function getStaffPayments(
  supabase: SupabaseClient,
  options: { fromIso?: string; toIso?: string } = {}
): Promise<StaffPayment[]> {
  let query = supabase.from("staff_payments").select(STAFF_PAYMENT_COLUMNS);
  if (options.fromIso) query = query.gte("date", options.fromIso);
  if (options.toIso) query = query.lte("date", options.toIso);
  query = query.order("date", { ascending: false }).order("created_at", { ascending: false });
  let { data, error } = await query;
  if (error && (error.code === "PGRST204" || error.message?.toLowerCase().includes("entry_type"))) {
    let fallback = supabase.from("staff_payments").select(LEGACY_STAFF_PAYMENT_COLUMNS);
    if (options.fromIso) fallback = fallback.gte("date", options.fromIso);
    if (options.toIso) fallback = fallback.lte("date", options.toIso);
    const result = await fallback.order("date", { ascending: false }).order("created_at", { ascending: false });
    data = result.data as unknown as typeof data;
    error = result.error;
  }
  if (error) throw error;
  return ((data as unknown as StaffPaymentRow[]) ?? []).map(mapStaffPayment);
}

export async function getStaffPaymentsForStaff(
  supabase: SupabaseClient,
  staffId: string
): Promise<StaffPayment[]> {
  let { data, error } = await supabase
    .from("staff_payments")
    .select(STAFF_PAYMENT_COLUMNS)
    .eq("staff_id", staffId);
  if (error && (error.code === "PGRST204" || error.message?.toLowerCase().includes("entry_type"))) {
    const result = await supabase.from("staff_payments").select(LEGACY_STAFF_PAYMENT_COLUMNS).eq("staff_id", staffId);
    data = result.data as unknown as typeof data;
    error = result.error;
  }
  if (error) throw error;
  return ((data as unknown as StaffPaymentRow[]) ?? []).map(mapStaffPayment);
}

export async function getStaffWorkEarnings(
  supabase: SupabaseClient,
  options: { fromIso?: string; toIso?: string } = {}
): Promise<StaffWorkEarning[]> {
  let query = supabase
    .from("staff_work_earnings")
    .select(STAFF_WORK_EARNING_COLUMNS)
    .order("completed_date", { ascending: false });
  if (options.fromIso) query = query.gte("completed_date", options.fromIso);
  if (options.toIso) query = query.lte("completed_date", options.toIso);
  const { data, error } = await query;
  if (error) {
    if (isMissingStaffWorkEarningsSchemaError(error)) return [];
    throw error;
  }
  return ((data as unknown as StaffWorkEarningRow[]) ?? []).map(mapStaffWorkEarning);
}

export interface StaffWorkEarningInput {
  staffId: string;
  jobCardId: string;
  orderId: string;
  jobCardNumber: string;
  taskType: TaskType;
  completedDate: string;
  wageRate: number;
  wageAmount: number;
}

export async function recordStaffWorkEarning(
  supabase: SupabaseClient,
  input: StaffWorkEarningInput
): Promise<void> {
  const { error } = await supabase
    .from("staff_work_earnings")
    .upsert(
      {
        staff_id: input.staffId,
        job_card_id: input.jobCardId,
        order_id: input.orderId,
        job_card_number: input.jobCardNumber,
        task_type: input.taskType,
        completed_date: input.completedDate,
        wage_rate: input.wageRate,
        wage_amount: input.wageAmount,
      },
      { onConflict: "job_card_id,staff_id,task_type,completed_date", ignoreDuplicates: true }
    );
  if (error) {
    if (isMissingStaffWorkEarningsSchemaError(error)) return;
    throw error;
  }
}

export interface StaffPaymentInput {
  staffId: string;
  date: string;
  description: string;
  amount: number;
  paymentMode: PaymentMode;
  entryType?: "Advance" | "Tea";
  notes?: string;
}

export async function recordStaffPayment(
  supabase: SupabaseClient,
  data: StaffPaymentInput
): Promise<StaffPayment> {
  const { data: row, error } = await supabase
    .from("staff_payments")
    .insert({
      staff_id: data.staffId,
      date: data.date,
      description: data.description,
      amount: data.amount,
      payment_mode: data.paymentMode,
      entry_type: data.entryType ?? "Advance",
      notes: data.notes ?? null,
    })
    .select(STAFF_PAYMENT_COLUMNS)
    .single();
  if (error && (error.code === "PGRST204" || error.message?.toLowerCase().includes("entry_type"))) {
    if (data.entryType === "Tea") throw new Error("Apply migration 0092 before recording Tea payments.");
    const retry = await supabase.from("staff_payments").insert({ staff_id: data.staffId, date: data.date, description: data.description, amount: data.amount, payment_mode: data.paymentMode, notes: data.notes ?? null }).select(LEGACY_STAFF_PAYMENT_COLUMNS).single();
    if (retry.error) throw retry.error;
    return mapStaffPayment(retry.data as unknown as StaffPaymentRow);
  }
  if (error) throw error;
  return mapStaffPayment(row as unknown as StaffPaymentRow);
}
