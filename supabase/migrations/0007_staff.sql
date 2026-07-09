-- Phase 6D: Staff HR data moves onto the `staff` table that has existed
-- since Phase 1 (0001_auth_foundation.sql) — no new table, no column
-- changes there, its RLS/grants are already correct. This migration only
-- adds what didn't exist yet: work_assignments, staff_payments (built now
-- for full data-layer parity with the existing mock functions, per
-- explicit instruction — no new UI ships for either in this phase), and
-- the concurrency-safe staff_number generator.

-- ---------------------------------------------------------------------------
-- Staff number generation — same atomic-sequence pattern as
-- generate_customer_number() (6A), hardened the same way
-- generate_order_number()/peek_next_order_number() were in 6C: SECURITY
-- DEFINER, pinned search_path, internal permission check.
-- ---------------------------------------------------------------------------
create sequence staff_number_seq start 1;

create function generate_staff_number() returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not auth_has_permission('staff.manage') then
    raise exception 'permission denied: staff.manage required';
  end if;
  return 'STAFF-' || lpad(nextval('staff_number_seq')::text, 4, '0');
end;
$$;

grant usage on sequence staff_number_seq to authenticated, service_role;
grant execute on function generate_staff_number() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- work_assignments — references the real orders/order_items (6C) via a
-- composite FK against order_items' own unique(order_id, serial_no), so a
-- work assignment can never point at a garment line that doesn't actually
-- exist on that order (the mock's orderId + orderItemSerialNo pairing had
-- no such guarantee).
-- ---------------------------------------------------------------------------
create table work_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  order_item_serial_no int not null,
  task_type text not null check (task_type in
    ('Measurement','Cutting','Stitching','Embroidery','Finishing','Alteration','Ironing/Packing','Delivery')),
  assigned_staff_id uuid not null references staff(id) on delete restrict,
  assigned_date date not null,
  due_date date not null,
  priority text not null check (priority in ('Low','Normal','High')),
  started_date date,
  completed_date date,
  cancelled boolean not null default false,
  work_notes text,
  wage_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (order_id, order_item_serial_no) references order_items(order_id, serial_no) on delete cascade
);

create table staff_payments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete restrict,
  date date not null,
  description text not null,
  amount numeric not null check (amount >= 0),
  payment_mode text not null check (payment_mode in ('Cash','GPay','UPI','Card','Bank Transfer','Cheque')),
  notes text,
  created_at timestamptz not null default now()
);

alter table work_assignments enable row level security;
alter table staff_payments enable row level security;

create policy work_assignments_select on work_assignments for select
  using (auth_has_permission('staff.view'));
create policy work_assignments_insert on work_assignments for insert
  with check (auth_has_permission('staff.manage'));
create policy work_assignments_update on work_assignments for update
  using (auth_has_permission('staff.manage'))
  with check (auth_has_permission('staff.manage'));
-- No delete policy — cancel via the existing `cancelled` boolean, same
-- no-hard-delete convention as everywhere else.

create policy staff_payments_select on staff_payments for select
  using (auth_has_permission('staff.view'));
create policy staff_payments_insert on staff_payments for insert
  with check (auth_has_permission('staff.manage'));
-- No update/delete — recordStaffPayment has always been append-only in the
-- mock (no editStaffPayment function ever existed).

grant select, insert, update on work_assignments to authenticated, service_role;
grant select, insert on staff_payments to authenticated, service_role;
