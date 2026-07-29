-- Persist the server-built garment field schema snapshot alongside each item.
-- 0055 already creates the nullable column; this migration makes both atomic
-- order-write RPCs carry the snapshot from the validated server payload.

alter table order_items
  add column if not exists field_schema_snapshot jsonb;

create or replace function create_order_with_items(
  p_customer_id uuid, p_customer_snapshot jsonb, p_order_date date,
  p_trial_date date, p_delivery_date date, p_delivery_promise_note text,
  p_advance_paid numeric, p_payment_mode text, p_status text, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order_id uuid; v_order_number text; v_invoice_number text;
  v_taxable_total numeric; v_total_amount numeric; v_balance numeric; v_payment_status text;
begin
  if not auth_has_permission('orders.create') then raise exception 'permission denied: orders.create required'; end if;
  select coalesce(sum((item->>'amount')::numeric), 0) into v_taxable_total from jsonb_array_elements(p_items) item;
  v_total_amount := order_total_with_configured_tax(v_taxable_total);
  v_balance := v_total_amount - p_advance_paid;
  v_payment_status := case when v_total_amount = 0 then 'Not calculated' when v_balance <= 0 then 'Paid' when p_delivery_date is not null and p_delivery_date < current_date then 'Overdue' else 'Due' end;
  v_order_number := generate_order_number(); v_invoice_number := generate_invoice_number();
  insert into orders (order_number, invoice_number, customer_id, customer_snapshot, order_date, trial_date, delivery_date, delivery_promise_note, total_amount, advance_paid, balance, payment_mode, status, payment_status)
  values (v_order_number, v_invoice_number, p_customer_id, p_customer_snapshot, p_order_date, p_trial_date, p_delivery_date, coalesce(p_delivery_promise_note, ''), v_total_amount, p_advance_paid, v_balance, p_payment_mode, p_status, v_payment_status)
  returning id into v_order_id;
  insert into order_items (order_id, serial_no, particular, garment_type_id, size, qty, rate, add_ons, add_ons_total, final_rate, amount, measurements, field_schema_snapshot, fabric_source, fabric_notes, design_notes, alteration_issue, alteration_required_change, alteration_charge_type, linked_original_order_id)
  select v_order_id, (item->>'serialNo')::int, item->>'particular', nullif(item->>'garmentTypeId','')::uuid, item->>'size', (item->>'qty')::int, (item->>'rate')::numeric, item->'addOns', (item->>'addOnsTotal')::numeric, (item->>'finalRate')::numeric, (item->>'amount')::numeric, item->'measurements', item->'fieldSchemaSnapshot', coalesce(nullif(item->>'fabricSource',''),'Not specified'), coalesce(item->>'fabricNotes',''), coalesce(item->>'designNotes',''), coalesce(item->>'alterationIssue',''), coalesce(item->>'alterationRequiredChange',''), nullif(item->>'alterationChargeType',''), nullif(item->>'linkedOriginalOrderId','')::uuid
  from jsonb_array_elements(p_items) item;
  if p_advance_paid > 0 then insert into payments (order_id, amount, payment_date, payment_mode, payment_type, notes, recorded_by) values (v_order_id, p_advance_paid, p_order_date, p_payment_mode, 'Advance', null, auth.uid()); end if;
  return v_order_id;
end; $$;

create or replace function update_order_with_items(
  p_order_id uuid, p_order_date date, p_trial_date date, p_delivery_date date,
  p_delivery_promise_note text, p_status text, p_items jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not auth_has_permission('orders.edit') then raise exception 'permission denied: orders.edit required'; end if;
  if not exists (select 1 from orders where id = p_order_id) then raise exception 'order not found: %', p_order_id; end if;
  update orders set order_date=p_order_date, trial_date=p_trial_date, delivery_date=p_delivery_date, delivery_promise_note=coalesce(p_delivery_promise_note,''), status=p_status, updated_at=now() where id=p_order_id;
  delete from order_items where order_id=p_order_id and id not in (select nullif(item->>'id','')::uuid from jsonb_array_elements(p_items) item where nullif(item->>'id','') is not null);
  insert into order_items (id, order_id, serial_no, particular, garment_type_id, size, qty, rate, add_ons, add_ons_total, final_rate, amount, measurements, field_schema_snapshot, fabric_source, fabric_notes, design_notes, alteration_issue, alteration_required_change, alteration_charge_type, linked_original_order_id)
  select case when nullif(item->>'id','') is not null and exists (select 1 from order_items existing_item where existing_item.id=nullif(item->>'id','')::uuid and existing_item.order_id=p_order_id) then nullif(item->>'id','')::uuid else gen_random_uuid() end, p_order_id, (item->>'serialNo')::int, item->>'particular', nullif(item->>'garmentTypeId','')::uuid, item->>'size', (item->>'qty')::int, (item->>'rate')::numeric, item->'addOns', (item->>'addOnsTotal')::numeric, (item->>'finalRate')::numeric, (item->>'amount')::numeric, item->'measurements', item->'fieldSchemaSnapshot', coalesce(nullif(item->>'fabricSource',''),'Not specified'), coalesce(item->>'fabricNotes',''), coalesce(item->>'designNotes',''), coalesce(item->>'alterationIssue',''), coalesce(item->>'alterationRequiredChange',''), nullif(item->>'alterationChargeType',''), nullif(item->>'linkedOriginalOrderId','')::uuid from jsonb_array_elements(p_items) item
  on conflict (id) do update set serial_no=excluded.serial_no, particular=excluded.particular, garment_type_id=excluded.garment_type_id, size=excluded.size, qty=excluded.qty, rate=excluded.rate, add_ons=excluded.add_ons, add_ons_total=excluded.add_ons_total, final_rate=excluded.final_rate, amount=excluded.amount, measurements=excluded.measurements, field_schema_snapshot=excluded.field_schema_snapshot, fabric_source=excluded.fabric_source, fabric_notes=excluded.fabric_notes, design_notes=excluded.design_notes, alteration_issue=excluded.alteration_issue, alteration_required_change=excluded.alteration_required_change, alteration_charge_type=excluded.alteration_charge_type, linked_original_order_id=excluded.linked_original_order_id;
  perform recompute_order_financial_totals(p_order_id);
end; $$;

grant execute on function create_order_with_items(uuid, jsonb, date, date, date, text, numeric, text, text, jsonb) to authenticated, service_role;
grant execute on function update_order_with_items(uuid, date, date, date, text, text, jsonb) to authenticated, service_role;
