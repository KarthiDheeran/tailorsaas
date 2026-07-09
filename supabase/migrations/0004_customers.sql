-- Phase 6A: real tables for Customers, Customer Measurements, and Garment
-- Measurements — the first business-data module moved off
-- lib/data/stub-data.ts's in-memory mock arrays. Orders/Catalog/Staff/
-- Reports stay mock for now (see lib/data/customers-db.ts and
-- lib/customers-db.ts for the parallel-file approach that keeps those
-- untouched while this migrates).
--
-- Tables start empty in production. Any sample/demo data lives in a
-- separate, optional dev-seed script (supabase/seed/dev_customers_seed.sql),
-- not in this migration.

-- ---------------------------------------------------------------------------
-- customer_number generation: a sequence owns uniqueness/concurrency safety,
-- a SQL function owns the CUST-0001 display format — so the format is
-- defined in exactly one place (here), not scattered across TS call sites.
-- ---------------------------------------------------------------------------
create sequence customer_number_seq start 1;

create function generate_customer_number()
returns text
language sql
as $$
  select 'CUST-' || lpad(nextval('customer_number_seq')::text, 4, '0');
$$;

create table customers (
  id uuid primary key default gen_random_uuid(),
  customer_number text not null unique,
  name text not null,
  phone text not null,
  address text not null default '',
  area text not null default '',
  gender text check (gender in ('Male', 'Female')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customer_measurements (
  customer_id uuid primary key references customers(id) on delete cascade,
  values jsonb not null default '{}',
  notes text,
  updated_at timestamptz not null default now()
);

-- garment_type_key is a stored generated column (not an expression index) so
-- Supabase's upsert(...).onConflict("customer_id,garment_type_key") can
-- target it directly as a real column-list unique constraint, rather than
-- relying on ilike() pattern matching (which doesn't exactly mirror
-- lower(trim(...))) or an expression-only unique index (which Supabase's
-- upsert onConflict can't target by expression).
create table garment_measurements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  garment_type text not null,
  garment_type_key text generated always as (lower(trim(garment_type))) stored,
  values jsonb not null default '{}',
  fit_notes text,
  notes text,
  updated_at timestamptz not null default now(),
  unique (customer_id, garment_type_key)
);

alter table customers enable row level security;
alter table customer_measurements enable row level security;
alter table garment_measurements enable row level security;

-- customers: customers.view to read, customers.create/edit to write. No
-- delete policy — no delete anywhere in the app for customers, matching the
-- no-hard-delete convention already used for Staff/Catalog/Roles.
create policy customers_select on customers
  for select
  using (auth_has_permission('customers.view'));

create policy customers_insert on customers
  for insert
  with check (auth_has_permission('customers.create'));

create policy customers_update on customers
  for update
  using (auth_has_permission('customers.edit'))
  with check (auth_has_permission('customers.edit'));

-- customer_measurements / garment_measurements: viewMeasurements to read,
-- editMeasurements to write. No delete policy.
create policy customer_measurements_select on customer_measurements
  for select
  using (auth_has_permission('customers.viewMeasurements'));

create policy customer_measurements_insert on customer_measurements
  for insert
  with check (auth_has_permission('customers.editMeasurements'));

create policy customer_measurements_update on customer_measurements
  for update
  using (auth_has_permission('customers.editMeasurements'))
  with check (auth_has_permission('customers.editMeasurements'));

create policy garment_measurements_select on garment_measurements
  for select
  using (auth_has_permission('customers.viewMeasurements'));

create policy garment_measurements_insert on garment_measurements
  for insert
  with check (auth_has_permission('customers.editMeasurements'));

create policy garment_measurements_update on garment_measurements
  for update
  using (auth_has_permission('customers.editMeasurements'))
  with check (auth_has_permission('customers.editMeasurements'));

-- Base grants in the SAME migration as the tables/RLS — the exact gap 0003
-- had to patch retroactively for roles/staff/profiles. `anon` is
-- deliberately excluded, same reasoning as 0003: every policy above requires
-- an authenticated, active, permission-holding profile.
grant select, insert, update on customers, customer_measurements, garment_measurements
  to authenticated, service_role;
grant usage on sequence customer_number_seq to authenticated, service_role;
grant execute on function generate_customer_number() to authenticated, service_role;
