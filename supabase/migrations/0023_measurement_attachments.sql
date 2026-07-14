-- Measurement attachments: photos, sketches, references, and alteration marks.
-- Files live in a private Supabase Storage bucket; this table stores searchable
-- metadata and links each object to a customer and optional garment type.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'measurement-attachments',
  'measurement-attachments',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
on conflict (id) do nothing;

create table measurement_attachments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  garment_type text,
  attachment_type text not null
    check (attachment_type in ('Fit Photo','Sketch','Reference','Alteration Mark','Other')),
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size >= 0),
  storage_path text not null unique,
  notes text,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index measurement_attachments_customer_created_idx
  on measurement_attachments (customer_id, created_at desc);

create index measurement_attachments_customer_garment_idx
  on measurement_attachments (customer_id, lower(trim(coalesce(garment_type, ''))));

alter table measurement_attachments enable row level security;

create policy measurement_attachments_select on measurement_attachments
  for select
  using (auth_has_permission('customers.viewMeasurements'));

create policy measurement_attachments_insert on measurement_attachments
  for insert
  with check (auth_has_permission('customers.editMeasurements'));

create policy measurement_attachments_delete on measurement_attachments
  for delete
  using (auth_has_permission('customers.editMeasurements'));

grant select, insert, delete on measurement_attachments to authenticated, service_role;
