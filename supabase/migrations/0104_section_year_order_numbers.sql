-- Preserve issued numbers; allocate future numbers independently by section
-- and by an explicitly selected numbering year (never reset automatically).
begin;
lock table public.orders in share row exclusive mode;
lock table public.shop_order_number_counters in access exclusive mode;

alter table public.orders add column order_number_year integer;
update public.orders set order_number_year = extract(year from current_date)::integer;
alter table public.orders alter column order_number_year set not null;
alter table public.orders add constraint orders_number_year_check
  check (order_number_year between 2000 and 9999);

alter table public.shop_order_number_counters add column order_section text;
alter table public.shop_order_number_counters add column numbering_year integer not null default extract(year from current_date)::integer;
-- Existing shop-wide counters are replaced by each section's highest issued
-- number. No existing order, invoice, barcode, or production slip is renumbered.
delete from public.shop_order_number_counters;
alter table public.shop_order_number_counters drop constraint shop_order_number_counters_pkey;
alter table public.shop_order_number_counters alter column order_section set not null;
alter table public.shop_order_number_counters add primary key (tenant_id, shop_id, order_section);
alter table public.shop_order_number_counters add check (order_section in ('Men','Chudidar','Blouse'));
alter table public.shop_order_number_counters add check (numbering_year between 2000 and 9999);
insert into public.shop_order_number_counters (tenant_id, shop_id, order_section, last_seq)
select tenant_id, shop_id, order_section, coalesce(max(order_sequence), 0)
from public.orders
where tenant_id is not null and shop_id is not null and order_section is not null
group by tenant_id, shop_id, order_section;

drop index public.orders_shop_sequence_unique_idx;
create unique index orders_section_year_sequence_unique_idx
on public.orders (tenant_id, shop_id, order_section, order_number_year, order_sequence)
where order_sequence is not null;

create table public.order_number_resets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  shop_id uuid not null references public.shops(id),
  order_section text not null check (order_section in ('Men','Chudidar','Blouse')),
  previous_year integer not null,
  previous_last_seq integer not null,
  numbering_year integer not null,
  reset_by uuid not null references auth.users(id),
  reset_at timestamptz not null default now(),
  unique (tenant_id, shop_id, order_section, numbering_year)
);
alter table public.order_number_resets enable row level security;
revoke all on public.order_number_resets from public, anon, authenticated;

create or replace function public.generate_order_number(p_order_section text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.auth_user_tenant_id();
  v_shop uuid := public.auth_user_shop_id();
  v_sequence integer;
begin
  if not public.auth_has_permission('orders.create') then
    raise exception 'permission denied: orders.create required';
  end if;
  if v_tenant is null or v_shop is null or p_order_section is null
     or p_order_section not in ('Men','Chudidar','Blouse')
     or not public.auth_can_access_scope(v_tenant, v_shop, p_order_section) then
    raise exception 'Invalid or inaccessible order section';
  end if;
  insert into public.shop_order_number_counters (tenant_id, shop_id, order_section, last_seq)
  values (v_tenant, v_shop, p_order_section, 1)
  on conflict (tenant_id, shop_id, order_section) do update
    set last_seq = public.shop_order_number_counters.last_seq + 1, updated_at = now()
  returning last_seq into v_sequence;
  return v_sequence::text;
end;
$$;

create or replace function public.peek_next_order_number(p_order_section text) returns text
language sql security definer stable set search_path = public, pg_temp as $$
  select case when public.auth_has_permission('orders.create')
    and public.auth_user_tenant_id() is not null and public.auth_user_shop_id() is not null
    and p_order_section in ('Men','Chudidar','Blouse')
    and public.auth_can_access_scope(public.auth_user_tenant_id(), public.auth_user_shop_id(), p_order_section)
  then (coalesce((select last_seq from public.shop_order_number_counters
    where tenant_id = public.auth_user_tenant_id() and shop_id = public.auth_user_shop_id()
      and order_section = p_order_section), 0) + 1)::text end
$$;

-- The allocator already holds this row lock through the order insert. Taking
-- it here too keeps direct inserts and year resets serialized with allocation.
create function public.set_order_number_year() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if TG_OP = 'UPDATE' then
    if new.order_section is distinct from old.order_section
       or new.order_number_year is distinct from old.order_number_year
       or new.order_sequence is distinct from old.order_sequence
       or new.order_number is distinct from old.order_number
       or new.tenant_id is distinct from old.tenant_id
       or new.shop_id is distinct from old.shop_id then
      raise exception 'An issued order number and its section/year cannot be changed.';
    end if;
    return new;
  end if;
  select numbering_year into new.order_number_year
  from public.shop_order_number_counters
  where tenant_id = new.tenant_id and shop_id = new.shop_id and order_section = new.order_section
  for update;
  new.order_number_year := coalesce(new.order_number_year, extract(year from current_date)::integer);
  return new;
end;
$$;
create trigger orders_number_year before insert or update on public.orders
for each row execute function public.set_order_number_year();

create function public.get_order_number_sequences()
returns table (order_section text, numbering_year integer, next_number integer)
language sql security definer stable set search_path = public, pg_temp as $$
  select s.section, coalesce(c.numbering_year, extract(year from current_date)::integer), coalesce(c.last_seq, 0) + 1
  from unnest(array['Men','Chudidar','Blouse']) as s(section)
  left join public.shop_order_number_counters c
    on c.tenant_id = public.auth_user_tenant_id() and c.shop_id = public.auth_user_shop_id() and c.order_section = s.section
  where public.auth_has_permission('settings.view')
    and public.auth_user_tenant_id() is not null and public.auth_user_shop_id() is not null
    and public.auth_can_access_scope(public.auth_user_tenant_id(), public.auth_user_shop_id(), s.section)
$$;

create function public.reset_order_number_sequence(p_order_section text, p_expected_year integer, p_new_year integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.auth_user_tenant_id();
  v_shop uuid := public.auth_user_shop_id();
  v_counter public.shop_order_number_counters%rowtype;
begin
  if not public.auth_has_permission('settings.manageShop') then
    raise exception 'permission denied: settings.manageShop required';
  end if;
  if v_tenant is null or v_shop is null or p_order_section is null
     or p_order_section not in ('Men','Chudidar','Blouse')
     or not public.auth_can_access_scope(v_tenant, v_shop, p_order_section) then
    raise exception 'Invalid or inaccessible order section';
  end if;
  insert into public.shop_order_number_counters (tenant_id, shop_id, order_section, last_seq)
  values (v_tenant, v_shop, p_order_section, 0) on conflict do nothing;
  select * into v_counter from public.shop_order_number_counters
  where tenant_id = v_tenant and shop_id = v_shop and order_section = p_order_section for update;
  if p_expected_year is distinct from v_counter.numbering_year then
    raise exception 'Numbering has changed. Refresh before starting a new year.';
  end if;
  if p_new_year is null or p_new_year <= v_counter.numbering_year or p_new_year > 9999 then
    raise exception 'Choose a year later than the current numbering year.';
  end if;
  if exists (select 1 from public.orders where tenant_id = v_tenant and shop_id = v_shop
    and order_section = p_order_section and order_number_year = p_new_year) then
    raise exception 'Orders already exist for this numbering year.';
  end if;
  insert into public.order_number_resets (tenant_id, shop_id, order_section, previous_year, previous_last_seq, numbering_year, reset_by)
  values (v_tenant, v_shop, p_order_section, v_counter.numbering_year, v_counter.last_seq, p_new_year, auth.uid());
  update public.shop_order_number_counters set numbering_year = p_new_year, last_seq = 0, updated_at = now()
  where tenant_id = v_tenant and shop_id = v_shop and order_section = p_order_section;
end;
$$;

revoke all on function public.set_order_number_year() from public;
revoke all on function public.get_order_number_sequences() from public;
revoke all on function public.reset_order_number_sequence(text, integer, integer) from public;
grant execute on function public.get_order_number_sequences() to authenticated;
grant execute on function public.reset_order_number_sequence(text, integer, integer) to authenticated;

-- Existing 0102 deletion function, with all authorization/activity guards and
-- its existing deletion behavior preserved. Only counter predicates change:
-- deleting an old-year order must not decrement this year's or another
-- section's counter. No new deletion permissions are granted here.
create or replace function public.delete_untouched_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and public.auth_can_access_scope(tenant_id, shop_id, order_section);
  if not found then
    raise exception 'Order not found or access denied.';
  end if;

  -- Creation takes this same counter lock before inserting an order. Keep
  -- that lock order so creation and deletion cannot reuse a number together.
  perform 1 from public.shop_order_number_counters
  where tenant_id = v_order.tenant_id and shop_id = v_order.shop_id
    and order_section = v_order.order_section
  for update;

  select * into v_order
  from public.orders
  where id = p_order_id
    and public.auth_can_access_scope(tenant_id, shop_id, order_section)
  for update;
  if not found then
    raise exception 'Order not found or access denied.';
  end if;

  -- Block production updates while checking whether the order is untouched.
  -- The order lock also blocks new referencing payment/work rows.
  perform 1 from public.job_cards
  where order_id = p_order_id
  order by id
  for update;

  if exists (select 1 from public.payments where order_id = p_order_id)
     or exists (select 1 from public.order_financial_adjustments where order_id = p_order_id) then
    raise exception 'Orders with payment or financial activity cannot be deleted.';
  end if;

  if exists (
    select 1 from public.job_cards
    where order_id = p_order_id
      and (
        current_stage <> 'Unassigned'
        or assigned_staff_id is not null
        or started_date is not null
        or completed_date is not null
        or cancelled
      )
  ) then
    raise exception 'This order has already started production and cannot be deleted.';
  end if;

  if exists (select 1 from public.job_card_stage_slips where order_id = p_order_id)
     or exists (select 1 from public.staff_work_earnings where order_id = p_order_id) then
    raise exception 'This order has job-card or staff work activity and cannot be deleted.';
  end if;

  delete from public.orders where id = p_order_id;

  update public.shop_order_number_counters
  set last_seq = last_seq - 1, updated_at = now()
  where tenant_id = v_order.tenant_id
    and shop_id = v_order.shop_id
    and order_section = v_order.order_section
    and numbering_year = v_order.order_number_year
    and last_seq = v_order.order_sequence
    and last_seq > 0
    and not exists (
      select 1 from public.orders
      where tenant_id = v_order.tenant_id
        and shop_id = v_order.shop_id
        and order_section = v_order.order_section
        and order_number_year = v_order.order_number_year
        and order_sequence >= v_order.order_sequence
    );
end;
$$;

commit;
