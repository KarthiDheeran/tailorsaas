"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Clears the profile flag first. If the trusted auth metadata update fails,
// middleware continues enforcing the existing true metadata value, which is
// fail-closed rather than allowing a forced-password user to bypass the flow.
export async function markPasswordChangedAction(): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Your session has expired. Please sign in again." };

  const { error: profileError } = await supabase.rpc("mark_password_changed");
  if (profileError) return { success: false, error: profileError.message };

  const admin = createAdminClient();
  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, must_change_password: false },
  });
  if (metadataError) return { success: false, error: metadataError.message };

  return { success: true };
}
