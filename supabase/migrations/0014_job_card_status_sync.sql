-- Keep job-card production stage aligned when cards are created/synced for an
-- order that is already Ready, Delivered, or Cancelled.

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
        current_stage, completed_date, cancelled
      ) values (
        generate_job_card_number(), p_order_id, v_order.order_number, v_order.customer_id,
        v_order.status, v_item.serial_no, v_unit, v_item.particular,
        v_order.customer_snapshot, v_item.measurements, v_order.delivery_date, v_order.trial_date,
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
