-- Phase 8F: invoice/billing hardening.
--
-- Adds a real invoice number distinct from the operational order number and
-- expands shop billing settings with tax-display controls. Existing orders are
-- backfilled with a stable invoice number based on the old receipt convention;
-- new orders receive a yearly, sequential invoice number at creation time.

alter table shop_billing_settings
  add column if not exists invoice_prefix text not null default 'INV',
  add column if not exists next_invoice_sequence int not null default 1,
  add column if not exists invoice_sequence_year int not null default extract(year from now())::int,
  add column if not exists tax_enabled boolean not null default false,
  add column if not exists tax_label text not null default 'GST',
  add column if not exists tax_rate_percent numeric not null default 0,
  add column if not exists prices_include_tax boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shop_billing_settings_next_invoice_sequence_check'
  ) then
    alter table shop_billing_settings
      add constraint shop_billing_settings_next_invoice_sequence_check
      check (next_invoice_sequence > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shop_billing_settings_tax_rate_percent_check'
  ) then
    alter table shop_billing_settings
      add constraint shop_billing_settings_tax_rate_percent_check
      check (tax_rate_percent >= 0 and tax_rate_percent <= 100);
  end if;
end $$;

update shop_billing_settings
set
  invoice_prefix = coalesce(nullif(invoice_prefix, ''), receipt_prefix, 'INV'),
  tax_label = coalesce(nullif(tax_label, ''), 'GST'),
  updated_at = now()
where id = true;

alter table orders
  add column if not exists invoice_number text;

update orders
set invoice_number = (
  select coalesce(nullif(invoice_prefix, ''), receipt_prefix, 'INV')
  from shop_billing_settings
  where id = true
) || '-' || order_number
where invoice_number is null;

create unique index if not exists orders_invoice_number_unique
  on orders (invoice_number)
  where invoice_number is not null;

alter table orders
  alter column invoice_number set not null;

create or replace function generate_invoice_number() returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year int := extract(year from now())::int;
  v_settings_year int;
  v_next_sequence int;
  v_sequence int;
  v_prefix text;
begin
  if not auth_has_permission('orders.create') then
    raise exception 'permission denied: orders.create required';
  end if;

  select
    coalesce(nullif(invoice_prefix, ''), receipt_prefix, 'INV'),
    invoice_sequence_year,
    next_invoice_sequence
  into v_prefix, v_settings_year, v_next_sequence
  from shop_billing_settings
  where id = true
  for update;

  if not found then
    insert into shop_billing_settings (id, shop_name, tagline, receipt_prefix, invoice_prefix, footer_note)
    values (true, 'TailorSaaS', 'Tailoring. Simplified.', 'INV', 'INV', 'Please bring this receipt during pickup.')
    on conflict (id) do nothing;

    select
      coalesce(nullif(invoice_prefix, ''), receipt_prefix, 'INV'),
      invoice_sequence_year,
      next_invoice_sequence
    into v_prefix, v_settings_year, v_next_sequence
    from shop_billing_settings
    where id = true
    for update;
  end if;

  if v_settings_year <> v_year then
    v_sequence := 1;
    update shop_billing_settings
    set invoice_sequence_year = v_year,
        next_invoice_sequence = 2,
        updated_at = now()
    where id = true;
  else
    v_sequence := v_next_sequence;
    update shop_billing_settings
    set next_invoice_sequence = v_next_sequence + 1,
        updated_at = now()
    where id = true;
  end if;

  return v_prefix || '-' || v_year || '-' || lpad(v_sequence::text, 4, '0');
end;
$$;

grant execute on function generate_invoice_number() to authenticated, service_role;

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
    add_ons, add_ons_total, final_rate, amount, measurements
  )
  select
    v_order_id,
    (item->>'serialNo')::int,
    item->>'particular',
    (item->>'garmentTypeId')::uuid,
    item->>'size',
    (item->>'qty')::int,
    (item->>'rate')::numeric,
    item->'addOns',
    (item->>'addOnsTotal')::numeric,
    (item->>'finalRate')::numeric,
    (item->>'amount')::numeric,
    item->'measurements'
  from jsonb_array_elements(p_items) as item;

  if p_advance_paid > 0 then
    insert into payments (order_id, amount, payment_date, payment_mode, payment_type, notes, recorded_by)
    values (v_order_id, p_advance_paid, p_order_date, p_payment_mode, 'Advance', null, auth.uid());
  end if;

  return v_order_id;
end;
$$;

