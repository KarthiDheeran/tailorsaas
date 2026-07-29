-- New orders receive a short, independently sequenced number by Order
-- Section. Historical ORD-YYYY-NNNN values remain untouched.

alter table orders
  add column if not exists order_section text,
  add column if not exists order_sequence integer;

alter table orders
  drop constraint if exists orders_order_section_check;

alter table orders
  add constraint orders_order_section_check
  check (order_section is null or order_section in ('Men', 'Chutti', 'Blouse'));

create unique index if not exists orders_section_sequence_unique_idx
  on orders (order_section, order_sequence)
  where order_section is not null and order_sequence is not null;

create table if not exists order_section_number_counters (
  order_section text primary key check (order_section in ('Men', 'Chutti', 'Blouse')),
  last_seq integer not null default 0 check (last_seq >= 0),
  updated_at timestamptz not null default now()
);

alter table order_section_number_counters enable row level security;
revoke all on table order_section_number_counters from public, anon, authenticated;

create or replace function generate_order_number(p_order_section text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_sequence integer;
  v_prefix text;
begin
  if not auth_has_permission('orders.create') then
    raise exception 'permission denied: orders.create required';
  end if;
  if p_order_section not in ('Men', 'Chutti', 'Blouse') then
    raise exception 'invalid order section';
  end if;

  insert into order_section_number_counters (order_section, last_seq, updated_at)
  values (p_order_section, 1, now())
  on conflict (order_section) do update
    set last_seq = order_section_number_counters.last_seq + 1,
        updated_at = now()
  returning last_seq into v_sequence;

  v_prefix := case p_order_section
    when 'Men' then 'M'
    when 'Chutti' then 'C'
    when 'Blouse' then 'B'
  end;
  return v_prefix || '-' || v_sequence::text;
end;
$$;

create or replace function peek_next_order_number(p_order_section text) returns text
language sql security definer stable set search_path = public, pg_temp as $$
  select case
    when not auth_has_permission('orders.create') then null
    when p_order_section = 'Men' then 'M-' || (coalesce((select last_seq from order_section_number_counters where order_section = 'Men'), 0) + 1)::text
    when p_order_section = 'Chutti' then 'C-' || (coalesce((select last_seq from order_section_number_counters where order_section = 'Chutti'), 0) + 1)::text
    when p_order_section = 'Blouse' then 'B-' || (coalesce((select last_seq from order_section_number_counters where order_section = 'Blouse'), 0) + 1)::text
    else null
  end;
$$;

-- Replace the old RPC signature so no new order can accidentally receive the
-- retired global ORD-YYYY-NNNN format.
drop function if exists create_order_with_items(uuid, jsonb, date, date, date, text, numeric, text, text, jsonb);

create function create_order_with_items(
  p_customer_id uuid, p_customer_snapshot jsonb, p_order_date date,
  p_trial_date date, p_delivery_date date, p_delivery_promise_note text,
  p_advance_paid numeric, p_payment_mode text, p_status text,
  p_order_section text, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order_id uuid; v_order_number text; v_invoice_number text;
  v_taxable_total numeric; v_total_amount numeric; v_balance numeric; v_payment_status text;
  v_order_sequence integer;
begin
  if not auth_has_permission('orders.create') then raise exception 'permission denied: orders.create required'; end if;
  if p_order_section not in ('Men', 'Chutti', 'Blouse') then raise exception 'invalid order section'; end if;
  select coalesce(sum((item->>'amount')::numeric), 0) into v_taxable_total from jsonb_array_elements(p_items) item;
  v_total_amount := order_total_with_configured_tax(v_taxable_total);
  v_balance := v_total_amount - p_advance_paid;
  v_payment_status := case when v_total_amount = 0 then 'Not calculated' when v_balance <= 0 then 'Paid' when p_delivery_date is not null and p_delivery_date < current_date then 'Overdue' else 'Due' end;
  v_order_number := generate_order_number(p_order_section);
  v_order_sequence := split_part(v_order_number, '-', 2)::integer;
  v_invoice_number := generate_invoice_number();
  insert into orders (order_number, order_section, order_sequence, invoice_number, customer_id, customer_snapshot, order_date, trial_date, delivery_date, delivery_promise_note, total_amount, advance_paid, balance, payment_mode, status, payment_status)
  values (v_order_number, p_order_section, v_order_sequence, v_invoice_number, p_customer_id, p_customer_snapshot, p_order_date, p_trial_date, p_delivery_date, coalesce(p_delivery_promise_note, ''), v_total_amount, p_advance_paid, v_balance, p_payment_mode, p_status, v_payment_status)
  returning id into v_order_id;
  insert into order_items (order_id, serial_no, particular, garment_type_id, size, qty, rate, add_ons, add_ons_total, final_rate, amount, measurements, field_schema_snapshot, fabric_source, fabric_notes, design_notes, alteration_issue, alteration_required_change, alteration_charge_type, linked_original_order_id)
  select v_order_id, (item->>'serialNo')::int, item->>'particular', nullif(item->>'garmentTypeId','')::uuid, item->>'size', (item->>'qty')::int, (item->>'rate')::numeric, item->'addOns', (item->>'addOnsTotal')::numeric, (item->>'finalRate')::numeric, (item->>'amount')::numeric, item->'measurements', item->'fieldSchemaSnapshot', coalesce(nullif(item->>'fabricSource',''),'Not specified'), coalesce(item->>'fabricNotes',''), coalesce(item->>'designNotes',''), coalesce(item->>'alterationIssue',''), coalesce(item->>'alterationRequiredChange',''), nullif(item->>'alterationChargeType',''), nullif(item->>'linkedOriginalOrderId','')::uuid
  from jsonb_array_elements(p_items) item;
  if p_advance_paid > 0 then insert into payments (order_id, amount, payment_date, payment_mode, payment_type, notes, recorded_by) values (v_order_id, p_advance_paid, p_order_date, p_payment_mode, 'Advance', null, auth.uid()); end if;
  return v_order_id;
end;
$$;

grant execute on function generate_order_number(text) to authenticated, service_role;
grant execute on function peek_next_order_number(text) to authenticated, service_role;
grant execute on function create_order_with_items(uuid, jsonb, date, date, date, text, numeric, text, text, text, jsonb) to authenticated, service_role;
