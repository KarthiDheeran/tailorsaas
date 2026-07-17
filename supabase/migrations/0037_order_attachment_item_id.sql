alter table order_attachments
  add column if not exists order_item_id uuid;

update order_attachments oa
set order_item_id = oi.id
from order_items oi
where oa.order_item_id is null
  and oa.order_id = oi.order_id
  and oa.order_item_serial_no = oi.serial_no;

alter table order_attachments
  drop constraint if exists order_attachments_order_item_serial_fk;

alter table order_attachments
  drop constraint if exists order_attachments_order_id_order_item_serial_no_fkey;

alter table order_attachments
  drop constraint if exists order_attachments_order_item_id_fkey;

alter table order_attachments
  add constraint order_attachments_order_item_id_fkey
  foreign key (order_item_id) references order_items(id) on delete set null;

create index if not exists order_attachments_order_item_id_idx
  on order_attachments (order_item_id);

grant update on order_attachments to authenticated, service_role;

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

  delete from order_items
  where order_id = p_order_id
    and id not in (
      select nullif(item->>'id', '')::uuid
      from jsonb_array_elements(p_items) as item
      where nullif(item->>'id', '') is not null
    );

  insert into order_items (
    id, order_id, serial_no, particular, garment_type_id, size, qty, rate,
    add_ons, add_ons_total, final_rate, amount, measurements,
    fabric_source, fabric_notes, design_notes,
    alteration_issue, alteration_required_change, alteration_charge_type,
    linked_original_order_id
  )
  select
    case
      when nullif(item->>'id', '') is not null
        and exists (
          select 1
          from order_items existing_item
          where existing_item.id = nullif(item->>'id', '')::uuid
            and existing_item.order_id = p_order_id
        )
      then nullif(item->>'id', '')::uuid
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
    coalesce(nullif(item->>'fabricSource', ''), 'Not specified'),
    coalesce(item->>'fabricNotes', ''),
    coalesce(item->>'designNotes', ''),
    coalesce(item->>'alterationIssue', ''),
    coalesce(item->>'alterationRequiredChange', ''),
    nullif(item->>'alterationChargeType', ''),
    nullif(item->>'linkedOriginalOrderId', '')::uuid
  from jsonb_array_elements(p_items) as item
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
    fabric_source = excluded.fabric_source,
    fabric_notes = excluded.fabric_notes,
    design_notes = excluded.design_notes,
    alteration_issue = excluded.alteration_issue,
    alteration_required_change = excluded.alteration_required_change,
    alteration_charge_type = excluded.alteration_charge_type,
    linked_original_order_id = excluded.linked_original_order_id;

  perform recompute_order_financial_totals(p_order_id);
end;
$$;

grant execute on function update_order_with_items(
  uuid, date, date, date, text, text, jsonb
) to authenticated, service_role;
