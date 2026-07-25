import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrderById } from "@/lib/data/orders-db";
import { getStaffById } from "@/lib/data/staff-db";
import type { CustomerSnapshot, OrderItemAddOn, Staff, TaskType } from "@/lib/types";

export interface JobCardStageSlip {
  id: string;
  scanToken: string;
  orderId: string;
  orderItemSerialNo: number;
  unitNo: number;
  orderNumber: string;
  customerId: string;
  customerSnapshot?: CustomerSnapshot;
  garmentType: string;
  quantity: number;
  stage: TaskType;
  staffId: string;
  staffName: string;
  wageRate: number;
  wageAmount: number;
  measurementsSnapshot?: Record<string, string>;
  addOnsSnapshot?: OrderItemAddOn[];
  notes?: string;
  printedAt: string;
  talliedAt?: string;
  createdAt: string;
}

export interface CreateJobCardStageSlipInput {
  orderId: string;
  orderItemSerialNo: number;
  unitNo: number;
  stage: TaskType;
  staffId: string;
  wageRate?: number;
  notes?: string;
}

const JOB_CARD_STAGE_SLIP_COLUMNS = `
  id, scan_token, order_id, order_item_serial_no, unit_no, order_number, customer_id,
  customer_snapshot, garment_type, quantity, stage, staff_id, staff_name, wage_rate,
  wage_amount, measurements_snapshot, add_ons_snapshot, notes, printed_at, tallied_at,
  created_at
`;

interface JobCardStageSlipRow {
  id: string;
  scan_token: string;
  order_id: string;
  order_item_serial_no: number;
  unit_no: number;
  order_number: string;
  customer_id: string;
  customer_snapshot: CustomerSnapshot | null;
  garment_type: string;
  quantity: number;
  stage: TaskType;
  staff_id: string;
  staff_name: string;
  wage_rate: number;
  wage_amount: number;
  measurements_snapshot: Record<string, string> | null;
  add_ons_snapshot: OrderItemAddOn[] | null;
  notes: string | null;
  printed_at: string;
  tallied_at: string | null;
  created_at: string;
}

function mapSlip(row: JobCardStageSlipRow): JobCardStageSlip {
  return {
    id: row.id,
    scanToken: row.scan_token,
    orderId: row.order_id,
    orderItemSerialNo: row.order_item_serial_no,
    unitNo: row.unit_no,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    customerSnapshot: row.customer_snapshot ?? undefined,
    garmentType: row.garment_type,
    quantity: Number(row.quantity),
    stage: row.stage,
    staffId: row.staff_id,
    staffName: row.staff_name,
    wageRate: Number(row.wage_rate),
    wageAmount: Number(row.wage_amount),
    measurementsSnapshot: row.measurements_snapshot ?? undefined,
    addOnsSnapshot: row.add_ons_snapshot ?? undefined,
    notes: row.notes?.trim() ? row.notes : undefined,
    printedAt: row.printed_at,
    talliedAt: row.tallied_at ?? undefined,
    createdAt: row.created_at,
  };
}

export function isMissingJobCardStageSlipsSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("job_card_stage_slips");
}

function meaningfulMeasurements(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, raw]) => typeof raw === "string" && raw.trim() !== "")
    .map(([key, raw]) => [key, String(raw).trim()] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function staffRate(staff: Staff | undefined, stage: TaskType) {
  if (!staff || staff.paymentType !== "Per Piece") return 0;
  const rate = Number(staff.pieceRates?.[stage] ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

export async function createJobCardStageSlip(
  supabase: SupabaseClient,
  input: CreateJobCardStageSlipInput
): Promise<JobCardStageSlip> {
  const [order, staff] = await Promise.all([
    getOrderById(supabase, input.orderId),
    getStaffById(supabase, input.staffId),
  ]);
  if (!order) throw new Error("Order not found.");
  if (!staff) throw new Error("Worker not found.");

  const item = order.items.find((candidate) => candidate.serialNo === input.orderItemSerialNo);
  if (!item) throw new Error("Order item not found.");
  const unitNo = Math.max(1, Math.min(input.unitNo, Math.max(1, item.qty)));
  const rate = input.wageRate ?? staffRate(staff, input.stage);
  const wageRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  const quantity = 1;

  const { data, error } = await supabase
    .from("job_card_stage_slips")
    .insert({
      order_id: order.id,
      order_item_serial_no: item.serialNo,
      unit_no: unitNo,
      order_number: order.orderNumber,
      customer_id: order.customerId,
      customer_snapshot: order.customerSnapshot ?? null,
      garment_type: item.particular,
      quantity,
      stage: input.stage,
      staff_id: staff.id,
      staff_name: staff.name,
      wage_rate: wageRate,
      wage_amount: wageRate * quantity,
      measurements_snapshot: meaningfulMeasurements(item.measurements),
      add_ons_snapshot: item.addOns ?? null,
      notes: input.notes?.trim() || null,
    })
    .select(JOB_CARD_STAGE_SLIP_COLUMNS)
    .single();
  if (error) throw error;
  return mapSlip(data as unknown as JobCardStageSlipRow);
}

export async function getJobCardStageSlipById(
  supabase: SupabaseClient,
  id: string
): Promise<JobCardStageSlip | undefined> {
  const { data, error } = await supabase
    .from("job_card_stage_slips")
    .select(JOB_CARD_STAGE_SLIP_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingJobCardStageSlipsSchemaError(error)) return undefined;
    throw error;
  }
  return data ? mapSlip(data as unknown as JobCardStageSlipRow) : undefined;
}

export async function getJobCardStageSlipByScanCode(
  supabase: SupabaseClient,
  code: string
): Promise<JobCardStageSlip | undefined> {
  const normalized = code.trim().toUpperCase();
  const token = normalized.startsWith("TS|JOB|")
    ? normalized.slice("TS|JOB|".length)
    : normalized;
  if (!token) return undefined;
  const { data, error } = await supabase
    .from("job_card_stage_slips")
    .select(JOB_CARD_STAGE_SLIP_COLUMNS)
    .eq("scan_token", token)
    .maybeSingle();
  if (error) {
    if (isMissingJobCardStageSlipsSchemaError(error)) return undefined;
    throw error;
  }
  return data ? mapSlip(data as unknown as JobCardStageSlipRow) : undefined;
}

export async function markJobCardStageSlipTallied(
  supabase: SupabaseClient,
  id: string
): Promise<JobCardStageSlip | undefined> {
  const { data, error } = await supabase
    .from("job_card_stage_slips")
    .update({ tallied_at: new Date().toISOString() })
    .eq("id", id)
    .select(JOB_CARD_STAGE_SLIP_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSlip(data as unknown as JobCardStageSlipRow) : undefined;
}

export async function getTalliedJobCardStageSlips(
  supabase: SupabaseClient
): Promise<JobCardStageSlip[]> {
  const { data, error } = await supabase
    .from("job_card_stage_slips")
    .select(JOB_CARD_STAGE_SLIP_COLUMNS)
    .not("tallied_at", "is", null)
    .order("tallied_at", { ascending: false });
  if (error) {
    if (isMissingJobCardStageSlipsSchemaError(error)) return [];
    throw error;
  }
  return ((data as unknown as JobCardStageSlipRow[]) ?? []).map(mapSlip);
}
