import type { SupabaseClient } from "@supabase/supabase-js";
import type { Permission } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Phase 3: roles are now real, Supabase-backed rows (supabase/migrations/
// 0001_auth_foundation.sql) — RLS-protected (settings.manageRoles required to
// write, any active profile can read), no service-role key needed. This is
// the first piece of the permission simulation to become fully real; see
// components/auth/current-user-provider.tsx for how a user's effective
// permissions get resolved through their assigned role, and
// lib/mock-users.ts for why *users* (profiles) stay mock a while longer.
//
// Phase 5D: every function here now takes an already-constructed Supabase
// client as a parameter (same pattern as lib/profiles.ts) rather than
// creating a browser client itself — so the exact same code runs client-side
// (current-user-provider.tsx, passing the browser client, for reads) and
// server-side (app/(shell)/users-access/actions.ts, passing the server
// client, for the writes that now need authoritative re-validation) without
// duplicating the query logic.
// ---------------------------------------------------------------------------

export type RoleType = "system" | "custom";

export interface Role {
  id: string;
  name: string;
  description?: string;
  type: RoleType;
  permissions: Permission[];
}

export const SYSTEM_ROLE_IDS = {
  ADMIN: "role-admin",
  MANAGER: "role-manager",
  STAFF: "role-staff",
  TAILOR: "role-tailor",
  RECEPTIONIST: "role-receptionist",
  ACCOUNTANT: "role-accountant",
} as const;

// Manager/Staff system roles stay editable (with a "Reset to default"
// button), but the default they reset to has to live somewhere other than
// the live, mutable `permissions` column on the role row itself — these are
// that fixed reference. Admin has no default constant since it's always
// pinned to every permission (see updateRole below, and 0001's
// roles_update RLS policy, which blocks writes to id = 'role-admin' at the
// database level too).
export const DEFAULT_MANAGER_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "calendar.view",
  "orders.view",
  "orders.create",
  "orders.edit",
  "orders.cancel",
  "orders.changeStatus",
  "orders.viewPayments",
  "finance.income.view",
  "orders.recordPayment",
  "expenses.view",
  "expenses.manage",
  "inventory.view",
  "inventory.manage",
  "orders.printCustomerReceipt",
  "orders.printJobCard",
  "delivery.view",
  "customers.view",
  "customers.create",
  "customers.edit",
  "customers.viewMeasurements",
  "customers.editMeasurements",
  "communications.view",
  "catalog.view",
  "reports.view",
];

export const DEFAULT_STAFF_PERMISSIONS: Permission[] = [
  "staff.view",
  "customers.viewMeasurements",
];

export const DEFAULT_TAILOR_PERMISSIONS: Permission[] = [
  "staff.view",
  "customers.viewMeasurements",
];

export const DEFAULT_RECEPTIONIST_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "calendar.view",
  "orders.view",
  "orders.create",
  "orders.changeStatus",
  "orders.viewPayments",
  "orders.recordPayment",
  "orders.printCustomerReceipt",
  "orders.printJobCard",
  "delivery.view",
  "customers.view",
  "customers.create",
  "customers.edit",
  "customers.viewMeasurements",
  "customers.editMeasurements",
  "communications.view",
  "catalog.view",
];

export const DEFAULT_ACCOUNTANT_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "orders.view",
  "delivery.view",
  "orders.viewPayments",
  "finance.income.view",
  "orders.recordPayment",
  "orders.voidPayment",
  "orders.printCustomerReceipt",
  "expenses.view",
  "expenses.manage",
  "reports.view",
];

export const SYSTEM_ROLE_DEFAULT_PERMISSIONS: Partial<Record<string, Permission[]>> = {
  [SYSTEM_ROLE_IDS.MANAGER]: DEFAULT_MANAGER_PERMISSIONS,
  [SYSTEM_ROLE_IDS.STAFF]: DEFAULT_STAFF_PERMISSIONS,
  [SYSTEM_ROLE_IDS.TAILOR]: DEFAULT_TAILOR_PERMISSIONS,
  [SYSTEM_ROLE_IDS.RECEPTIONIST]: DEFAULT_RECEPTIONIST_PERMISSIONS,
  [SYSTEM_ROLE_IDS.ACCOUNTANT]: DEFAULT_ACCOUNTANT_PERMISSIONS,
};

export function isAdminRole(id: string): boolean {
  return id === SYSTEM_ROLE_IDS.ADMIN;
}

export interface RoleInput {
  name: string;
  description?: string;
  permissions: Permission[];
}

const ROLE_COLUMNS = "id,name,description,type,permissions";

export async function getRoles(supabase: SupabaseClient): Promise<Role[]> {
  const { data, error } = await supabase
    .from("roles")
    .select(ROLE_COLUMNS)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Role[];
}

export async function getRoleById(
  supabase: SupabaseClient,
  id: string
): Promise<Role | undefined> {
  const { data, error } = await supabase
    .from("roles")
    .select(ROLE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Role) ?? undefined;
}

export async function createRole(
  supabase: SupabaseClient,
  input: RoleInput
): Promise<Role> {
  const id = `role-custom-${crypto.randomUUID()}`;
  const { data, error } = await supabase
    .from("roles")
    .insert({
      id,
      name: input.name,
      description: input.description,
      type: "custom",
      permissions: input.permissions,
    })
    .select(ROLE_COLUMNS)
    .single();
  if (error) throw error;
  return data as Role;
}

// Admin's permissions can't be weakened here — the Roles UI already locks
// its checklist entirely, 0001's roles_update RLS policy blocks writes to
// id = 'role-admin' at the database level, and (Phase 5D)
// app/(shell)/users-access/actions.ts's updateRoleAction rejects the attempt
// outright with a clear error before ever calling this — this is a last-
// resort data-layer backstop, so it just skips the write attempt and
// returns the role as-is rather than sending a no-op update. System roles
// (Manager/Staff) also keep their seeded name/description — only
// permissions is ever mutable for them; custom roles allow name/
// description/permissions to all change.
export async function updateRole(
  supabase: SupabaseClient,
  id: string,
  input: RoleInput
): Promise<Role | undefined> {
  const current = await getRoleById(supabase, id);
  if (!current) return undefined;
  if (isAdminRole(id)) return current;

  const patch =
    current.type === "system"
      ? { permissions: input.permissions }
      : { name: input.name, description: input.description, permissions: input.permissions };

  const { data, error } = await supabase
    .from("roles")
    .update(patch)
    .eq("id", id)
    .select(ROLE_COLUMNS)
    .single();
  if (error) throw error;
  return data as Role;
}

// Raw delete — doesn't check role type or whether users are still assigned.
// Callers must gate on those first — see
// app/(shell)/users-access/actions.ts's deleteRoleAction, the sole caller as
// of Phase 5D.
export async function deleteRole(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await supabase.from("roles").delete().eq("id", id);
  return !error;
}
