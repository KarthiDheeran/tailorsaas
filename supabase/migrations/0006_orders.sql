-- Phase 6C: real tables for Orders + Order Items. References the real
-- customers table (6A) and catalog_garment_types table (6B). Staff,
-- Reports, and Dashboard stay mock — lib/data/stub-data.ts's mock `orders`
-- array is left completely untouched since lib/dashboard.ts/lib/reports.ts/
-- lib/customers.ts (Reports-only) all read it directly and aren't
-- migrating in this phase.
--
-- Order creation/update go through two hardened, transactional RPCs
-- (create_order_with_items / update_order_with_items) rather than
-- multi-statement client-side sequences, so a mid-write failure can never
-- leave a half-created order or an order that's lost its items — Postgres
-- rolls back a function's entire body automatically if any statement
-- inside it raises.

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references customers(id) on delete restrict,
  customer_snapshot jsonb,
  order_date date not null,
  trial_date date,
  delivery_date date not null,
  total_amount numeric not null default 0,
  advance_paid numeric not null default 0,
  balance numeric not null default 0,
  payment_mode text not null check (payment_mode in ('Cash','GPay','UPI','Card','Bank Transfer','Cheque')),
  status text not null check (status in ('In Progress','Ready','Delayed','Delivered','Cancelled')),
  payment_status text check (payment_status in ('Not calculated','Paid','Due','Overdue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  serial_no int not null,
  particular text not null,
  -- Nullable — populated only when New Order (Catalog-driven since 6B)
  -- created the item; Edit Order still uses free-text particular with no
  -- catalog id, so its items leave this null ("where possible").
  garment_type_id uuid references catalog_garment_types(id) on delete set null,
  size text,
  qty int not null check (qty > 0),
  rate numeric not null check (rate >= 0),
  -- Snapshot, not a live join to catalog_addons — [{key,label,amount}],
  -- exactly OrderItemAddOn's shape. A later catalog price change must never
  -- alter an already-placed order, so the price is baked in here at order
  -- time and never re-resolved.
  add_ons jsonb,
  add_ons_total numeric,
  final_rate numeric,
  amount numeric not null check (amount >= 0),
  measurements jsonb,
  unique (order_id, serial_no)
);

-- Backing counter for concurrency-safe, yearly-resetting order numbers.
-- RLS-locked with zero policies and no table grants — only the two
-- SECURITY DEFINER functions below can touch it.
create table order_number_counters (
  year int primary key,
  last_seq int not null default 0
);

alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_number_counters enable row level security;

create policy orders_select on orders for select
  using (auth_has_permission('orders.view'));
create policy orders_insert on orders for insert
  with check (auth_has_permission('orders.create'));
-- RLS gates rows, not columns — a caller with only orders.changeStatus (not
-- orders.edit) still needs row-level UPDATE access here; the actual
-- restriction to "only the status column changes" stays enforced in
-- updateOrderStatusAction's own code, not the database (same limitation
-- already flagged in the Phase 6 top-level plan).
create policy orders_update on orders for update
  using (auth_has_permission('orders.edit') or auth_has_permission('orders.changeStatus'))
  with check (auth_has_permission('orders.edit') or auth_has_permission('orders.changeStatus'));
-- No delete policy — orders are never deleted, only status-changed to
-- Cancelled.

create policy order_items_select on order_items for select
  using (auth_has_permission('orders.view'));
create policy order_items_insert on order_items for insert
  with check (auth_has_permission('orders.create') or auth_has_permission('orders.edit'));
create policy order_items_update on order_items for update
  using (auth_has_permission('orders.edit'))
  with check (auth_has_permission('orders.edit'));
-- Delete is needed here (unlike orders): Edit Order can remove item rows,
-- and since order_items is a normalized child table (not an embedded
-- array), removing an item means an actual DELETE.
create policy order_items_delete on order_items for delete
  using (auth_has_permission('orders.edit'));

grant select, insert, update on orders to authenticated, service_role;
grant select, insert, update, delete on order_items to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Order number generation — atomic, concurrency-safe, permission-checked.
-- ---------------------------------------------------------------------------

-- The real, mutating source of truth. A single INSERT ... ON CONFLICT ...
-- RETURNING is one statement, so Postgres serializes concurrent callers on
-- this row's lock — two simultaneous createOrder calls can never receive
-- the same number, unlike the old mock's read-then-scan approach.
create function generate_order_number() returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year int := extract(year from now())::int;
  v_seq int;
begin
  if not auth_has_permission('orders.create') then
    raise exception 'permission denied: orders.create required';
  end if;

  insert into order_number_counters (year, last_seq)
  values (v_year, 1)
  on conflict (year) do update set last_seq = order_number_counters.last_seq + 1
  returning last_seq into v_seq;

  return 'ORD-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

-- Read-only peek for New Order's header display before the order is
-- actually saved — deliberately does not increment the counter, so two
-- people opening New Order simultaneously don't burn two real numbers just
-- by looking at the page. May show a stale/reused preview under real
-- concurrency (matching the already-accepted "frozen for this session, the
-- real number is recomputed at save time" behavior) — only
-- generate_order_number() above is ever the source of truth.
create function peek_next_order_number() returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select case when auth_has_permission('orders.create') then
    'ORD-' || extract(year from now())::int || '-' || lpad(
      (coalesce((select last_seq from order_number_counters
        where year = extract(year from now())::int), 0) + 1)::text, 4, '0')
  else null end;
$$;

grant execute on function generate_order_number() to authenticated, service_role;
grant execute on function peek_next_order_number() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Transactional create/update — a function body is atomic relative to the
-- caller: if any statement inside raises, every effect within this same
-- function call rolls back automatically. This is what prevents a
-- half-created order (order row with no items) or a half-updated one
-- (items deleted but the replacement insert never happens).
-- ---------------------------------------------------------------------------

create function create_order_with_items(
  p_customer_id uuid,
  p_customer_snapshot jsonb,
  p_order_date date,
  p_trial_date date,
  p_delivery_date date,
  p_advance_paid numeric,
  p_payment_mode text,
  p_status text,
  p_items jsonb -- array of OrderItem-shaped objects (camelCase keys, matching lib/types.ts)
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

  return v_order_id;
end;
$$;

create function update_order_with_items(
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
declare
  v_advance_paid numeric;
  v_total_amount numeric;
  v_balance numeric;
begin
  if not auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;

  select advance_paid into v_advance_paid from orders where id = p_order_id;
  if not found then
    raise exception 'order not found: %', p_order_id;
  end if;

  select coalesce(sum((item->>'amount')::numeric), 0) into v_total_amount
  from jsonb_array_elements(p_items) as item;
  v_balance := v_total_amount - v_advance_paid;

  update orders set
    order_date = p_order_date,
    delivery_date = p_delivery_date,
    status = p_status,
    total_amount = v_total_amount,
    balance = v_balance,
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
end;
$$;

grant execute on function create_order_with_items(
  uuid, jsonb, date, date, date, numeric, text, text, jsonb
) to authenticated, service_role;
grant execute on function update_order_with_items(
  uuid, date, date, text, jsonb
) to authenticated, service_role;
