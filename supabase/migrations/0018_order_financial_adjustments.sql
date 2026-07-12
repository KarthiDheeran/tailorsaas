-- Phase 8G: order financial adjustments.
--
-- Adds a proper ledger for Discount, Extra Charge, and Refund. Adjustments
-- are soft-voided, never deleted, and order total/paid/balance are
-- recomputed from order_items + payments + adjustments.

create table if not exists order_financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  adjustment_date date not null default current_date,
  adjustment_type text not null check (adjustment_type in ('Discount','Extra Charge','Refund')),
  amount numeric not null check (amount > 0),
  payment_mode text check (payment_mode in ('Cash','GPay','UPI','Card','Bank Transfer','Cheque')),
  reason text not null,
  notes text,
  recorded_by uuid references profiles(id) on delete set null,
  voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references profiles(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now()
);

alter table order_financial_adjustments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_financial_adjustments'
      and policyname = 'order_financial_adjustments_select'
  ) then
    create policy order_financial_adjustments_select on order_financial_adjustments for select
      using (auth_has_permission('orders.viewPayments'));
  end if;
end $$;
grant select on order_financial_adjustments to authenticated, service_role;

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

  v_total := greatest(v_items_total + v_adjustment_total, 0);
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

create or replace function recompute_order_payment_totals() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform recompute_order_financial_totals(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

create or replace function recompute_order_adjustment_totals() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform recompute_order_financial_totals(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

drop trigger if exists order_financial_adjustments_recompute_totals
  on order_financial_adjustments;

create trigger order_financial_adjustments_recompute_totals
after insert or update of voided on order_financial_adjustments
for each row execute function recompute_order_adjustment_totals();

create or replace function record_order_financial_adjustment(
  p_order_id uuid,
  p_adjustment_type text,
  p_amount numeric,
  p_adjustment_date date,
  p_payment_mode text,
  p_reason text,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_adjustment_id uuid;
  v_order_status text;
  v_current_bill_total numeric;
  v_paid_available numeric;
begin
  if not auth_has_permission('orders.recordPayment') then
    raise exception 'permission denied: orders.recordPayment required';
  end if;

  if p_adjustment_type not in ('Discount','Extra Charge','Refund') then
    raise exception 'invalid adjustment type: %', p_adjustment_type;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  if p_adjustment_date is not null and p_adjustment_date > current_date then
    raise exception 'adjustment date cannot be in the future';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason is required';
  end if;

  if p_adjustment_type = 'Refund' and p_payment_mode is null then
    raise exception 'refund payment mode is required';
  end if;

  if p_adjustment_type <> 'Refund' and p_payment_mode is not null then
    raise exception 'payment mode is only used for refunds';
  end if;

  select status into v_order_status
  from orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'order not found: %', p_order_id;
  end if;

  if v_order_status = 'Cancelled' and p_adjustment_type <> 'Refund' then
    raise exception 'only refunds can be recorded on cancelled orders';
  end if;

  select greatest(
    coalesce((select sum(amount) from order_items where order_id = p_order_id), 0) +
    coalesce((
      select sum(
        case adjustment_type
          when 'Discount' then -amount
          when 'Extra Charge' then amount
          else 0
        end
      )
      from order_financial_adjustments
      where order_id = p_order_id
        and not voided
    ), 0),
    0
  ) into v_current_bill_total;

  if p_adjustment_type = 'Discount' and p_amount > v_current_bill_total then
    raise exception 'discount exceeds current bill total of %', v_current_bill_total;
  end if;

  select coalesce((select sum(amount) from payments where order_id = p_order_id and not voided), 0) -
    coalesce((
      select sum(amount)
      from order_financial_adjustments
      where order_id = p_order_id
        and adjustment_type = 'Refund'
        and not voided
    ), 0)
  into v_paid_available;

  if p_adjustment_type = 'Refund' and p_amount > v_paid_available then
    raise exception 'refund exceeds paid amount available of %', v_paid_available;
  end if;

  insert into order_financial_adjustments (
    order_id,
    adjustment_date,
    adjustment_type,
    amount,
    payment_mode,
    reason,
    notes,
    recorded_by
  ) values (
    p_order_id,
    coalesce(p_adjustment_date, current_date),
    p_adjustment_type,
    p_amount,
    p_payment_mode,
    trim(p_reason),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  )
  returning id into v_adjustment_id;

  return v_adjustment_id;
end;
$$;

create or replace function void_order_financial_adjustment(
  p_adjustment_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_found uuid;
begin
  if not auth_has_permission('orders.voidPayment') then
    raise exception 'permission denied: orders.voidPayment required';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason is required';
  end if;

  select id into v_found
  from order_financial_adjustments
  where id = p_adjustment_id
    and not voided;
  if not found then
    raise exception 'adjustment not found or already voided: %', p_adjustment_id;
  end if;

  update order_financial_adjustments set
    voided = true,
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason = trim(p_reason)
  where id = p_adjustment_id;
end;
$$;

grant execute on function record_order_financial_adjustment(uuid, text, numeric, date, text, text, text)
  to authenticated, service_role;
grant execute on function void_order_financial_adjustment(uuid, text)
  to authenticated, service_role;

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
    add_ons, add_ons_total, final_rate, amount, measurements
  )
  select
    p_order_id,
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

  perform recompute_order_financial_totals(p_order_id);
end;
$$;

do $$
declare
  v_order_id uuid;
begin
  for v_order_id in select id from orders loop
    perform recompute_order_financial_totals(v_order_id);
  end loop;
end $$;
