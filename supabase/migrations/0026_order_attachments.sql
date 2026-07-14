-- Order/job attachments: design references, fabric photos, sample images, and
-- alteration photos. Files live in a private Supabase Storage bucket; metadata
-- is tied to an order and optionally a specific order item serial number.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-attachments',
  'order-attachments',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
on conflict (id) do nothing;

create table if not exists order_attachments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  order_item_serial_no int,
  attachment_type text not null
    check (attachment_type in ('Design Reference','Fabric Photo','Sample Photo','Trial Photo','Alteration Photo','Other')),
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size >= 0),
  storage_path text not null unique,
  notes text,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (order_id, order_item_serial_no)
    references order_items(order_id, serial_no) on delete cascade
);

create index if not exists order_attachments_order_created_idx
  on order_attachments (order_id, created_at desc);

create index if not exists order_attachments_order_item_idx
  on order_attachments (order_id, order_item_serial_no);

alter table order_attachments enable row level security;

drop policy if exists order_attachments_select on order_attachments;
create policy order_attachments_select on order_attachments
  for select
  using (auth_has_permission('orders.view'));

drop policy if exists order_attachments_insert on order_attachments;
create policy order_attachments_insert on order_attachments
  for insert
  with check (auth_has_permission('orders.edit'));

drop policy if exists order_attachments_delete on order_attachments;
create policy order_attachments_delete on order_attachments
  for delete
  using (auth_has_permission('orders.edit'));

grant select, insert, delete on order_attachments to authenticated, service_role;
