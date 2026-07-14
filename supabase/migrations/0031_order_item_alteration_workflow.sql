-- Structured alteration intake on order items.
-- Due date is already on orders.delivery_date, charge is already the item
-- rate/amount, and before/after photos use order_attachments.

alter table order_items
  add column if not exists alteration_issue text not null default '',
  add column if not exists alteration_required_change text not null default '',
  add column if not exists alteration_charge_type text
    check (alteration_charge_type in ('Paid','Free')),
  add column if not exists linked_original_order_id uuid references orders(id) on delete set null;

create index if not exists order_items_linked_original_order_idx
  on order_items (linked_original_order_id);

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
    fabric_source, fabric_notes, design_notes,
    alteration_issue, alteration_required_change, alteration_charge_type,
    linked_original_order_id
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
    coalesce(item->>'designNotes', ''),
    coalesce(item->>'alterationIssue', ''),
    coalesce(item->>'alterationRequiredChange', ''),
    nullif(item->>'alterationChargeType', ''),
    nullif(item->>'linkedOriginalOrderId', '')::uuid
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
