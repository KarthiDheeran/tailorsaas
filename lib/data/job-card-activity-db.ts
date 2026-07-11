import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobCardStage } from "@/lib/job-cards";
import type { JobCardActivityAction, JobCardActivityLog } from "@/lib/types";

export interface JobCardActivityInput {
  jobCardId: string;
  orderId: string;
  actionType: JobCardActivityAction;
  fromStage?: JobCardStage;
  toStage?: JobCardStage;
  assignedStaffId?: string | null;
  notes?: string;
  performedBy?: string;
}

interface JobCardActivityRow {
  id: string;
  job_card_id: string;
  order_id: string;
  action_type: JobCardActivityAction;
  from_stage: string | null;
  to_stage: string | null;
  assigned_staff_id: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
}

const JOB_CARD_ACTIVITY_COLUMNS =
  "id, job_card_id, order_id, action_type, from_stage, to_stage, assigned_staff_id, notes, performed_by, created_at";

export function isMissingJobCardActivitySchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("job_card_activity_logs")
  );
}

export async function getJobCardActivityLogs(
  supabase: SupabaseClient,
  jobCardId: string
): Promise<JobCardActivityLog[]> {
  const { data, error } = await supabase
    .from("job_card_activity_logs")
    .select(JOB_CARD_ACTIVITY_COLUMNS)
    .eq("job_card_id", jobCardId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as unknown as JobCardActivityRow[]) ?? []).map(mapJobCardActivity);
}

export async function logJobCardActivity(
  supabase: SupabaseClient,
  input: JobCardActivityInput
): Promise<void> {
  const { error } = await supabase.from("job_card_activity_logs").insert({
    job_card_id: input.jobCardId,
    order_id: input.orderId,
    action_type: input.actionType,
    from_stage: input.fromStage ?? null,
    to_stage: input.toStage ?? null,
    assigned_staff_id: input.assignedStaffId ?? null,
    notes: input.notes?.trim() || null,
    performed_by: input.performedBy ?? null,
  });
  if (error) throw error;
}

function mapJobCardActivity(row: JobCardActivityRow): JobCardActivityLog {
  return {
    id: row.id,
    jobCardId: row.job_card_id,
    orderId: row.order_id,
    actionType: row.action_type,
    fromStage: row.from_stage ?? undefined,
    toStage: row.to_stage ?? undefined,
    assignedStaffId: row.assigned_staff_id ?? undefined,
    notes: row.notes ?? undefined,
    performedBy: row.performed_by ?? undefined,
    createdAt: row.created_at,
  };
}
