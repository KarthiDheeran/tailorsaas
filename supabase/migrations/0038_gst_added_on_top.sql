-- Treat order item prices as taxable amounts before GST when billing settings
-- say prices do not include tax. Stored order totals/balances remain the
-- payable grand total so payments, dues, and reports all agree with receipts.

create or replace function order_total_with_configured_tax(p_taxable_total numeric)
returns numeric
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_tax_enabled boolean;
  v_tax_rate numeric;
  v_prices_include_tax boolean;
begin
  select
    coalesce(tax_enabled, false),
    coalesce(tax_rate_percent, 0),
    coalesce(prices_include_tax, true)
  into v_tax_enabled, v_tax_rate, v_prices_include_tax
  from shop_billing_settings
  where id = true;

  if not coalesce(v_tax_enabled, false)
    or coalesce(v_tax_rate, 0) <= 0
    or coalesce(v_prices_include_tax, true)
  then
    return greatest(coalesce(p_taxable_total, 0), 0);
  end if;

  return round(greatest(coalesce(p_taxable_total, 0), 0) * (1 + v_tax_rate / 100), 2);
end;
$$;

create or replace function recompute_order_financial_totals(p_order_id uuid) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_items_total numeric;
  v_adjustment_total numeric;
  v_refund_total numeric;
  v_paid numeric;
  v_taxable_total numeric;
  v_total numeric;
  v_balance numeric;
  v_delivery date;
  v_status text;
begin
  select coalesce(sum(amount), 0) into v_items_total
  from order_items
  where order_id = p_order_id;

  select coalesce(sum(
    case adjustment_type
      when 'Discount' then -amount
      when 'Extra Charge' then amount
      else 0
    end
  ), 0) into v_adjustment_total
  from order_financial_adjustments
  where order_id = p_order_id
    and not voided;

  select coalesce(sum(amount), 0) into v_refund_total
  from order_financial_adjustments
  where order_id = p_order_id
    and adjustment_type = 'Refund'
    and not voided;

  select coalesce(sum(amount), 0) - v_refund_total into v_paid
  from payments
  where order_id = p_order_id
    and not voided;

  select delivery_date into v_delivery
  from orders
  where id = p_order_id;

  v_taxable_total := greatest(v_items_total + v_adjustment_total, 0);
  v_total := order_total_with_configured_tax(v_taxable_total);
  v_balance := v_total - v_paid;
  v_status := case
    when v_total = 0 then 'Not calculated'
    when v_balance <= 0 then 'Paid'
    when v_delivery is not null and v_delivery < current_date then 'Overdue'
    else 'Due'
  end;

  update orders set
    total_amount = v_total,
    advance_paid = v_paid,
    balance = v_balance,
    payment_status = v_status,
    updated_at = now()
  where id = p_order_id;
end;
$$;

create or replace function recompute_all_order_financial_totals() returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  if not auth_has_permission('settings.manageShop') then
    raise exception 'permission denied: settings.manageShop required';
  end if;

  for v_order_id in select id from orders loop
    perform recompute_order_financial_totals(v_order_id);
  end loop;
end;
$$;

create or replace function create_order_with_items(
  p_customer_id uuid,
  p_customer_snapshot jsonb,
  p_order_date date,
  p_trial_date date,
  p_delivery_date date,
  p_delivery_promise_note text,
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
  v_taxable_total numeric;
  v_total_amount numeric;
  v_balance numeric;
  v_payment_status text;
begin
  if not auth_has_permission('orders.create') then
    raise exception 'permission denied: orders.create required';
  end if;

  select coalesce(sum((item->>'amount')::numeric), 0) into v_taxable_total
  from jsonb_array_elements(p_items) as item;

  v_total_amount := order_total_with_configured_tax(v_taxable_total);
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
    delivery_date, delivery_promise_note, total_amount, advance_paid, balance, payment_mode,
    status, payment_status
  ) values (
    v_order_number, v_invoice_number, p_customer_id, p_customer_snapshot, p_order_date, p_trial_date,
    p_delivery_date, coalesce(p_delivery_promise_note, ''), v_total_amount, p_advance_paid,
    v_balance, p_payment_mode, p_status, v_payment_status
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

grant execute on function recompute_all_order_financial_totals() to authenticated, service_role;

update shop_billing_settings
set prices_include_tax = false,
    updated_at = now()
where id = true;

do $$
declare
  v_order_id uuid;
begin
  for v_order_id in select id from orders loop
    perform recompute_order_financial_totals(v_order_id);
  end loop;
end $$;
