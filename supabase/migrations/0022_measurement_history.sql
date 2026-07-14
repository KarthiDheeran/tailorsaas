-- Append-only measurement revisions. The existing customer_measurements and
-- garment_measurements tables remain the fast "latest value" records used by
-- orders, job cards, and summaries.

create table customer_measurement_revisions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  values jsonb not null default '{}',
  notes text,
  source text not null default 'Manual',
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table garment_measurement_revisions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  garment_type text not null,
  values jsonb not null default '{}',
  fit_notes text,
  notes text,
  source text not null default 'Manual',
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index customer_measurement_revisions_customer_created_idx
  on customer_measurement_revisions (customer_id, created_at desc);

create index garment_measurement_revisions_customer_created_idx
  on garment_measurement_revisions (customer_id, created_at desc);

create index garment_measurement_revisions_customer_type_created_idx
  on garment_measurement_revisions (customer_id, lower(trim(garment_type)), created_at desc);

insert into customer_measurement_revisions (
  customer_id, values, notes, source, created_at
)
select customer_id, values, notes, 'Existing latest import', updated_at
from customer_measurements;

insert into garment_measurement_revisions (
  customer_id, garment_type, values, fit_notes, notes, source, created_at
)
select
  customer_id,
  garment_type,
  values,
  fit_notes,
  notes,
  'Existing latest import',
  updated_at
from garment_measurements;

alter table customer_measurement_revisions enable row level security;
alter table garment_measurement_revisions enable row level security;

create policy customer_measurement_revisions_select on customer_measurement_revisions
  for select
  using (auth_has_permission('customers.viewMeasurements'));

create policy customer_measurement_revisions_insert on customer_measurement_revisions
  for insert
  with check (auth_has_permission('customers.editMeasurements'));

create policy garment_measurement_revisions_select on garment_measurement_revisions
  for select
  using (auth_has_permission('customers.viewMeasurements'));

create policy garment_measurement_revisions_insert on garment_measurement_revisions
  for insert
  with check (auth_has_permission('customers.editMeasurements'));

grant select, insert on customer_measurement_revisions, garment_measurement_revisions
  to authenticated, service_role;
