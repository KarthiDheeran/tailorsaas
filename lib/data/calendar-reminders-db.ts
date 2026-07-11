import type { SupabaseClient } from "@supabase/supabase-js";

export type CalendarReminderType = "Delivery" | "Trial" | "Production" | "Payment";
export type CalendarReminderTargetType = "Order" | "Job Card";

export interface CalendarReminder {
  id: string;
  eventKey: string;
  reminderType: CalendarReminderType;
  targetType: CalendarReminderTargetType;
  targetId?: string;
  reminderDate: string;
  message: string;
  sentAt: string;
  sentBy?: string;
}

interface CalendarReminderRow {
  id: string;
  event_key: string;
  reminder_type: CalendarReminderType;
  target_type: CalendarReminderTargetType;
  target_id: string | null;
  reminder_date: string;
  message: string;
  sent_at: string;
  sent_by: string | null;
}

const REMINDER_COLUMNS =
  "id,event_key,reminder_type,target_type,target_id,reminder_date,message,sent_at,sent_by";

export function isMissingCalendarRemindersSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    message.includes("calendar_reminders") ||
    message.includes("mark_calendar_reminder_sent")
  );
}

export async function getCalendarReminders(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<CalendarReminder[]> {
  const { data, error } = await supabase
    .from("calendar_reminders")
    .select(REMINDER_COLUMNS)
    .gte("reminder_date", startDate)
    .lte("reminder_date", endDate);
  if (error) throw error;
  return ((data as CalendarReminderRow[]) ?? []).map(mapReminder);
}

export async function markCalendarReminderSent(
  supabase: SupabaseClient,
  input: {
    eventKey: string;
    reminderType: CalendarReminderType;
    targetType: CalendarReminderTargetType;
    targetId?: string;
    reminderDate: string;
    message: string;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc("mark_calendar_reminder_sent", {
    p_event_key: input.eventKey,
    p_reminder_type: input.reminderType,
    p_target_type: input.targetType,
    p_target_id: input.targetId ?? null,
    p_reminder_date: input.reminderDate,
    p_message: input.message,
  });
  if (error) throw error;
  return data as string;
}

function mapReminder(row: CalendarReminderRow): CalendarReminder {
  return {
    id: row.id,
    eventKey: row.event_key,
    reminderType: row.reminder_type,
    targetType: row.target_type,
    targetId: row.target_id ?? undefined,
    reminderDate: row.reminder_date,
    message: row.message,
    sentAt: row.sent_at,
    sentBy: row.sent_by ?? undefined,
  };
}
