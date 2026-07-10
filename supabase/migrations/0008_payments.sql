-- Phase 7A: real payment ledger. Orders/order_items (0006) kept a single
-- advance_paid/balance snapshot with no dated transaction history — this
-- migration adds the missing ledger and makes advance_paid/balance/
-- payment_status trigger-derived from it, so every existing read site
-- (OrdersTable, OrderDetailsDrawer, EditOrderDrawer, Dashboard's
-- payment-pending, the print receipt) keeps working unchanged: same column
-- names, same shape, just recomputed from real payments instead of a
-- one-time write.
--
-- Writes only ever go through the two SECURITY DEFINER RPCs below
-- (record_payment / void_payment) — payments has zero insert/update/delete
-- policies and zero write grants, same lockdown pattern as 0006's
-- order_number_counters. No hard delete anywhere: correcting a mistake
-- voids a row (soft), it is never removed.

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  amount numeric not null check (amount > 0),
  payment_date date not null default current_date,
  payment_mode text not null check (payment_mode in ('Cash','GPay','UPI','Card','Bank Transfer','Cheque')),
  -- Computed server-side by record_payment() (Final if it zeroes the
  -- balance, Advance if it's the order's first non-voided payment,
  -- Partial otherwise) — never client-supplied.
  payment_type text not null check (payment_type in ('Advance','Partial','Final')),
  notes text,
  recorded_by uuid references profiles(id) on delete set null,
  voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references profiles(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now()
);

alter table payments enable row level security;

create policy payments_select on payments for select
  using (auth_has_permission('orders.viewPayments'));
-- No insert/update/delete policies — record_payment()/void_payment() are
-- SECURITY DEFINER and are the only mutation path, exactly like
-- order_number_counters in 0006.

grant select on payments to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trigger: keeps orders.advance_paid / balance / payment_status in sync with
-- payments whenever a row is inserted or voided. This is plumbing, not an
-- entry point — it can only ever fire as a side effect of record_payment()/
-- void_payment(), which have already done their own permission checks, so it
-- does not repeat one. SECURITY DEFINER so its own `update orders` bypasses
-- orders' RLS the same way create_order_with_items's internal update already
-- does.
-- ---------------------------------------------------------------------------
create function recompute_order_payment_totals() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
  v_total numeric;
  v_delivery date;
  v_paid numeric;
  v_balance numeric;
  v_status text;
begin
  select total_amount, delivery_date into v_total, v_delivery
  from orders where id = v_order_id;

  select coalesce(sum(amount), 0) into v_paid
  from payments where order_id = v_order_id and not voided;

  v_balance := v_total - v_paid;
  v_status := case
    when v_total = 0 then 'Not calculated'
    when v_balance <= 0 then 'Paid'
    when v_delivery is not null and v_delivery < current_date then 'Overdue'
    else 'Due'
  end;

  update orders set
    advance_paid = v_paid,
    balance = v_balance,
    payment_status = v_status,
    updated_at = now()
  where id = v_order_id;

  return null;
end;
$$;

create trigger payments_recompute_order_totals
after insert or update of voided on payments
for each row execute function recompute_order_payment_totals();

-- ---------------------------------------------------------------------------
-- record_payment — the only way a payment row is ever created. Validates
-- amount > 0 and amount <= current balance (blocks overpayment), classifies
-- payment_type, stamps recorded_by from the caller's own session.
-- ---------------------------------------------------------------------------
create function record_payment(
  p_order_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_mode text,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance numeric;
  v_has_prior boolean;
  v_type text;
  v_payment_id uuid;
begin
  if not auth_has_permission('orders.recordPayment') then
    raise exception 'permission denied: orders.recordPayment required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  if p_payment_date is not null and p_payment_date > current_date then
    raise exception 'payment date cannot be in the future';
  end if;

  select balance into v_balance from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found: %', p_order_id;
  end if;

  if p_amount > v_balance then
    raise exception 'amount exceeds remaining balance of %', v_balance;
  end if;

  select exists(
    select 1 from payments where order_id = p_order_id and not voided
  ) into v_has_prior;

  v_type := case
    when p_amount >= v_balance then 'Final'
    when not v_has_prior then 'Advance'
    else 'Partial'
  end;

  insert into payments (
    order_id, amount, payment_date, payment_mode, payment_type, notes, recorded_by
  ) values (
    p_order_id, p_amount, coalesce(p_payment_date, current_date), p_payment_mode, v_type, p_notes, auth.uid()
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- void_payment — soft-void only, never a hard delete. Reason is required by
-- the RPC's own caller (UI), stored either way for the audit trail.
-- ---------------------------------------------------------------------------
create function void_payment(
  p_payment_id uuid,
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

  select id into v_found from payments where id = p_payment_id and not voided;
  if not found then
    raise exception 'payment not found or already voided: %', p_payment_id;
  end if;

  update payments set
    voided = true,
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason = p_reason
  where id = p_payment_id;
end;
$$;

grant execute on function record_payment(uuid, numeric, date, text, text) to authenticated, service_role;
grant execute on function void_payment(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_order_with_items (0006) — same signature, body updated so the
-- initial advance (if any) becomes a real payments row instead of a raw
-- column write. The order row is still inserted with balance/payment_status
-- computed directly (unchanged, covers the zero-advance case standalone);
-- if p_advance_paid > 0 the payments insert below then fires
-- payments_recompute_order_totals, which overwrites advance_paid/balance/
-- payment_status with the same numbers computed the ledger's way — same
-- result, now sourced from a real transaction row. Runs as this function's
-- own SECURITY DEFINER context, so it does not require orders.recordPayment
-- — orders.create alone is still sufficient to set an initial advance,
-- matching pre-ledger behavior exactly.
-- ---------------------------------------------------------------------------
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

  insert into orders (
    order_number, customer_id, customer_snapshot, order_date, trial_date,
    delivery_date, total_amount, advance_paid, balance, payment_mode,
    status, payment_status
  ) values (
    v_order_number, p_customer_id, p_customer_snapshot, p_order_date, p_trial_date,
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

-- ---------------------------------------------------------------------------
-- Permission seed updates — role-admin's row is otherwise immutable via the
-- app (0001's roles_update policy blocks id = 'role-admin'; lib/roles.ts's
-- updateRole() also refuses), so its two new keys are granted here directly.
-- Manager gets recordPayment only, per explicit decision (voidPayment stays
-- Admin-only). Staff gets neither, unchanged.
-- ---------------------------------------------------------------------------
update roles
set permissions = permissions || array['orders.recordPayment', 'orders.voidPayment']::text[]
where id = 'role-admin'
  and not ('orders.recordPayment' = any(permissions));

update roles
set permissions = permissions || array['orders.recordPayment']::text[]
where id = 'role-manager'
  and not ('orders.recordPayment' = any(permissions));
