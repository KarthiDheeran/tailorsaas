import type { SupabaseClient } from "@supabase/supabase-js";
import type { GarmentSection } from "@/lib/catalog";
import { SYSTEM_ROLE_IDS } from "@/lib/roles";

// ---------------------------------------------------------------------------
// Phase 4: the real replacement for lib/mock-users.ts's data — Supabase-
// backed `profiles` reads, plus the pure last-active-Admin safety check.
// Every function here takes an already-constructed Supabase client rather
// than creating one itself, so the same code works both client-side
// (components/auth/current-user-provider.tsx, passing the browser client)
// and server-side (app/(shell)/users-access/actions.ts, passing the
// cookie-based server client) without duplicating the query logic.
//
// Writes (create user, edit profile, reset password) intentionally do NOT
// live here — they go through the Server Actions in
// app/(shell)/users-access/actions.ts, since creating a user and resetting
// a password need the service-role key, and editing role/active needs the
// last-Admin guard enforced somewhere a client can't bypass.
// ---------------------------------------------------------------------------

export interface AppUser {
  id: string;
  full_name: string;
  phone: string | null;
  role_id: string;
  active: boolean;
  must_change_password: boolean;
  staff_id: string | null;
  tenant_id: string;
  shop_id: string | null;
  allowed_order_sections: GarmentSection[];
  preferred_theme?: "modern" | "classic" | "classic-dark";
  preferred_text_size?: "default" | "17" | "18" | "19" | "20";
}

const PROFILE_COLUMNS =
  "id, full_name, phone, role_id, active, must_change_password, staff_id, tenant_id, shop_id, allowed_order_sections, preferred_theme, preferred_text_size";

export async function getAppUsers(supabase: SupabaseClient): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as AppUser[];
}

export async function getAppUsersByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<AppUser[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("id", uniqueIds)
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as AppUser[];
}

export async function getAppUserById(
  supabase: SupabaseClient,
  id: string
): Promise<AppUser | undefined> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as AppUser) ?? undefined;
}

// Pure — takes an already-fetched users list rather than querying itself, so
// it can run synchronously for immediate UI feedback (disabling the
// Inactive option as soon as a role is picked, before any save) AND be the
// same logic the server action re-checks authoritatively (with its own
// freshly-fetched list, never trusting the client's copy). Mirrors
// lib/mock-users.ts's now-removed checkCanSaveUser exactly.
export function checkCanSaveUserGivenUsers(
  id: string,
  nextRoleId: string,
  nextActive: boolean,
  users: AppUser[]
): string | null {
  const willStayAdmin = nextActive && nextRoleId === SYSTEM_ROLE_IDS.ADMIN;
  if (willStayAdmin) return null;
  const otherActiveAdmins = users.filter(
    (u) => u.id !== id && u.active && u.role_id === SYSTEM_ROLE_IDS.ADMIN
  );
  if (otherActiveAdmins.length === 0) {
    return "This is the last active Admin user — assign another user to the Admin role first, or keep this one active on Admin.";
  }
  return null;
}
