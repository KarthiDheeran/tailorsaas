create extension if not exists pgcrypto;

create sequence if not exists public.job_card_stage_slip_code_seq;

create or replace function public.generate_job_card_stage_slip_code()
returns text
language sql
security definer
set search_path = public
as $$
  select 'JCS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.job_card_stage_slip_code_seq')::text, 5, '0')
$$;

create table if not exists public.job_card_stage_slips (
  id uuid primary key default gen_random_uuid(),
  scan_token text not null default upper(replace(gen_random_uuid()::text, '-', '')),
  slip_code text not null default public.generate_job_card_stage_slip_code(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_serial_no integer not null,
  unit_no integer not null default 1,
  order_number text not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_snapshot jsonb,
  garment_type text not null,
  quantity numeric not null default 1,
  stage text not null check (stage in
    ('Measurement','Cutting','Stitching','Embroidery','Finishing','Alteration','Ironing/Packing','Delivery')),
  staff_id uuid references public.staff(id) on delete restrict,
  staff_name text not null default 'Unassigned',
  wage_rate numeric not null default 0,
  wage_amount numeric not null default 0,
  measurements_snapshot jsonb,
  add_ons_snapshot jsonb,
  labour_add_ons_snapshot jsonb,
  notes text,
  printed_at timestamptz not null default now(),
  tallied_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists job_card_stage_slips_scan_token_key
  on public.job_card_stage_slips (scan_token);
create unique index if not exists job_card_stage_slips_slip_code_key
  on public.job_card_stage_slips (upper(slip_code));
create index if not exists job_card_stage_slips_staff_tallied_idx
  on public.job_card_stage_slips (staff_id, tallied_at);
create index if not exists job_card_stage_slips_order_idx
  on public.job_card_stage_slips (order_id, order_item_serial_no);

alter table public.job_card_stage_slips enable row level security;

create policy job_card_stage_slips_select on public.job_card_stage_slips for select
  using (auth_has_permission('orders.view') or auth_has_permission('staff.view'));

create policy job_card_stage_slips_insert on public.job_card_stage_slips for insert
  with check (auth_has_permission('orders.printJobCard') or auth_has_permission('staff.manage'));

create policy job_card_stage_slips_update on public.job_card_stage_slips for update
  using (auth_has_permission('staff.manage'))
  with check (auth_has_permission('staff.manage'));

grant select, insert, update on public.job_card_stage_slips to authenticated, service_role;
