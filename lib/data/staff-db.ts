import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrderById } from "@/lib/data/orders-db";
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
  id, staff_number, name, phone, role, joining_date, address,
  emergency_contact, status, notes, payment_type, base_salary, piece_rates
`;

interface StaffRow {
  id: string;
  staff_number: string;
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
  piece_rates: Partial<Record<TaskType, number>> | null;
}

function mapStaff(row: StaffRow): Staff {
  return {
    id: row.id,
    staffNumber: row.staff_number,
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
  };
}

export async function getStaff(supabase: SupabaseClient): Promise<Staff[]> {
  const { data, error } = await supabase
    .from("staff")
    .select(STAFF_COLUMNS)
    .order("name");
  if (error) throw error;
  return ((data as unknown as StaffRow[]) ?? []).map(mapStaff);
}

export async function getStaffById(
  supabase: SupabaseClient,
  id: string
): Promise<Staff | undefined> {
  const { data, error } = await supabase
    .from("staff")
    .select(STAFF_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapStaff(data as unknown as StaffRow) : undefined;
}

export interface StaffInput {
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

export async function createStaff(
  supabase: SupabaseClient,
  data: StaffInput
): Promise<Staff> {
  const { data: numberResult, error: numberError } = await supabase.rpc(
    "generate_staff_number"
  );
  if (numberError) throw numberError;

  const { data: row, error } = await supabase
    .from("staff")
    .insert({
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
    })
    .select(STAFF_COLUMNS)
    .single();
  if (error) throw error;
  return mapStaff(row as unknown as StaffRow);
}

export async function updateStaff(
  supabase: SupabaseClient,
  id: string,
  data: StaffInput
): Promise<Staff | undefined> {
  const { data: row, error } = await supabase
    .from("staff")
    .update({
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(STAFF_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return row ? mapStaff(row as unknown as StaffRow) : undefined;
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
  const rate = assignedStaff?.pieceRates?.[data.taskType] ?? 0;
  const wageAmount = item ? rate * item.qty : 0;

  const { data: row, error } = await supabase
    .from("work_assignments")
    .insert({
      order_id: data.orderId,
      order_item_serial_no: data.orderItemSerialNo,
      task_type: data.taskType,
      assigned_staff_id: data.assignedStaffId,
      assigned_date: data.assignedDate,
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

const STAFF_PAYMENT_COLUMNS = "id, staff_id, date, description, amount, payment_mode, notes";

interface StaffPaymentRow {
  id: string;
  staff_id: string;
  date: string;
  description: string;
  amount: number;
  payment_mode: PaymentMode;
  notes: string | null;
}

function mapStaffPayment(row: StaffPaymentRow): StaffPayment {
  return {
    id: row.id,
    staffId: row.staff_id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    paymentMode: row.payment_mode,
    notes: row.notes ?? undefined,
  };
}

export async function getStaffPayments(supabase: SupabaseClient): Promise<StaffPayment[]> {
  const { data, error } = await supabase.from("staff_payments").select(STAFF_PAYMENT_COLUMNS);
  if (error) throw error;
  return ((data as unknown as StaffPaymentRow[]) ?? []).map(mapStaffPayment);
}

export async function getStaffPaymentsForStaff(
  supabase: SupabaseClient,
  staffId: string
): Promise<StaffPayment[]> {
  const { data, error } = await supabase
    .from("staff_payments")
    .select(STAFF_PAYMENT_COLUMNS)
    .eq("staff_id", staffId);
  if (error) throw error;
  return ((data as unknown as StaffPaymentRow[]) ?? []).map(mapStaffPayment);
}

export interface StaffPaymentInput {
  staffId: string;
  date: string;
  description: string;
  amount: number;
  paymentMode: PaymentMode;
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
      notes: data.notes ?? null,
    })
    .select(STAFF_PAYMENT_COLUMNS)
    .single();
  if (error) throw error;
  return mapStaffPayment(row as unknown as StaffPaymentRow);
}
