import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WhatsAppMessage,
  WhatsAppMessageContextType,
  WhatsAppMessageStatus,
} from "@/lib/types";

export interface WhatsAppMessageInput {
  phone: string;
  message: string;
  contextType: WhatsAppMessageContextType;
  contextId?: string;
  status?: WhatsAppMessageStatus;
}

interface WhatsAppMessageRow {
  id: string;
  phone: string;
  message: string;
  context_type: WhatsAppMessageContextType;
  context_id: string | null;
  status: WhatsAppMessageStatus;
  sent_by: string | null;
  sent_at: string;
  created_at: string;
}

const WHATSAPP_MESSAGE_COLUMNS =
  "id, phone, message, context_type, context_id, status, sent_by, sent_at, created_at";

export function isMissingWhatsAppMessagesSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    message.includes("whatsapp_messages") ||
    message.includes("log_whatsapp_message")
  );
}

export async function getWhatsAppMessages(
  supabase: SupabaseClient,
  limit = 100
): Promise<WhatsAppMessage[]> {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select(WHATSAPP_MESSAGE_COLUMNS)
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown as WhatsAppMessageRow[]) ?? []).map(mapWhatsAppMessage);
}

export async function logWhatsAppMessage(
  supabase: SupabaseClient,
  input: WhatsAppMessageInput
): Promise<string> {
  const { data, error } = await supabase.rpc("log_whatsapp_message", {
    p_phone: input.phone,
    p_message: input.message,
    p_context_type: input.contextType,
    p_context_id: input.contextId ?? null,
    p_status: input.status ?? "Opened",
  });
  if (error) throw error;
  return data as string;
}

function mapWhatsAppMessage(row: WhatsAppMessageRow): WhatsAppMessage {
  return {
    id: row.id,
    phone: row.phone,
    message: row.message,
    contextType: row.context_type,
    contextId: row.context_id ?? undefined,
    status: row.status,
    sentBy: row.sent_by ?? undefined,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}
