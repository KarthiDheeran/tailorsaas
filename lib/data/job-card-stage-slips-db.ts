import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrderById } from "@/lib/data/orders-db";
import { getStaffById } from "@/lib/data/staff-db";
import { staffGarmentStageRate } from "@/lib/staff-rates";
import type { CustomerSnapshot, OrderItemAddOn, TaskType } from "@/lib/types";

export interface JobCardStageSlip {
  id: string;
  scanToken: string;
  slipCode: string;
  orderId: string;
  orderItemSerialNo: number;
  unitNo: number;
  orderNumber: string;
  customerId: string;
  customerSnapshot?: CustomerSnapshot;
  garmentType: string;
  quantity: number;
  stage: TaskType;
  staffId?: string;
  staffName: string;
  wageRate: number;
  wageAmount: number;
  measurementsSnapshot?: Record<string, unknown>;
  fieldSchemaSnapshot?: Record<string, unknown>;
  addOnsSnapshot?: OrderItemAddOn[];
  labourAddOnsSnapshot?: OrderItemAddOn[];
  notes?: string;
  printedAt: string;
  talliedAt?: string;
  createdAt: string;
}

export interface CreateJobCardStageSlipInput {
  orderId: string;
  orderItemSerialNo: number;
  unitNo: number;
  /** Number of consecutive garment units represented by this one barcode. */
  quantity?: number;
  stage: TaskType;
  staffId?: string;
  wageRate?: number;
  notes?: string;
}

const JOB_CARD_STAGE_SLIP_COLUMNS = `
  id, scan_token, slip_code, order_id, order_item_serial_no, unit_no, order_number, customer_id,
  customer_snapshot, garment_type, quantity, stage, staff_id, staff_name, wage_rate,
  wage_amount, measurements_snapshot, field_schema_snapshot, add_ons_snapshot, labour_add_ons_snapshot, notes,
  printed_at, tallied_at, created_at
`;

interface JobCardStageSlipRow {
  id: string;
  scan_token: string;
  slip_code: string | null;
  order_id: string;
  order_item_serial_no: number;
  unit_no: number;
  order_number: string;
  customer_id: string;
  customer_snapshot: CustomerSnapshot | null;
  garment_type: string;
  quantity: number;
  stage: TaskType;
  staff_id: string | null;
  staff_name: string;
  wage_rate: number;
  wage_amount: number;
  measurements_snapshot: Record<string, unknown> | null;
  field_schema_snapshot: Record<string, unknown> | null;
  add_ons_snapshot: OrderItemAddOn[] | null;
  labour_add_ons_snapshot: OrderItemAddOn[] | null;
  notes: string | null;
  printed_at: string;
  tallied_at: string | null;
  created_at: string;
}

function mapSlip(row: JobCardStageSlipRow): JobCardStageSlip {
  return {
    id: row.id,
    scanToken: row.scan_token,
    slipCode: row.slip_code ?? row.scan_token.slice(0, 10),
    orderId: row.order_id,
    orderItemSerialNo: row.order_item_serial_no,
    unitNo: row.unit_no,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    customerSnapshot: row.customer_snapshot ?? undefined,
    garmentType: row.garment_type,
    quantity: Number(row.quantity),
    stage: row.stage,
    staffId: row.staff_id ?? undefined,
    staffName: row.staff_name,
    wageRate: Number(row.wage_rate),
    wageAmount: Number(row.wage_amount),
    measurementsSnapshot: row.measurements_snapshot ?? undefined,
    fieldSchemaSnapshot: row.field_schema_snapshot ?? undefined,
    addOnsSnapshot: row.add_ons_snapshot ?? undefined,
    labourAddOnsSnapshot: row.labour_add_ons_snapshot ?? undefined,
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

function meaningfulMeasurements(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, raw]) => raw !== null && raw !== undefined && raw !== "" && (!Array.isArray(raw) || raw.length > 0));
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function labourAddOnsForStage(addOns: OrderItemAddOn[] | undefined, stage: TaskType): OrderItemAddOn[] {
  return (addOns ?? [])
    .map((addOn) => {
      const amount = Number(addOn.workerStageRates?.[stage] ?? 0);
      return Number.isFinite(amount) && amount > 0
        ? { key: addOn.key, label: addOn.label, amount }
        : null;
    })
    .filter((addOn): addOn is OrderItemAddOn => addOn !== null);
}

export async function createJobCardStageSlip(
  supabase: SupabaseClient,
  input: CreateJobCardStageSlipInput
): Promise<JobCardStageSlip> {
  const [order, staff] = await Promise.all([
    getOrderById(supabase, input.orderId),
    input.staffId ? getStaffById(supabase, input.staffId) : Promise.resolve(undefined),
  ]);
  if (!order) throw new Error("Order not found.");
  if (input.staffId && !staff) throw new Error("Worker not found.");

  const item = order.items.find((candidate) => candidate.serialNo === input.orderItemSerialNo);
  if (!item) throw new Error("Order item not found.");
  const unitNo = Math.max(1, Math.min(input.unitNo, Math.max(1, item.qty)));
  const rate = input.wageRate ?? staffGarmentStageRate(staff, item.garmentTypeId, input.stage);
  const wageRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  const availableQuantity = Math.max(1, item.qty - unitNo + 1);
  const requestedQuantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const quantity = Math.min(requestedQuantity, availableQuantity);
  const labourAddOns = labourAddOnsForStage(item.addOns, input.stage);
  const labourAddOnsTotal = labourAddOns.reduce((sum, addOn) => sum + addOn.amount, 0);

  const { data, error } = await supabase
    .from("job_card_stage_slips")
    .insert({
      order_id: order.id,
      order_item_serial_no: item.serialNo,
      unit_no: unitNo,
      order_number: order.orderNumber,
      customer_id: order.customerId,
      customer_snapshot: order.customerSnapshot ?? null,
      garment_type: item.size?.trim() ? `${item.particular} · ${item.size.trim()}` : item.particular,
      quantity,
      stage: input.stage,
      staff_id: staff?.id ?? null,
      staff_name: staff?.name ?? "Unassigned",
      wage_rate: wageRate,
      wage_amount: (wageRate + labourAddOnsTotal) * quantity,
      measurements_snapshot: meaningfulMeasurements(item.measurements),
      field_schema_snapshot: item.fieldSchemaSnapshot ?? null,
      add_ons_snapshot: item.addOns ?? null,
      labour_add_ons_snapshot: labourAddOns.length > 0 ? labourAddOns : null,
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
  const lookupColumn = normalized.startsWith("JCS-") ? "slip_code" : "scan_token";
  const { data, error } = await supabase
    .from("job_card_stage_slips")
    .select(JOB_CARD_STAGE_SLIP_COLUMNS)
    .eq(lookupColumn, token)
    .maybeSingle();
  if (error) {
    if (isMissingJobCardStageSlipsSchemaError(error)) return undefined;
    throw error;
  }
  if (data) return mapSlip(data as unknown as JobCardStageSlipRow);
  if (lookupColumn === "slip_code") return undefined;

  const { data: slipCodeData, error: slipCodeError } = await supabase
    .from("job_card_stage_slips")
    .select(JOB_CARD_STAGE_SLIP_COLUMNS)
    .eq("slip_code", normalized)
    .maybeSingle();
  if (slipCodeError) {
    if (isMissingJobCardStageSlipsSchemaError(slipCodeError)) return undefined;
    throw slipCodeError;
  }
  return slipCodeData ? mapSlip(slipCodeData as unknown as JobCardStageSlipRow) : undefined;
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

/**
 * Returns the most recent unscanned slip for one physical garment unit and
 * stage. Production bundles reuse this slip on reprint so one barcode cannot
 * be scanned twice for the same pending work.
 */
export async function getPendingJobCardStageSlip(
  supabase: SupabaseClient,
  input: Pick<CreateJobCardStageSlipInput, "orderId" | "orderItemSerialNo" | "unitNo" | "stage" | "quantity">
): Promise<JobCardStageSlip | undefined> {
  const { data, error } = await supabase
    .from("job_card_stage_slips")
    .select(JOB_CARD_STAGE_SLIP_COLUMNS)
    .eq("order_id", input.orderId)
    .eq("order_item_serial_no", input.orderItemSerialNo)
    .eq("unit_no", input.unitNo)
    .eq("stage", input.stage)
    .eq("quantity", input.quantity ?? 1)
    .is("tallied_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingJobCardStageSlipsSchemaError(error)) return undefined;
    throw error;
  }
  return data ? mapSlip(data as unknown as JobCardStageSlipRow) : undefined;
}

/**
 * Binds an unassigned printed slip to the worker who actually completed it.
 * The scan screen uses this immediately before tallying, so payroll is based
 * on the selected worker's rate instead of requiring assignment at print time.
 */
export async function assignJobCardStageSlipForTally(
  supabase: SupabaseClient,
  input: {
    id: string;
    staffId: string;
    staffName: string;
    wageRate: number;
    wageAmount: number;
  }
): Promise<JobCardStageSlip | undefined> {
  const { data, error } = await supabase
    .from("job_card_stage_slips")
    .update({
      staff_id: input.staffId,
      staff_name: input.staffName,
      wage_rate: input.wageRate,
      wage_amount: input.wageAmount,
    })
    .eq("id", input.id)
    .is("tallied_at", null)
    .select(JOB_CARD_STAGE_SLIP_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSlip(data as unknown as JobCardStageSlipRow) : undefined;
}

export async function getJobCardStageSlipsByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<JobCardStageSlip[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("job_card_stage_slips")
    .select(JOB_CARD_STAGE_SLIP_COLUMNS)
    .in("id", ids);
  if (error) {
    if (isMissingJobCardStageSlipsSchemaError(error)) return [];
    throw error;
  }
  const byId = new Map(
    ((data as unknown as JobCardStageSlipRow[]) ?? []).map((row) => [row.id, mapSlip(row)])
  );
  return ids.flatMap((id) => {
    const slip = byId.get(id);
    return slip ? [slip] : [];
  });
}
