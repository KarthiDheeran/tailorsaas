"use server";

import { getServerCallerPermissions } from "@/lib/auth/require-server-permission";
import {
  getWhatsAppMessages,
  isMissingWhatsAppMessagesSchemaError,
  logWhatsAppMessage,
  type WhatsAppMessageInput,
} from "@/lib/data/whatsapp-messages-db";
import { hasAnyPermission } from "@/lib/permissions";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { WhatsAppMessage } from "@/lib/types";

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
