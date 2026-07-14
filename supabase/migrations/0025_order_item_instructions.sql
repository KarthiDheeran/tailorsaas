-- Per-garment order instructions. These are captured on the order item and
-- copied onto generated job cards so cutters/tailors see the fabric/design
-- intent without expanding the customer-facing order status list.

alter table order_items
  add column if not exists fabric_source text not null default 'Not specified'
    check (fabric_source in ('Not specified','Customer provided','Shop provided')),
  add column if not exists fabric_notes text not null default '',
  add column if not exists design_notes text not null default '';

alter table job_cards
  add column if not exists design_notes text not null default '';

create or replace function create_order_with_items(
  p_customer_id uuid,
  p_customer_snapshot jsonb,
  p_order_date date,
  p_trial_date date,
  p_delivery_date date,
  p_advance_paid numeric,
  p_payment_mode text,
  p_status text,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_invoice_number text;
  v_total_amount numeric;
  v_balance numeric;
  v_payment_status text;
begin
  if not auth_has_permission('orders.create') then
    raise exception 'permission denied: orders.create required';
  end if;

  select coalesce(sum((item->>'amount')::numeric), 0) into v_total_amount
  from jsonb_array_elements(p_items) as item;

  v_balance := v_total_amount - p_advance_paid;
  v_payment_status := case
    when v_total_amount = 0 then 'Not calculated'
    when v_balance <= 0 then 'Paid'
    when p_delivery_date is not null and p_delivery_date < current_date then 'Overdue'
    else 'Due'
  end;

  v_order_number := generate_order_number();
  v_invoice_number := generate_invoice_number();

  insert into orders (
    order_number, invoice_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, total_amount, advance_paid, balance, payment_mode,
    status, payment_status
  ) values (
    v_order_number, v_invoice_number, p_customer_id, p_customer_snapshot, p_order_date, p_trial_date,
    p_delivery_date, v_total_amount, p_advance_paid, v_balance, p_payment_mode,
    p_status, v_payment_status
  )
  returning id into v_order_id;

  insert into order_items (
    order_id, serial_no, particular, garment_type_id, size, qty, rate,
    add_ons, add_ons_total, final_rate, amount, measurements,
    fabric_source, fabric_notes, design_notes
  )
  select
    v_order_id,
    (item->>'serialNo')::int,
    item->>'particular',
    nullif(item->>'garmentTypeId', '')::uuid,
    item->>'size',
    (item->>'qty')::int,
    (item->>'rate')::numeric,
    item->'addOns',
    (item->>'addOnsTotal')::numeric,
    (item->>'finalRate')::numeric,
    (item->>'amount')::numeric,
    item->'measurements',
    coalesce(nullif(item->>'fabricSource', ''), 'Not specified'),
    coalesce(item->>'fabricNotes', ''),
    coalesce(item->>'designNotes', '')
  from jsonb_array_elements(p_items) as item;

  if p_advance_paid > 0 then
    insert into payments (order_id, amount, payment_date, payment_mode, payment_type, notes, recorded_by)
    values (v_order_id, p_advance_paid, p_order_date, p_payment_mode, 'Advance', null, auth.uid());
  end if;

  return v_order_id;
end;
$$;

create or replace function update_order_with_items(
  p_order_id uuid,
  p_order_date date,
  p_delivery_date date,
  p_status text,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;

  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'order not found: %', p_order_id;
  end if;

  update orders set
    order_date = p_order_date,
    delivery_date = p_delivery_date,
    status = p_status,
    updated_at = now()
  where id = p_order_id;

  delete from order_items where order_id = p_order_id;

  insert into order_items (
    order_id, serial_no, particular, garment_type_id, size, qty, rate,
    add_ons, add_ons_total, final_rate, amount, measurements,
    fabric_source, fabric_notes, design_notes
  )
  select
    p_order_id,
    (item->>'serialNo')::int,
    item->>'particular',
    nullif(item->>'garmentTypeId', '')::uuid,
    item->>'size',
    (item->>'qty')::int,
    (item->>'rate')::numeric,
    item->'addOns',
    (item->>'addOnsTotal')::numeric,
    (item->>'finalRate')::numeric,
    (item->>'amount')::numeric,
    item->'measurements',
    coalesce(nullif(item->>'fabricSource', ''), 'Not specified'),
    coalesce(item->>'fabricNotes', ''),
    coalesce(item->>'designNotes', '')
  from jsonb_array_elements(p_items) as item;

  perform recompute_order_financial_totals(p_order_id);
end;
$$;

create or replace function sync_job_cards_for_order(p_order_id uuid) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order orders%rowtype;
  v_item order_items%rowtype;
  v_unit int;
  v_stage text;
  v_cancelled boolean;
begin
  if not (auth_has_permission('orders.create') or auth_has_permission('orders.edit') or auth_has_permission('staff.manage')) then
    raise exception 'permission denied: cannot sync job cards';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'order not found: %', p_order_id;
  end if;

  v_stage := case
    when v_order.status = 'Ready' then 'Ready'
    when v_order.status = 'Delivered' then 'Delivered'
    when v_order.status = 'Cancelled' then 'Cancelled'
    else 'Unassigned'
  end;
  v_cancelled := v_order.status = 'Cancelled';

  for v_item in
    select * from order_items where order_id = p_order_id order by serial_no
  loop
    for v_unit in 1..v_item.qty loop
      insert into job_cards (
        job_card_number, order_id, order_number, customer_id, order_status,
        order_item_serial_no, unit_no, garment_type,
        customer_snapshot, measurements_snapshot, due_date, trial_date,
        fabric_source, fabric_notes, design_notes,
        current_stage, completed_date, cancelled
      ) values (
        generate_job_card_number(), p_order_id, v_order.order_number, v_order.customer_id,
        v_order.status, v_item.serial_no, v_unit, v_item.particular,
        v_order.customer_snapshot, v_item.measurements, v_order.delivery_date, v_order.trial_date,
        v_item.fabric_source, nullif(v_item.fabric_notes, ''), v_item.design_notes,
        v_stage,
        case when v_stage in ('Ready','Delivered') then current_date else null end,
        v_cancelled
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
        fabric_source = excluded.fabric_source,
        fabric_notes = excluded.fabric_notes,
        design_notes = excluded.design_notes,
        current_stage = case
          when excluded.order_status in ('Ready','Delivered','Cancelled')
            then excluded.current_stage
          else job_cards.current_stage
        end,
        completed_date = case
          when excluded.order_status in ('Ready','Delivered')
            then coalesce(job_cards.completed_date, current_date)
          when excluded.order_status = 'Cancelled'
            then job_cards.completed_date
          else job_cards.completed_date
        end,
        cancelled = case
          when excluded.order_status = 'Cancelled' then true
          else job_cards.cancelled
        end,
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
