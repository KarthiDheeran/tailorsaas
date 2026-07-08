// ---------------------------------------------------------------------------
// Frontend-only access simulation for MVP. Not real security. Replace with
// real auth/session and server-side permission enforcement before production.
// ---------------------------------------------------------------------------
//
// There is no login system, no session, and no backend in this app yet (see
// CLAUDE.md). This module defines the permission vocabulary only — key,
// label, and which module group it belongs to. Roles (lib/roles.ts) own
// sets of these permissions; users (lib/mock-users.ts) are assigned a role,
// not permissions directly — see components/auth/current-user-provider.tsx
// for how a user's effective permissions get resolved through their role.
// Nothing here is enforced server-side — it only hides/shows UI and blocks
// client-side navigation, so it must never be treated as a security boundary.

export type Permission =
  | "dashboard.view"
  | "orders.view"
  | "orders.create"
  | "orders.edit"
  | "orders.cancel"
  | "orders.changeStatus"
  | "orders.viewPayments"
  | "orders.printCustomerReceipt"
  | "orders.printJobCard"
  | "customers.view"
  | "customers.create"
  | "customers.edit"
  | "customers.viewMeasurements"
  | "customers.editMeasurements"
  | "catalog.view"
  | "catalog.manage"
  | "staff.view"
  | "staff.manage"
  | "reports.view"
  | "settings.view"
  | "settings.manageUsers"
  | "settings.manageRoles"
  | "shopSettings.view"
  | "shopSettings.edit";

export interface PermissionDefinition {
  key: Permission;
  label: string;
  group: string;
}

// Single source of truth — key, label, and group per permission. Order here
// is both the group display order and the within-group order everywhere
// permissions get listed (Roles checklist, etc).
export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: "dashboard.view", label: "View dashboard", group: "Dashboard" },

  { key: "orders.view", label: "View orders", group: "Orders" },
  { key: "orders.create", label: "Create orders", group: "Orders" },
  { key: "orders.edit", label: "Edit orders", group: "Orders" },
  { key: "orders.cancel", label: "Cancel orders", group: "Orders" },
  { key: "orders.changeStatus", label: "Change order status", group: "Orders" },
  { key: "orders.viewPayments", label: "View payment details", group: "Orders" },
  { key: "orders.printCustomerReceipt", label: "Print customer receipt", group: "Orders" },
  { key: "orders.printJobCard", label: "Print tailor job card", group: "Orders" },

  { key: "customers.view", label: "View customers", group: "Customers" },
  { key: "customers.create", label: "Create customers", group: "Customers" },
  { key: "customers.edit", label: "Edit customers", group: "Customers" },
  { key: "customers.viewMeasurements", label: "View measurements", group: "Customers" },
  { key: "customers.editMeasurements", label: "Edit measurements", group: "Customers" },

  { key: "catalog.view", label: "View catalog", group: "Catalog" },
  { key: "catalog.manage", label: "Manage catalog", group: "Catalog" },

  { key: "staff.view", label: "View staff", group: "Staff" },
  { key: "staff.manage", label: "Manage staff", group: "Staff" },

  { key: "reports.view", label: "View reports", group: "Reports" },

  { key: "settings.view", label: "View settings", group: "Settings" },
  { key: "settings.manageUsers", label: "Manage users", group: "Settings" },
  { key: "settings.manageRoles", label: "Manage roles and permissions", group: "Settings" },
  { key: "shopSettings.view", label: "View shop settings", group: "Settings" },
  { key: "shopSettings.edit", label: "Edit shop settings", group: "Settings" },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_DEFINITIONS.map((p) => p.key);

export const PERMISSION_LABELS: Record<Permission, string> = Object.fromEntries(
  PERMISSION_DEFINITIONS.map((p) => [p.key, p.label])
) as Record<Permission, string>;

export interface PermissionGroup {
  title: string;
  permissions: { key: Permission; label: string }[];
}

// Derived from PERMISSION_DEFINITIONS (grouped, preserving first-appearance
// order) — the shape the Roles checklist UI renders from. Kept as a derived
// value rather than hand-authored so the flat definition list stays the only
// place a permission's key/label/group is actually declared.
export const PERMISSION_GROUPS: PermissionGroup[] = (() => {
  const order: string[] = [];
  const byGroup = new Map<string, { key: Permission; label: string }[]>();
  for (const def of PERMISSION_DEFINITIONS) {
    if (!byGroup.has(def.group)) {
      byGroup.set(def.group, []);
      order.push(def.group);
    }
    byGroup.get(def.group)!.push({ key: def.key, label: def.label });
  }
  return order.map((title) => ({ title, permissions: byGroup.get(title)! }));
})();

// Accepts either a raw permission list or anything with a `permissions`
// field (e.g. a Role record), so call sites can pass a role/user directly.
export type PermissionSource =
  | Permission[]
  | { permissions: Permission[] }
  | null
  | undefined;

function resolvePermissions(source: PermissionSource): Permission[] {
  if (!source) return [];
  return Array.isArray(source) ? source : source.permissions;
}

export function hasPermission(
  userOrPermissions: PermissionSource,
  permission: Permission
): boolean {
  return resolvePermissions(userOrPermissions).includes(permission);
}

export function hasAnyPermission(
  userOrPermissions: PermissionSource,
  permissions: Permission[]
): boolean {
  const granted = resolvePermissions(userOrPermissions);
  return permissions.some((p) => granted.includes(p));
}

export function hasAllPermissions(
  userOrPermissions: PermissionSource,
  permissions: Permission[]
): boolean {
  const granted = resolvePermissions(userOrPermissions);
  return permissions.every((p) => granted.includes(p));
}

// Permission dependency graph (child -> required parent), enforced in the
// Roles permission checklist: checking a child auto-checks its parent;
// unchecking a parent auto-unchecks its children. Each entry here is a
// single level deep (no permission is both a parent and a child of
// another), so withPermissionDependencies below doesn't need to recurse.
export const PERMISSION_PARENT: Partial<Record<Permission, Permission>> = {
  "orders.create": "orders.view",
  "orders.edit": "orders.view",
  "orders.cancel": "orders.view",
  "orders.changeStatus": "orders.view",
  "orders.printCustomerReceipt": "orders.view",
  "orders.printJobCard": "orders.view",
  "orders.viewPayments": "orders.view",
  "customers.create": "customers.view",
  "customers.edit": "customers.view",
  "customers.editMeasurements": "customers.viewMeasurements",
  "catalog.manage": "catalog.view",
  "staff.manage": "staff.view",
  "settings.manageUsers": "settings.view",
  "settings.manageRoles": "settings.view",
  "shopSettings.edit": "shopSettings.view",
};

// Applies one checkbox toggle plus its cascade effect. Ordering matches the
// brief exactly: checking a child pulls its parent in; unchecking a parent
// pushes its children out. Unchecking a child never touches its parent, and
// checking a parent never touches its children.
export function withPermissionDependencies(
  permissions: Permission[],
  toggled: Permission,
  checked: boolean
): Permission[] {
  let next = checked
    ? Array.from(new Set([...permissions, toggled]))
    : permissions.filter((p) => p !== toggled);
  if (checked) {
    const parent = PERMISSION_PARENT[toggled];
    if (parent && !next.includes(parent)) next = [...next, parent];
  } else {
    const children = ALL_PERMISSIONS.filter((p) => PERMISSION_PARENT[p] === toggled);
    if (children.length > 0) next = next.filter((p) => !children.includes(p));
  }
  return next;
}
