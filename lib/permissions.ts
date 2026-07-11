// ---------------------------------------------------------------------------
// Permission vocabulary only — key, label, and which module group it belongs
// to. Real Supabase auth/session backs this as of Phase 1-4 (see CLAUDE.md):
// roles (lib/roles.ts) own sets of these permissions in a real `roles` table,
// and users (lib/profiles.ts, backed by a real `profiles` table) are assigned
// a role, not permissions directly — see components/auth/current-user-provider.tsx
// for how a user's effective permissions get resolved through their role.
// This module itself still isn't a security boundary on its own — it only
// drives client-side UI hide/show and navigation gating. The actual
// enforcement is lib/auth/require-server-permission.ts, called server-side
// by every Server Action before it touches data.
// ---------------------------------------------------------------------------

export type Permission =
  | "dashboard.view"
  | "orders.view"
  | "orders.create"
  | "orders.edit"
  | "orders.cancel"
  | "orders.changeStatus"
  | "orders.viewPayments"
  | "orders.recordPayment"
  | "orders.voidPayment"
  | "orders.printCustomerReceipt"
  | "orders.printJobCard"
  | "expenses.view"
  | "expenses.manage"
  | "inventory.view"
  | "inventory.manage"
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
  | "settings.manageRoles";

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
  { key: "orders.recordPayment", label: "Record a payment", group: "Orders" },
  { key: "orders.voidPayment", label: "Void a payment", group: "Orders" },
  { key: "orders.printCustomerReceipt", label: "Print customer receipt", group: "Orders" },
  { key: "orders.printJobCard", label: "Print tailor job card", group: "Orders" },

  { key: "expenses.view", label: "View expenses", group: "Accounts" },
  { key: "expenses.manage", label: "Manage expenses", group: "Accounts" },

  { key: "inventory.view", label: "View inventory", group: "Inventory" },
  { key: "inventory.manage", label: "Manage inventory", group: "Inventory" },

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
// unchecking a parent auto-unchecks its children. Most entries are a single
// level deep, but orders.voidPayment -> orders.recordPayment ->
// orders.viewPayments is a genuine two-level chain (orders.recordPayment is
// both a child and a parent) — withPermissionDependencies below walks the
// full chain in both directions rather than assuming one hop.
export const PERMISSION_PARENT: Partial<Record<Permission, Permission>> = {
  "orders.create": "orders.view",
  "orders.edit": "orders.view",
  "orders.cancel": "orders.view",
  "orders.changeStatus": "orders.view",
  "orders.printCustomerReceipt": "orders.view",
  "orders.printJobCard": "orders.view",
  "expenses.manage": "expenses.view",
  "inventory.manage": "inventory.view",
  "orders.viewPayments": "orders.view",
  "orders.recordPayment": "orders.viewPayments",
  "orders.voidPayment": "orders.recordPayment",
  "customers.create": "customers.view",
  "customers.edit": "customers.view",
  "customers.editMeasurements": "customers.viewMeasurements",
  "catalog.manage": "catalog.view",
  "staff.manage": "staff.view",
  "settings.manageUsers": "settings.view",
  "settings.manageRoles": "settings.view",
};

// Applies one checkbox toggle plus its cascade effect. Ordering matches the
// brief exactly: checking a child pulls its parent (and grandparent, etc.)
// in; unchecking a parent pushes its children (and grandchildren, etc.)
// out. Unchecking a child never touches its parent, and checking a parent
// never touches its children. Walks the full PERMISSION_PARENT chain rather
// than a single hop, since orders.recordPayment is both a child
// (of orders.viewPayments) and a parent (of orders.voidPayment) — a single-
// hop version would let voidPayment get checked without viewPayments, or
// stay checked after viewPayments is unchecked.
export function withPermissionDependencies(
  permissions: Permission[],
  toggled: Permission,
  checked: boolean
): Permission[] {
  let next = checked
    ? Array.from(new Set([...permissions, toggled]))
    : permissions.filter((p) => p !== toggled);
  if (checked) {
    let current = toggled;
    while (PERMISSION_PARENT[current]) {
      const parent = PERMISSION_PARENT[current]!;
      if (!next.includes(parent)) next = [...next, parent];
      current = parent;
    }
  } else {
    const toRemove = new Set<Permission>();
    let frontier: Permission[] = [toggled];
    while (frontier.length > 0) {
      const children = ALL_PERMISSIONS.filter((p) =>
        frontier.includes(PERMISSION_PARENT[p]!)
      );
      children.forEach((c) => toRemove.add(c));
      frontier = children;
    }
    if (toRemove.size > 0) next = next.filter((p) => !toRemove.has(p));
  }
  return next;
}
