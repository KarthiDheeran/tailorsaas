"use server";

import { requireServerPermission } from "@/lib/auth/require-server-permission";
import {
  getCommunicationTemplatesWithFallback,
  isMissingCommunicationTemplatesSchemaError,
  saveCommunicationTemplate,
} from "@/lib/data/communication-templates-db";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { CommunicationTemplate, CommunicationTemplateType } from "@/lib/types";

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getCommunicationTemplatesAction(): Promise<{
  templates: CommunicationTemplate[];
  enabled: boolean;
}> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.view");
  if (!guard.ok) return { templates: [], enabled: false };
  return getCommunicationTemplatesWithFallback(supabase);
}

export async function saveCommunicationTemplateAction(input: {
  templateType: CommunicationTemplateType;
  body: string;
  active: boolean;
}): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.manageShop");
  if (!guard.ok) return { success: false, error: guard.error };
  if (!input.body.trim()) return { success: false, error: "Template body is required." };

  try {
    await saveCommunicationTemplate(supabase, input);
    return { success: true, data: undefined };
  } catch (error) {
    if (isMissingCommunicationTemplatesSchemaError(error)) {
      return {
        success: false,
        error: "Communication templates are not enabled in this database yet.",
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save template.",
    };
  }
}
