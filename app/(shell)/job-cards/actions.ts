"use server";

import {
  getServerCallerContext,
  getServerCallerPermissions,
  requireServerPermission,
} from "@/lib/auth/require-server-permission";
import {
  assignJobCard,
  completeJobCard,
  getJobCardAssignedStaffId,
  getJobCards,
  isMissingJobCardsSchemaError,
  startJobCard,
  syncJobCardsForOrder,
  type JobCardAssignmentInput,
} from "@/lib/data/job-cards-db";
import { getStaff } from "@/lib/data/staff-db";
import type { JobCard } from "@/lib/job-cards";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import type { TaskPriority, TaskType } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const VALID_TASK_TYPES = new Set<TaskType>([
  "Measurement",
  "Cutting",
  "Stitching",
  "Embroidery",
  "Finishing",
  "Alteration",
  "Ironing/Packing",
  "Delivery",
]);
const VALID_PRIORITIES = new Set<TaskPriority>(["Low", "Normal", "High"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function getJobCardsAction(todayIso: string): Promise<JobCard[] | null> {
  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (!hasAnyPermission(permissions, ["orders.view", "staff.view"])) return [];

  try {
    const staffList = await getStaff(supabase).catch(() => []);
    return await getJobCards(supabase, todayIso, staffList);
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) return null;
    throw error;
  }
}

export async function assignJobCardAction(
  id: string,
  data: JobCardAssignmentInput
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "staff.manage");
  if (!guard.ok) return { success: false, error: guard.error };

  const validationError = validateAssignment(data);
  if (validationError) return { success: false, error: validationError };

  try {
    await assignJobCard(supabase, id, data);
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to assign job card.",
    };
  }
}

export async function startJobCardAction(
  id: string,
  todayIso: string
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireJobCardProgressAccess(supabase, id);
  if (!guard.ok) return { success: false, error: guard.error };
  if (!ISO_DATE.test(todayIso)) return { success: false, error: "A valid date is required." };

  try {
    await startJobCard(createAdminClient(), id, todayIso);
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to start job card.",
    };
  }
}

export async function completeJobCardAction(
  id: string,
  todayIso: string
): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireJobCardProgressAccess(supabase, id);
  if (!guard.ok) return { success: false, error: guard.error };
  if (!ISO_DATE.test(todayIso)) return { success: false, error: "A valid date is required." };

  try {
    await completeJobCard(createAdminClient(), id, todayIso);
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to complete job card.",
    };
  }
}

export async function syncJobCardsForOrderAction(orderId: string): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.edit");
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    await syncJobCardsForOrder(supabase, orderId);
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingJobCardsSchemaError(error)) {
      return { success: false, error: "Job cards are not enabled in this database yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to sync job cards.",
    };
  }
}

function validateAssignment(data: JobCardAssignmentInput): string | null {
  if (!VALID_TASK_TYPES.has(data.taskType)) return "Invalid task type.";
  if (!data.assignedStaffId.trim()) return "Assigned staff member is required.";
  if (!ISO_DATE.test(data.dueDate)) return "A valid due date is required.";
  if (!VALID_PRIORITIES.has(data.priority)) return "Invalid priority.";
  return null;
}

async function requireJobCardProgressAccess(
  supabase: ReturnType<typeof createServerClient>,
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const context = await getServerCallerContext(supabase);
  if (!context) return { ok: false, error: "Not signed in." };
  if (hasPermission(context.permissions, "staff.manage")) return { ok: true };
  if (!hasPermission(context.permissions, "staff.view") || !context.staffId) {
    return { ok: false, error: "You don't have permission to update this job card." };
  }

  const assignedStaffId = await getJobCardAssignedStaffId(supabase, id);
  if (assignedStaffId === undefined) return { ok: false, error: "Job card not found." };
  if (assignedStaffId !== context.staffId) {
    return { ok: false, error: "You can only update job cards assigned to you." };
  }
  return { ok: true };
}
