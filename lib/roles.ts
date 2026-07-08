import type { Permission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Phase 3: roles are now real, Supabase-backed rows (supabase/migrations/
// 0001_auth_foundation.sql) — RLS-protected (settings.manageRoles required to
// write, any active profile can read), no service-role key needed. This is
// the first piece of the permission simulation to become fully real; see
// components/auth/current-user-provider.tsx for how a user's effective
// permissions get resolved through their assigned role, and
// lib/mock-users.ts for why *users* (profiles) stay mock a while longer.
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
  "orders.view",
  "orders.create",
  "orders.edit",
  "orders.cancel",
  "orders.changeStatus",
  "orders.viewPayments",
  "orders.printCustomerReceipt",
  "orders.printJobCard",
  "customers.view",
  "customers.create",
  "customers.edit",
  "customers.viewMeasurements",
  "customers.editMeasurements",
  "catalog.view",
  "reports.view",
];

export const DEFAULT_STAFF_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "orders.view",
  "orders.changeStatus",
  "orders.printJobCard",
  "customers.viewMeasurements",
];

export function isAdminRole(id: string): boolean {
  return id === SYSTEM_ROLE_IDS.ADMIN;
}

export interface RoleInput {
  name: string;
  description?: string;
  permissions: Permission[];
}

const ROLE_COLUMNS = "id,name,description,type,permissions";

export async function getRoles(): Promise<Role[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roles")
    .select(ROLE_COLUMNS)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Role[];
}

export async function getRoleById(id: string): Promise<Role | undefined> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roles")
    .select(ROLE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Role) ?? undefined;
}

export async function createRole(input: RoleInput): Promise<Role> {
  const supabase = createClient();
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
// its checklist entirely, and 0001's roles_update RLS policy blocks writes
// to id = 'role-admin' at the database level too, so this just skips the
// write attempt and returns the role as-is rather than sending a no-op
// update. System roles (Manager/Staff) also keep their seeded name/
// description — only permissions is ever mutable for them; custom roles
// allow name/description/permissions to all change.
export async function updateRole(id: string, input: RoleInput): Promise<Role | undefined> {
  const current = await getRoleById(id);
  if (!current) return undefined;
  if (isAdminRole(id)) return current;

  const supabase = createClient();
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

// Raw delete — doesn't check whether users are still assigned. Callers
// should gate on lib/mock-users.ts's canDeleteRole first (that's where the
// user-assignment count lives; kept out of this file to avoid a
// roles<->mock-users import cycle).
export async function deleteRole(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from("roles").delete().eq("id", id);
  return !error;
}
