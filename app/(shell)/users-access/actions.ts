"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import { checkCanSaveUserGivenUsers, getAppUsers } from "@/lib/profiles";
import { ALL_PERMISSIONS, PERMISSION_PARENT } from "@/lib/permissions";
import {
  createRole as createRoleData,
  deleteRole as deleteRoleData,
  getRoleById,
  isAdminRole,
  updateRole as updateRoleData,
  type Role,
  type RoleInput,
} from "@/lib/roles";

type ActionResult = { success: true } | { success: false; error: string };
type DataActionResult<T> = { success: true; data: T } | { success: false; error: string };

// Phase 5 generalized this into lib/auth/require-server-permission.ts (used
// by ~15 actions across Orders/Customers/Catalog/Staff now, not just this
// file) — kept as a thin wrapper here so every call site below didn't need
// to change.
async function requireManageUsers(
  supabase: Parameters<typeof requireServerPermission>[0]
): Promise<{ ok: true } | { ok: false; error: string }> {
  return requireServerPermission(supabase, "settings.manageUsers");
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
    app_metadata: { must_change_password: true },
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
    app_metadata: { must_change_password: true },
  });
  if (pwError) return { success: false, error: pwError.message };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", input.userId);
  if (profileError) return { success: false, error: profileError.message };

  return { success: true };
}

// ---------------------------------------------------------------------------
// Phase 5D: Roles CRUD — the one gap left over from Phase 3, which wired
// roles up to real Supabase reads/writes but never re-verified the caller's
// permission server-side (RLS alone protected the table, but couldn't
// express "every permission key must be real" or "a custom role in use
// can't be deleted"). Same requireServerPermission pattern as every other
// Phase 5 action.
// ---------------------------------------------------------------------------

function validateRoleInput(input: RoleInput): string | null {
  if (!input.name.trim()) return "Role name is required.";
  for (const permission of input.permissions) {
    if (!ALL_PERMISSIONS.includes(permission)) {
      return `Unknown permission: ${permission}.`;
    }
  }
  for (const permission of input.permissions) {
    const parent = PERMISSION_PARENT[permission];
    if (parent && !input.permissions.includes(parent)) {
      return `"${permission}" requires "${parent}" to also be granted.`;
    }
  }
  return null;
}

export async function createRoleAction(
  input: RoleInput
): Promise<DataActionResult<Role>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.manageRoles");
  if (!guard.ok) return { success: false, error: guard.error };

  const validationError = validateRoleInput(input);
  if (validationError) return { success: false, error: validationError };

  const role = await createRoleData(supabase, input);
  return { success: true, data: role };
}

export async function updateRoleAction(
  id: string,
  input: RoleInput
): Promise<DataActionResult<Role>> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.manageRoles");
  if (!guard.ok) return { success: false, error: guard.error };

  // Explicit, clear rejection rather than lib/roles.ts's silent no-op pin —
  // a direct call to this action (bypassing the UI, which already disables
  // Admin's entire checklist) must get an unambiguous error, not a
  // successful-looking response that quietly changed nothing.
  if (isAdminRole(id)) {
    return { success: false, error: "The Admin role cannot be edited." };
  }

  const validationError = validateRoleInput(input);
  if (validationError) return { success: false, error: validationError };

  const role = await updateRoleData(supabase, id, input);
  if (!role) return { success: false, error: "Role not found." };
  return { success: true, data: role };
}

export async function deleteRoleAction(id: string): Promise<ActionResult> {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "settings.manageRoles");
  if (!guard.ok) return { success: false, error: guard.error };

  const role = await getRoleById(supabase, id);
  if (!role) return { success: false, error: "Role not found." };
  if (role.type === "system") {
    return { success: false, error: "System roles cannot be deleted." };
  }

  // Authoritative "still assigned" check — fetched fresh here, never
  // trusting the client's own users list (same posture as
  // updateUserProfileAction's last-Admin check above).
  const users = await getAppUsers(supabase);
  if (users.some((u) => u.role_id === id)) {
    return {
      success: false,
      error: "Cannot delete a role that still has users assigned to it.",
    };
  }

  const ok = await deleteRoleData(supabase, id);
  if (!ok) return { success: false, error: "Could not delete role." };
  return { success: true };
}
