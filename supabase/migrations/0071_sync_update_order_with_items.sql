-- Keep Edit Order aligned with Create Order. Some deployed databases still
-- expose the pre-trial-date RPC, while the application sends p_trial_date.

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
    id, order_id, serial_no, particular, garment_type_id, size, qty, rate,
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
