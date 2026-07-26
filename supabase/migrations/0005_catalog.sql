-- Phase 6B: real tables for the Catalog module (Garment Types + Add-ons/
-- Extras master). Independent of customers/orders/staff — no FKs to any
-- other table. Orders/Staff/Reports/Dashboard stay mock; only Catalog's own
-- admin module and New Order's read-only catalog lookups are converted in
-- this phase (see lib/data/catalog-db.ts and the new-order-items-card.tsx /
-- orders/new/page.tsx changes for the New Order side).
--
-- Tables start empty in production. The 6 garment types / 9 add-ons that
-- shipped as the original Catalog module's seed data live in a separate,
-- optional dev-seed script (supabase/seed/dev_catalog_seed.sql), not here.

create table catalog_addons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_price numeric not null check (default_price >= 0),
  worker_stage_rates jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table catalog_work_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stage_key text not null unique,
  display_order integer not null default 1 check (display_order >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- addon_ids is a plain uuid[] (no array FK — Postgres doesn't support those
-- natively), same "don't overbuild a join table" call already made for this
-- table in the Phase 6 top-level plan. Every id is re-validated against
-- catalog_addons by the Server Action before a write is accepted (see
-- app/(shell)/catalog/actions.ts) rather than enforced at the DB level.
create table catalog_garment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_price numeric not null check (base_price >= 0),
  measurement_field_ids text[] not null default '{}',
  addon_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table catalog_addons enable row level security;
alter table catalog_work_stages enable row level security;
alter table catalog_garment_types enable row level security;

-- catalog.view to read, catalog.manage to write. No delete policy on either
-- table — same no-hard-delete convention as everywhere else (deactivate via
-- is_active = false).
create policy catalog_addons_select on catalog_addons
  for select
  using (auth_has_permission('catalog.view'));

create policy catalog_addons_insert on catalog_addons
  for insert
  with check (auth_has_permission('catalog.manage'));

create policy catalog_addons_update on catalog_addons
  for update
  using (auth_has_permission('catalog.manage'))
  with check (auth_has_permission('catalog.manage'));

create policy catalog_work_stages_select on catalog_work_stages
  for select
  using (auth_has_permission('catalog.view'));

create policy catalog_work_stages_insert on catalog_work_stages
  for insert
  with check (auth_has_permission('catalog.manage'));

create policy catalog_work_stages_update on catalog_work_stages
  for update
  using (auth_has_permission('catalog.manage'))
  with check (auth_has_permission('catalog.manage'));

create policy catalog_garment_types_select on catalog_garment_types
  for select
  using (auth_has_permission('catalog.view'));

create policy catalog_garment_types_insert on catalog_garment_types
  for insert
  with check (auth_has_permission('catalog.manage'));

create policy catalog_garment_types_update on catalog_garment_types
  for update
  using (auth_has_permission('catalog.manage'))
  with check (auth_has_permission('catalog.manage'));

insert into catalog_work_stages (name, stage_key, display_order, is_active)
values
  ('Measurement', 'Measurement', 1, true),
  ('Cutting', 'Cutting', 2, true),
  ('Stitching', 'Stitching', 3, true),
  ('Embroidery', 'Embroidery', 4, true),
  ('Finishing', 'Finishing', 5, true),
  ('Alteration', 'Alteration', 6, true),
  ('Ironing/Packing', 'Ironing/Packing', 7, true),
  ('Delivery', 'Delivery', 8, true);

-- Base grants in the SAME migration as the tables/RLS (the gap 0003 had to
-- patch retroactively for roles/staff/profiles). `anon` deliberately
-- excluded — every policy above requires an authenticated, active,
-- permission-holding profile.
grant select, insert, update on catalog_addons, catalog_work_stages, catalog_garment_types
  to authenticated, service_role;
