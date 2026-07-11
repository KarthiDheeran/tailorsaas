import type { SupabaseClient } from "@supabase/supabase-js";
import type { Permission } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";

// Shared by every Server Action that mutates or reads business data
// (Phase 5) — re-verifies the caller's session and a specific permission,
// server-side, using their own profiles/roles rows. Generalized from
// app/(shell)/users-access/actions.ts's Phase 4 requireManageUsers (which
// only ever checked one hardcoded permission); this version is parametrized
// since Phase 5 needs the same check for ~15 different permissions across
// Orders/Customers/Catalog/Staff.
//
// Client-side gating (RequirePermission/hasPermission in the UI) is a
// convenience for UX only — it is never a security boundary. Every Server
// Action must call this before doing anything, since a Server Action is a
// callable endpoint like any other and must not trust what the client
// claims its own permissions are.
export async function requireServerPermission(
  supabase: SupabaseClient,
  permission: Permission
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
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
  if (!role || !hasPermission(role.permissions ?? [], permission)) {
    return { ok: false, error: "You don't have permission to do this." };
  }
  return { ok: true, userId: user.id };
}

// For the rare action that needs the caller's full permission list rather
// than a single yes/no check (e.g. updateOrderStatusAction's multi-status
// rule) — returns null if not signed in or the account is inactive.
export async function getServerCallerPermissions(
  supabase: SupabaseClient
): Promise<Permission[] | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_id, active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !profile.active) return null;

  const { data: role } = await supabase
    .from("roles")
    .select("permissions")
    .eq("id", profile.role_id)
    .maybeSingle();
  return (role?.permissions as Permission[]) ?? [];
}

export async function getServerCallerContext(
  supabase: SupabaseClient
): Promise<{ userId: string; staffId: string | null; permissions: Permission[] } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_id, active, staff_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !profile.active) return null;

  const { data: role } = await supabase
    .from("roles")
    .select("permissions")
    .eq("id", profile.role_id)
    .maybeSingle();

  return {
    userId: user.id,
    staffId: (profile.staff_id as string | null) ?? null,
    permissions: (role?.permissions as Permission[]) ?? [],
  };
}
