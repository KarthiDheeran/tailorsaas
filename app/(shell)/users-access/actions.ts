"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/permissions";
import { checkCanSaveUserGivenUsers, getAppUsers } from "@/lib/profiles";

type ActionResult = { success: true } | { success: false; error: string };

// Re-verifies the caller actually holds settings.manageUsers, server-side,
// using their own session cookie — every action below calls this before
// touching anything. A Server Action is a callable endpoint like any other;
// client-side gating (RequirePermission/hasPermission in the UI) is a
// convenience, never a security boundary, so it's re-checked here from
// scratch rather than trusted.
async function requireManageUsers(
  supabase: SupabaseClient
): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_id, active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !profile.active) {
    return { ok: false, error: "Account inactive." };
  }

  const { data: role } = await supabase
    .from("roles")
    .select("permissions")
    .eq("id", profile.role_id)
    .maybeSingle();
  if (!role || !hasPermission(role.permissions ?? [], "settings.manageUsers")) {
    return { ok: false, error: "You don't have permission to manage users." };
  }
  return { ok: true };
}

export async function createUserAction(input: {
  fullName: string;
  email: string;
  tempPassword: string;
  roleId: string;
  phone?: string;
  staffId?: string;
}): Promise<ActionResult> {
  if (!input.fullName.trim()) return { success: false, error: "Name is required." };
  if (!input.email.trim()) return { success: false, error: "Email is required." };
  if (input.tempPassword.length < 8) {
    return { success: false, error: "Temporary password must be at least 8 characters." };
  }
  if (!input.roleId) return { success: false, error: "Select a role." };

  const supabase = createServerClient();
  const guard = await requireManageUsers(supabase);
  if (!guard.ok) return { success: false, error: guard.error };

  // Only auth.admin.createUser needs the service-role key — the profiles
  // insert below uses the regular RLS-respecting server client, since
  // 0001_auth_foundation.sql's profiles_insert policy already allows this
  // for any caller with settings.manageUsers (which requireManageUsers just
  // confirmed).
  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.tempPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return { success: false, error: createError?.message ?? "Could not create user." };
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: created.user.id,
    full_name: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    role_id: input.roleId,
    active: true,
    must_change_password: true,
    staff_id: input.staffId || null,
  });

  if (profileError) {
    // Roll back the auth user so a failed profile insert never leaves an
    // orphaned login with no profile behind it.
    await admin.auth.admin.deleteUser(created.user.id);
    return { success: false, error: profileError.message };
  }

  return { success: true };
}

export async function updateUserProfileAction(input: {
  id: string;
  fullName: string;
  phone?: string;
  roleId: string;
  active: boolean;
  staffId?: string;
}): Promise<ActionResult> {
  if (!input.fullName.trim()) return { success: false, error: "Name is required." };

  const supabase = createServerClient();
  const guard = await requireManageUsers(supabase);
  if (!guard.ok) return { success: false, error: guard.error };

  // Authoritative last-Admin check — fetched fresh here, never trusting
  // whatever list the client had in memory when it submitted.
  const users = await getAppUsers(supabase);
  const blockReason = checkCanSaveUserGivenUsers(input.id, input.roleId, input.active, users);
  if (blockReason) return { success: false, error: blockReason };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName.trim(),
      phone: input.phone?.trim() || null,
      role_id: input.roleId,
      active: input.active,
      staff_id: input.staffId || null,
    })
    .eq("id", input.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function resetUserPasswordAction(input: {
  userId: string;
  tempPassword: string;
}): Promise<ActionResult> {
  if (input.tempPassword.length < 8) {
    return { success: false, error: "Temporary password must be at least 8 characters." };
  }

  const supabase = createServerClient();
  const guard = await requireManageUsers(supabase);
  if (!guard.ok) return { success: false, error: guard.error };

  // Only auth.admin.updateUserById needs the service-role key — Admin never
  // sees the existing password (there is nothing to look up, only
  // overwrite), and it is never stored on the profiles row.
  const admin = createAdminClient();
  const { error: pwError } = await admin.auth.admin.updateUserById(input.userId, {
    password: input.tempPassword,
  });
  if (pwError) return { success: false, error: pwError.message };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", input.userId);
  if (profileError) return { success: false, error: profileError.message };

  return { success: true };
}
