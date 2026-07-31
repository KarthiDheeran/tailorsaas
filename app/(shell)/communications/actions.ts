"use server";

import { getServerCallerPermissions } from "@/lib/auth/require-server-permission";
import { getCalendarData, type CalendarData } from "@/lib/calendar";
import { getCustomers } from "@/lib/data/customers-db";
import { getAllOrders } from "@/lib/data/orders-db";
import {
  getWhatsAppMessages,
  isMissingWhatsAppMessagesSchemaError,
  logWhatsAppMessage,
  type WhatsAppMessageInput,
} from "@/lib/data/whatsapp-messages-db";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Customer, Order, WhatsAppMessage } from "@/lib/types";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getWhatsAppMessagesAction(): Promise<WhatsAppMessage[] | null> {
  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (!hasAnyPermission(permissions, ["calendar.view", "orders.view", "customers.view"])) {
    return [];
  }

  try {
    return await getWhatsAppMessages(supabase);
  } catch (error) {
    if (isMissingWhatsAppMessagesSchemaError(error)) return null;
    throw error;
  }
}

export async function getReminderInboxAction(todayIso: string): Promise<CalendarData | null> {
  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (!hasAnyPermission(permissions, ["calendar.view", "orders.view", "customers.view"])) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayIso)) {
    throw new Error("A valid date is required.");
  }

  return getCalendarData(createAdminClient(), {
    startDate: addDays(todayIso, -14),
    endDate: addDays(todayIso, 21),
    todayIso,
    includePayments: hasPermission(permissions, "orders.viewPayments"),
  });
}

export async function getCommunicationTargetsAction(): Promise<{
  customers: Customer[];
  orders: Order[];
}> {
  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (!hasAnyPermission(permissions, ["orders.view", "customers.view"])) {
    return { customers: [], orders: [] };
  }

  const [customers, orders] = await Promise.all([
    hasPermission(permissions, "customers.view") ? getCustomers(supabase) : Promise.resolve([]),
    hasPermission(permissions, "orders.view") ? getAllOrders(supabase) : Promise.resolve([]),
  ]);
  return { customers, orders };
}

export async function logWhatsAppMessageAction(
  input: WhatsAppMessageInput
): Promise<ActionResult> {
  const supabase = createServerClient();
  const permissions = await getServerCallerPermissions(supabase);
  if (!hasAnyPermission(permissions, ["calendar.view", "orders.view", "customers.view"])) {
    return { success: false, error: "You don't have permission to log WhatsApp messages." };
  }

  if (!input.phone.trim()) return { success: false, error: "Phone is required." };
  if (!input.message.trim()) return { success: false, error: "Message is required." };

  try {
    await logWhatsAppMessage(supabase, input);
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingWhatsAppMessagesSchemaError(error)) {
      return { success: false, error: "WhatsApp message logging is not enabled yet." };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to log WhatsApp message.",
    };
  }
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
