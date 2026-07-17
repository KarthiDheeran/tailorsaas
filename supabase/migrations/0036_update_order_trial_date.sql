create or replace function update_order_with_items(
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
begin
  if not auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;

  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'order not found: %', p_order_id;
  end if;

  update orders set
    order_date = p_order_date,
    trial_date = p_trial_date,
    delivery_date = p_delivery_date,
    delivery_promise_note = coalesce(p_delivery_promise_note, ''),
    status = p_status,
    updated_at = now()
  where id = p_order_id;

  delete from order_items where order_id = p_order_id;

  insert into order_items (
    order_id, serial_no, particular, garment_type_id, size, qty, rate,
    add_ons, add_ons_total, final_rate, amount, measurements,
    fabric_source, fabric_notes, design_notes,
    alteration_issue, alteration_required_change, alteration_charge_type,
    linked_original_order_id
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
    coalesce(item->>'designNotes', ''),
    coalesce(item->>'alterationIssue', ''),
    coalesce(item->>'alterationRequiredChange', ''),
    nullif(item->>'alterationChargeType', ''),
    nullif(item->>'linkedOriginalOrderId', '')::uuid
  from jsonb_array_elements(p_items) as item;

  perform recompute_order_financial_totals(p_order_id);
end;
$$;

grant execute on function update_order_with_items(
  uuid, date, date, date, text, text, jsonb
) to authenticated, service_role;
