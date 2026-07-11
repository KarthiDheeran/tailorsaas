-- Phase 1: auth foundation (roles, staff, profiles) + RLS.
--
-- Scope: this migration only creates the tables/policies/seed data needed to
-- back real login and role-based permissions. It does NOT touch business data
-- (customers/orders/catalog/staff work-assignments) — those stay on the
-- frontend mock arrays (lib/data/stub-data.ts etc.) until a later, separately
-- confirmed migration phase.
--
-- Apply via `supabase db push` (CLI, linked to the project) or by pasting
-- this file's contents into the Supabase dashboard's SQL Editor and running
-- it once — either way applies the same statements.

-- ---------------------------------------------------------------------------
-- roles — direct port of lib/roles.ts's Role type. Permission *keys* stay
-- defined in code (lib/permissions.ts's Permission union); this table only
-- stores which of those fixed keys a given role has granted.
-- ---------------------------------------------------------------------------
create table roles (
  id text primary key,                 -- 'role-admin' | 'role-manager' | 'role-staff' | 'role-custom-<n>'
  name text not null,
  description text,
  type text not null check (type in ('system', 'custom')),
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- staff — direct port of lib/types.ts's Staff type (HR/payroll record).
-- Created before `profiles` since profiles.staff_id references this table.
-- Deliberately not linked to login by default — see profiles.staff_id below.
-- ---------------------------------------------------------------------------
create table staff (
  id uuid primary key default gen_random_uuid(),
  staff_number text not null unique,
  name text not null,
  phone text not null,
  role text not null,                  -- StaffRole (Master Tailor, Cutter, ...)
  joining_date date not null,
  address text,
  emergency_contact text,
  status text not null check (status in ('Active', 'Inactive', 'On Leave')),
  notes text,
  payment_type text not null check (payment_type in ('Salary', 'Per Piece')),
  base_salary numeric,
  piece_rates jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles — the real replacement for lib/mock-users.ts's MockUser, 1:1 with
-- auth.users. No DB trigger creates this row: every account is created by a
-- server-side Admin API call (phase 4) that inserts auth.users and profiles
-- together in one place, so there's nothing to keep in sync via a trigger.
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role_id text not null references roles(id) on delete restrict,
  active boolean not null default true,
  -- Forces the "set a new password" step on first login for accounts created
  -- with an Admin-set temporary password (phase 2). Bootstrap Admin (see
  -- setup notes) is inserted with this already false, since that one account
  -- is created outside the app with a real password, not a temp one.
  must_change_password boolean not null default true,
  staff_id uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Permission-check helper, used by RLS policies below. Mirrors
-- lib/permissions.ts's hasPermission() logic — kept intentionally minimal
-- (single lookup: current auth.uid()'s active profile -> role -> permissions
-- array contains the given key). SECURITY DEFINER so it can read `roles`
-- even from a policy context that wouldn't otherwise have access; search_path
-- is pinned to prevent it resolving unqualified names against anything an
-- attacker could inject via a mutable session search_path.
-- ---------------------------------------------------------------------------
create function auth_has_permission(perm text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from profiles p
    join roles r on r.id = p.role_id
    where p.id = auth.uid()
      and p.active
      and perm = any(r.permissions)
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS — enabled on all three tables, default-deny (no policy = no access).
-- ---------------------------------------------------------------------------
alter table roles enable row level security;
alter table staff enable row level security;
alter table profiles enable row level security;

-- roles: any authenticated *active* user can read (needed to resolve their
-- own permissions, and to populate the Users & Access role dropdown) — a
-- deactivated profile's session can still authenticate with Supabase but
-- must not be able to read role data. Only settings.manageRoles can write.
create policy roles_select on roles
  for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.active
    )
  );

create policy roles_insert on roles
  for insert
  with check (auth_has_permission('settings.manageRoles'));

-- `id <> 'role-admin'` blocks the Admin role's permissions from being
-- weakened through normal authenticated/RLS access, even by someone who
-- holds settings.manageRoles — this is the DB-level backstop for the same
-- pin lib/roles.ts's updateRole() already applies at the application layer.
create policy roles_update on roles
  for update
  using (auth_has_permission('settings.manageRoles') and id <> 'role-admin')
  with check (auth_has_permission('settings.manageRoles') and id <> 'role-admin');

create policy roles_delete on roles
  for delete
  using (auth_has_permission('settings.manageRoles') and type = 'custom');

-- profiles: everyone can read their own row; settings.manageUsers can read
-- and write any row. No delete policy anywhere — deactivate via active =
-- false, matching the no-hard-delete convention already used for
-- Staff/Catalog/Add-ons elsewhere in this app.
create policy profiles_select_own on profiles
  for select
  using (id = auth.uid());

create policy profiles_select_managed on profiles
  for select
  using (auth_has_permission('settings.manageUsers'));

create policy profiles_insert on profiles
  for insert
  with check (auth_has_permission('settings.manageUsers'));

create policy profiles_update on profiles
  for update
  using (auth_has_permission('settings.manageUsers'))
  with check (auth_has_permission('settings.manageUsers'));

-- staff: staff.view to read, staff.manage to write. No delete policy (same
-- no-hard-delete convention as profiles/roles).
create policy staff_select on staff
  for select
  using (auth_has_permission('staff.view'));

create policy staff_insert on staff
  for insert
  with check (auth_has_permission('staff.manage'));

create policy staff_update on staff
  for update
  using (auth_has_permission('staff.manage'))
  with check (auth_has_permission('staff.manage'));

-- ---------------------------------------------------------------------------
-- Seed data — the 3 system roles, copied as-is from lib/roles.ts's
-- ROLE_PRESETS/DEFAULT_MANAGER_PERMISSIONS/DEFAULT_STAFF_PERMISSIONS. No
-- permission changes from what's already live in the frontend simulation.
-- ---------------------------------------------------------------------------
insert into roles (id, name, description, type, permissions) values
  (
    'role-admin',
    'Admin',
    'Full access to every module. Always has every permission — can''t be edited or deleted.',
    'system',
    array[
      'dashboard.view',
      'calendar.view',
      'orders.view', 'orders.create', 'orders.edit', 'orders.cancel', 'orders.changeStatus',
      'orders.viewPayments', 'orders.recordPayment', 'orders.voidPayment',
      'orders.printCustomerReceipt', 'orders.printJobCard',
      'expenses.view', 'expenses.manage',
      'inventory.view', 'inventory.manage',
      'customers.view', 'customers.create', 'customers.edit',
      'customers.viewMeasurements', 'customers.editMeasurements',
      'catalog.view', 'catalog.manage',
      'staff.view', 'staff.manage',
      'reports.view',
      'settings.view', 'settings.manageShop', 'settings.manageUsers', 'settings.manageRoles'
    ]
  ),
  (
    'role-manager',
    'Manager',
    'Runs daily operations: orders, customers, catalog viewing, reports.',
    'system',
    array[
      'dashboard.view',
      'calendar.view',
      'orders.view', 'orders.create', 'orders.edit', 'orders.cancel', 'orders.changeStatus',
      'orders.viewPayments', 'orders.recordPayment',
      'orders.printCustomerReceipt', 'orders.printJobCard',
      'expenses.view', 'expenses.manage',
      'inventory.view', 'inventory.manage',
      'customers.view', 'customers.create', 'customers.edit',
      'customers.viewMeasurements', 'customers.editMeasurements',
      'catalog.view',
      'reports.view'
    ]
  ),
  (
    'role-staff',
    'Staff',
    'Production-floor access: order status and job cards only — no money, no customer browsing.',
    'system',
    array[
      'staff.view',
      'customers.viewMeasurements'
    ]
  );
