alter table public.staff
  add column if not exists can_take_measurements boolean not null default false,
  add column if not exists can_create_orders boolean not null default false,
  add column if not exists can_collect_payments boolean not null default false;

-- The customer's four front-desk staff handle all three operational duties.
update public.staff
set can_take_measurements = true,
    can_create_orders = true,
    can_collect_payments = true
where staff_code between 1 and 4;

create index if not exists idx_staff_active_measurement_takers
  on public.staff (tenant_id, status, can_take_measurements);
create index if not exists idx_staff_active_order_creators
  on public.staff (tenant_id, status, can_create_orders);
create index if not exists idx_staff_active_payment_collectors
  on public.staff (tenant_id, status, can_collect_payments);
