import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_COMMUNICATION_TEMPLATES,
  mergeCommunicationTemplateDefaults,
} from "@/lib/communication-templates";
import type {
  CommunicationTemplate,
  CommunicationTemplateType,
} from "@/lib/types";

const TEMPLATE_COLUMNS =
  "template_type, title, body, active, whatsapp_enabled, sms_enabled, email_enabled, updated_at, updated_by";

interface CommunicationTemplateRow {
  template_type: CommunicationTemplateType;
  title: string;
  body: string;
  active: boolean;
  whatsapp_enabled: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export function isMissingCommunicationTemplatesSchemaError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; details?: string };
  const code = candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    message.includes("communication_templates") ||
    message.includes("whatsapp_enabled") ||
    message.includes("sms_enabled") ||
    message.includes("email_enabled") ||
    message.includes("save_communication_template")
  );
}

export async function getCommunicationTemplates(
  supabase: SupabaseClient
): Promise<CommunicationTemplate[]> {
  const { data, error } = await supabase
    .from("communication_templates")
    .select(TEMPLATE_COLUMNS)
    .order("template_type", { ascending: true });
  if (error) throw error;
  return mergeCommunicationTemplateDefaults(
    ((data as unknown as CommunicationTemplateRow[]) ?? []).map(mapTemplate)
  );
}

export async function getCommunicationTemplatesWithFallback(
  supabase: SupabaseClient
): Promise<{ templates: CommunicationTemplate[]; enabled: boolean }> {
  try {
    return { templates: await getCommunicationTemplates(supabase), enabled: true };
  } catch (error) {
    if (isMissingCommunicationTemplatesSchemaError(error)) {
      return { templates: DEFAULT_COMMUNICATION_TEMPLATES, enabled: false };
    }
    throw error;
  }
}

export async function saveCommunicationTemplate(
  supabase: SupabaseClient,
  input: {
    templateType: CommunicationTemplateType;
    body: string;
    active: boolean;
    whatsappEnabled: boolean;
    smsEnabled: boolean;
    emailEnabled: boolean;
  }
): Promise<void> {
  const { error } = await supabase.rpc("save_communication_template", {
    p_template_type: input.templateType,
    p_body: input.body,
    p_active: input.active,
    p_whatsapp_enabled: input.whatsappEnabled,
    p_sms_enabled: input.smsEnabled,
    p_email_enabled: input.emailEnabled,
  });
  if (error) throw error;
}

function mapTemplate(row: CommunicationTemplateRow): CommunicationTemplate {
  return {
    templateType: row.template_type,
    title: row.title,
    body: row.body,
    active: row.active,
    whatsappEnabled: row.whatsapp_enabled,
    smsEnabled: row.sms_enabled,
    emailEnabled: row.email_enabled,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? undefined,
  };
}
