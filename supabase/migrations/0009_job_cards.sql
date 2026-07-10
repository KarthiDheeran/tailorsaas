-- Phase 8A: persistent garment-level job cards.
--
-- Orders remain the customer/payment container. Job cards are the workshop
-- unit: one row per garment unit generated from order_items.qty.

create sequence job_card_number_seq start 1;

create function generate_job_card_number() returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not (auth_has_permission('orders.create') or auth_has_permission('orders.edit') or auth_has_permission('staff.manage')) then
    raise exception 'permission denied: job card generation requires order or staff management permission';
  end if;
  return 'JC-' || extract(year from now())::int || '-' || lpad(nextval('job_card_number_seq')::text, 4, '0');
end;
$$;

create table job_cards (
  id uuid primary key default gen_random_uuid(),
  job_card_number text not null unique,
  order_id uuid not null references orders(id) on delete cascade,
  order_number text not null,
  customer_id uuid not null references customers(id) on delete restrict,
  order_status text not null
    check (order_status in ('In Progress','Ready','Delayed','Delivered','Cancelled')),
  order_item_serial_no int not null,
  unit_no int not null check (unit_no > 0),
  garment_type text not null,
  customer_snapshot jsonb,
  measurements_snapshot jsonb,
  fabric_source text not null default 'Not specified'
    check (fabric_source in ('Not specified','Customer provided','Shop provided')),
  fabric_notes text,
  current_stage text not null default 'Unassigned'
    check (current_stage in (
      'Unassigned','Cutting','Stitching','Embroidery','Finishing',
      'Trial','Alteration','Ready','Delivered','Cancelled','Delayed'
    )),
  assigned_staff_id uuid references staff(id) on delete set null,
  priority text not null default 'Normal' check (priority in ('Low','Normal','High')),
  due_date date not null,
  trial_date date,
  started_date date,
  completed_date date,
  cancelled boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, order_item_serial_no, unit_no),
  foreign key (order_id, order_item_serial_no)
    references order_items(order_id, serial_no) on delete cascade
);

alter table job_cards enable row level security;

create policy job_cards_select on job_cards for select
  using (auth_has_permission('orders.view') or auth_has_permission('staff.view'));

create policy job_cards_insert on job_cards for insert
  with check (auth_has_permission('orders.create') or auth_has_permission('orders.edit') or auth_has_permission('staff.manage'));

create policy job_cards_update on job_cards for update
  using (auth_has_permission('orders.edit') or auth_has_permission('staff.manage') or auth_has_permission('orders.changeStatus'))
  with check (auth_has_permission('orders.edit') or auth_has_permission('staff.manage') or auth_has_permission('orders.changeStatus'));

grant usage on sequence job_card_number_seq to authenticated, service_role;
grant execute on function generate_job_card_number() to authenticated, service_role;
grant select, insert, update on job_cards to authenticated, service_role;

create function sync_job_cards_for_order(p_order_id uuid) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order orders%rowtype;
  v_item order_items%rowtype;
  v_unit int;
begin
  if not (auth_has_permission('orders.create') or auth_has_permission('orders.edit') or auth_has_permission('staff.manage')) then
    raise exception 'permission denied: cannot sync job cards';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'order not found: %', p_order_id;
  end if;

  for v_item in
    select * from order_items where order_id = p_order_id order by serial_no
  loop
    for v_unit in 1..v_item.qty loop
      insert into job_cards (
        job_card_number, order_id, order_number, customer_id, order_status,
        order_item_serial_no, unit_no, garment_type,
        customer_snapshot, measurements_snapshot, due_date, trial_date
      ) values (
        generate_job_card_number(), p_order_id, v_order.order_number, v_order.customer_id,
        v_order.status, v_item.serial_no, v_unit, v_item.particular,
        v_order.customer_snapshot, v_item.measurements, v_order.delivery_date, v_order.trial_date
      )
      on conflict (order_id, order_item_serial_no, unit_no) do update set
        order_number = excluded.order_number,
        customer_id = excluded.customer_id,
        order_status = excluded.order_status,
        garment_type = excluded.garment_type,
        customer_snapshot = excluded.customer_snapshot,
        measurements_snapshot = excluded.measurements_snapshot,
        due_date = excluded.due_date,
        trial_date = excluded.trial_date,
        updated_at = now();
    end loop;

    update job_cards
    set
      cancelled = true,
      current_stage = 'Cancelled',
      updated_at = now()
    where order_id = p_order_id
      and order_item_serial_no = v_item.serial_no
      and unit_no > v_item.qty
      and completed_date is null;
  end loop;

  update job_cards jc
  set
    cancelled = true,
    current_stage = 'Cancelled',
    updated_at = now()
  where jc.order_id = p_order_id
    and not exists (
      select 1 from order_items oi
      where oi.order_id = jc.order_id
        and oi.serial_no = jc.order_item_serial_no
    )
    and jc.completed_date is null;
end;
$$;

grant execute on function sync_job_cards_for_order(uuid) to authenticated, service_role;
