-- Track customer handover quantity per order item so a shop can deliver
-- only part of a ready order without changing production/job-card flow.

alter table public.order_items
  add column if not exists delivered_qty integer not null default 0;

alter table public.order_items
  drop constraint if exists order_items_delivered_qty_check;

update public.order_items
   set delivered_qty = least(greatest(coalesce(delivered_qty, 0), 0), qty);

alter table public.order_items
  add constraint order_items_delivered_qty_check
  check (delivered_qty >= 0 and delivered_qty <= qty);

create index if not exists order_items_delivery_progress_idx
  on public.order_items (order_id, delivered_qty, qty);

create or replace function public.deliver_order_items(
  p_order_id uuid,
  p_items jsonb,
  p_amount numeric default 0,
  p_payment_mode text default 'Cash',
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_order_item_id uuid;
  v_qty integer;
  v_pending integer;
  v_any_delivery boolean := false;
  v_all_delivered boolean := false;
begin
  if not public.auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;
  if coalesce(p_amount, 0) > 0 and not public.auth_has_permission('orders.recordPayment') then
    raise exception 'permission denied: orders.recordPayment required';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;
  if not found then
    raise exception 'order not found';
  end if;
  if not public.auth_can_access_order(p_order_id) then
    raise exception 'permission denied for order';
  end if;
  if v_order.status = 'Delivered' then
    raise exception 'order is already delivered';
  end if;
  if v_order.status <> 'Ready' then
    raise exception 'only Ready orders can be delivered';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'delivery items are required';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_order_item_id := nullif(v_item->>'orderItemId', '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    if v_qty <= 0 then
      continue;
    end if;

    select qty - delivered_qty into v_pending
      from public.order_items
     where id = v_order_item_id
       and order_id = p_order_id
     for update;
    if not found then
      raise exception 'order item not found';
    end if;
    if v_qty > v_pending then
      raise exception 'delivery quantity exceeds pending quantity';
    end if;

    update public.order_items
       set delivered_qty = delivered_qty + v_qty
     where id = v_order_item_id
       and order_id = p_order_id;
    v_any_delivery := true;
  end loop;

  if not v_any_delivery then
    raise exception 'enter at least one item quantity to deliver';
  end if;

  if coalesce(p_amount, 0) > 0 then
    perform public.record_payment(p_order_id, p_amount, current_date, p_payment_mode, p_notes);
  end if;

  select not exists (
    select 1
      from public.order_items
     where order_id = p_order_id
       and delivered_qty < qty
  ) into v_all_delivered;

  if v_all_delivered then
    update public.orders
       set status = 'Delivered',
           updated_at = now()
     where id = p_order_id;

    update public.job_cards
       set current_stage = 'Delivered',
           order_status = 'Delivered',
           completed_date = current_date,
           assigned_staff_id = null,
           updated_at = now()
     where order_id = p_order_id
       and not cancelled;
  else
    update public.orders
       set status = 'Ready',
           updated_at = now()
     where id = p_order_id;
  end if;

  return p_order_id;
end;
$$;

grant execute on function public.deliver_order_items(uuid, jsonb, numeric, text, text)
  to authenticated, service_role;

create or replace function public.quick_collect_and_deliver(
  p_order_id uuid,
  p_amount numeric default 0,
  p_payment_mode text default 'Cash',
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if not public.auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;
  if not public.auth_can_access_order(p_order_id) then
    raise exception 'permission denied for order';
  end if;
  if p_amount is not null and p_amount > 0 and not public.auth_has_permission('orders.recordPayment') then
    raise exception 'permission denied: orders.recordPayment required';
  end if;

  select status into v_status
    from public.orders
   where id = p_order_id
   for update;
  if not found then raise exception 'order not found'; end if;
  if v_status = 'Delivered' then raise exception 'order is already delivered'; end if;
  if v_status <> 'Ready' then raise exception 'only Ready orders can be delivered'; end if;

  if coalesce(p_amount, 0) > 0 then
    perform public.record_payment(p_order_id, p_amount, current_date, p_payment_mode, p_notes);
  end if;

  update public.order_items
     set delivered_qty = qty
   where order_id = p_order_id;

  update public.orders set status = 'Delivered', updated_at = now() where id = p_order_id;

  update public.job_cards
     set current_stage = 'Delivered',
         order_status = 'Delivered',
         completed_date = current_date,
         assigned_staff_id = null,
         updated_at = now()
   where order_id = p_order_id
     and not cancelled;

  return p_order_id;
end;
$$;

grant execute on function public.quick_collect_and_deliver(uuid, numeric, text, text)
  to authenticated, service_role;

create or replace function public.update_order_with_items(
  p_order_id uuid,
  p_order_date date,
  p_trial_date date,
  p_delivery_date date,
  p_delivery_promise_note text,
  p_status text,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order not found: %', p_order_id;
  end if;
  if not public.auth_can_access_scope(v_order.tenant_id, v_order.shop_id, v_order.order_section) then
    raise exception 'permission denied for order section';
  end if;

  update public.orders set
    order_date = p_order_date,
    trial_date = p_trial_date,
    delivery_date = p_delivery_date,
    delivery_promise_note = coalesce(p_delivery_promise_note, ''),
    status = p_status,
    updated_at = now()
  where id = p_order_id;

  delete from public.order_items
  where order_id = p_order_id
    and id not in (
      select nullif(item->>'id', '')::uuid
      from jsonb_array_elements(p_items) item
      where nullif(item->>'id', '') is not null
    );

  insert into public.order_items (
    id, order_id, serial_no, particular, garment_type_id, size, qty, delivered_qty, rate,
    add_ons, add_ons_total, final_rate, amount, measurements,
    field_schema_snapshot, fabric_source, fabric_notes, design_notes,
    alteration_issue, alteration_required_change, alteration_charge_type,
    linked_original_order_id
  )
  select
    case
      when nullif(item->>'id', '') is not null and exists (
        select 1 from public.order_items existing_item
        where existing_item.id = nullif(item->>'id', '')::uuid
          and existing_item.order_id = p_order_id
      ) then nullif(item->>'id', '')::uuid
      else gen_random_uuid()
    end,
    p_order_id,
    (item->>'serialNo')::int,
    item->>'particular',
    nullif(item->>'garmentTypeId', '')::uuid,
    item->>'size',
    (item->>'qty')::int,
    least(
      coalesce((
        select existing_item.delivered_qty
          from public.order_items existing_item
         where existing_item.id = nullif(item->>'id', '')::uuid
           and existing_item.order_id = p_order_id
      ), 0),
      (item->>'qty')::int
    ),
    (item->>'rate')::numeric,
    item->'addOns',
    (item->>'addOnsTotal')::numeric,
    (item->>'finalRate')::numeric,
    (item->>'amount')::numeric,
    item->'measurements',
    item->'fieldSchemaSnapshot',
    coalesce(nullif(item->>'fabricSource', ''), 'Not specified'),
    coalesce(item->>'fabricNotes', ''),
    coalesce(item->>'designNotes', ''),
    coalesce(item->>'alterationIssue', ''),
    coalesce(item->>'alterationRequiredChange', ''),
    nullif(item->>'alterationChargeType', ''),
    nullif(item->>'linkedOriginalOrderId', '')::uuid
  from jsonb_array_elements(p_items) item
  on conflict (id) do update set
    serial_no = excluded.serial_no,
    particular = excluded.particular,
    garment_type_id = excluded.garment_type_id,
    size = excluded.size,
    qty = excluded.qty,
    delivered_qty = least(order_items.delivered_qty, excluded.qty),
    rate = excluded.rate,
    add_ons = excluded.add_ons,
    add_ons_total = excluded.add_ons_total,
    final_rate = excluded.final_rate,
    amount = excluded.amount,
    measurements = excluded.measurements,
    field_schema_snapshot = excluded.field_schema_snapshot,
    fabric_source = excluded.fabric_source,
    fabric_notes = excluded.fabric_notes,
    design_notes = excluded.design_notes,
    alteration_issue = excluded.alteration_issue,
    alteration_required_change = excluded.alteration_required_change,
    alteration_charge_type = excluded.alteration_charge_type,
    linked_original_order_id = excluded.linked_original_order_id;

  perform public.recompute_order_financial_totals(p_order_id);
end;
$$;

grant execute on function public.update_order_with_items(
  uuid, date, date, date, text, text, jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';
