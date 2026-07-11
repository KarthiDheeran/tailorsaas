"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getServerCallerPermissions,
  requireServerPermission,
} from "@/lib/auth/require-server-permission";
import { hasPermission } from "@/lib/permissions";
import { getCalendarData, type CalendarData } from "@/lib/calendar";
import {
  isMissingCalendarRemindersSchemaError,
  markCalendarReminderSent,
  type CalendarReminderTargetType,
  type CalendarReminderType,
} from "@/lib/data/calendar-reminders-db";
import {
  isMissingWhatsAppMessagesSchemaError,
  logWhatsAppMessage,
} from "@/lib/data/whatsapp-messages-db";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_REMINDER_TYPES = new Set<CalendarReminderType>([
  "Delivery",
  "Trial",
  "Production",
  "Payment",
]);
const VALID_TARGET_TYPES = new Set<CalendarReminderTargetType>(["Order", "Job Card"]);

export async function getCalendarDataAction(input: {
  startDate: string;
  endDate: string;
  todayIso: string;
}): Promise<CalendarData | null> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "calendar.view");
  if (!guard.ok) return null;
  if (
    !ISO_DATE.test(input.startDate) ||
    !ISO_DATE.test(input.endDate) ||
    !ISO_DATE.test(input.todayIso) ||
    input.startDate > input.endDate
  ) {
    throw new Error("Invalid calendar date range.");
  }

  const permissions = await getServerCallerPermissions(supabase);
  return getCalendarData(createAdminClient(), {
    ...input,
    includePayments: hasPermission(permissions, "orders.viewPayments"),
  });
}

export async function markReminderSentAction(input: {
  eventKey: string;
  reminderType: CalendarReminderType;
  targetType: CalendarReminderTargetType;
  targetId?: string;
  reminderDate: string;
  message: string;
  phone?: string;
}): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "calendar.view");
  if (!guard.ok) return { success: false, error: guard.error };

  const validationError = validateReminderInput(input);
  if (validationError) return { success: false, error: validationError };

  try {
    await markCalendarReminderSent(supabase, input);
    if (input.phone?.trim()) {
      await logWhatsAppReminderIfEnabled(supabase, input);
    }
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingCalendarRemindersSchemaError(error)) {
      return {
        success: false,
        error: "Reminder tracking is not enabled in this database yet.",
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to mark reminder sent.",
    };
  }
}

async function logWhatsAppReminderIfEnabled(
  supabase: ReturnType<typeof createServerClient>,
  input: {
    targetId?: string;
    targetType: CalendarReminderTargetType;
    message: string;
    phone?: string;
  }
) {
  try {
    await logWhatsAppMessage(supabase, {
      phone: input.phone ?? "",
      message: input.message,
      contextType: input.targetType === "Job Card" ? "Job Card" : "Order",
      contextId: input.targetId,
      status: "Marked Sent",
    });
  } catch (error) {
    if (isMissingWhatsAppMessagesSchemaError(error)) return;
    throw error;
  }
}

function validateReminderInput(input: {
  eventKey: string;
  reminderType: CalendarReminderType;
  targetType: CalendarReminderTargetType;
  reminderDate: string;
  message: string;
}): string | null {
  if (!input.eventKey.trim()) return "Event key is required.";
  if (!VALID_REMINDER_TYPES.has(input.reminderType)) return "Invalid reminder type.";
  if (!VALID_TARGET_TYPES.has(input.targetType)) return "Invalid reminder target.";
  if (!ISO_DATE.test(input.reminderDate)) return "A valid reminder date is required.";
  if (!input.message.trim()) return "Reminder message is required.";
  return null;
}
