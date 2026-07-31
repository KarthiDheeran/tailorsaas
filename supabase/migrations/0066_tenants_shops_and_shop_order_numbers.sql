-- Multi-tenant/shop access + shop-wise numeric order numbers.
--
-- New orders now receive plain numeric order numbers scoped to one shop:
--   tenant_id + shop_id + order_sequence is unique
-- The public order_number remains text for printing/search, but no longer
-- carries Men/Blouse/Chudidar prefixes.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  location text not null default '',
  allowed_order_sections text[] not null default array['Men','Chudidar','Blouse']::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name),
  check (allowed_order_sections <@ array['Men','Chudidar','Blouse']::text[])
);

insert into public.tenants (name)
values ('NewLook')
on conflict (name) do nothing;

insert into public.shops (tenant_id, name, location, allowed_order_sections)
select id, 'Main Shop', '', array['Men','Chudidar','Blouse']::text[]
from public.tenants
where name = 'NewLook'
on conflict (tenant_id, name) do nothing;

alter table public.tenants enable row level security;
alter table public.shops enable row level security;

grant select, insert, update on public.tenants, public.shops to authenticated, service_role;

alter table public.profiles
  add column if not exists tenant_id uuid references public.tenants(id) on delete restrict,
  add column if not exists shop_id uuid references public.shops(id) on delete restrict,
  add column if not exists allowed_order_sections text[] not null default array['Men','Chudidar','Blouse']::text[];

alter table public.profiles
  drop constraint if exists profiles_allowed_order_sections_check;

alter table public.profiles
  add constraint profiles_allowed_order_sections_check
  check (allowed_order_sections <@ array['Men','Chudidar','Blouse']::text[]);

update public.profiles p
set tenant_id = t.id
from public.tenants t
where p.tenant_id is null
  and t.name = 'NewLook';

update public.profiles p
set shop_id = s.id
from public.shops s
where p.shop_id is null
  and s.tenant_id = p.tenant_id
  and s.name = 'Main Shop';

alter table public.profiles
  alter column tenant_id set not null;

create or replace function public.auth_user_tenant_id()
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.active
$$;

create or replace function public.auth_user_shop_id()
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select p.shop_id
  from public.profiles p
  where p.id = auth.uid()
    and p.active
$$;

create or replace function public.auth_user_allowed_order_sections()
returns text[]
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(p.allowed_order_sections, array[]::text[])
  from public.profiles p
  where p.id = auth.uid()
    and p.active
$$;

create or replace function public.auth_is_tenant_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active
      and p.role_id = 'role-admin'
  )
$$;

create or replace function public.auth_can_access_scope(
  p_tenant_id uuid,
  p_shop_id uuid,
  p_order_section text
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active
      and p.tenant_id = p_tenant_id
      and (
        p.role_id = 'role-admin'
        or p.shop_id = p_shop_id
      )
      and (
        p.role_id = 'role-admin'
        or p_order_section is null
        or p_order_section = any(p.allowed_order_sections)
      )
  )
$$;

drop policy if exists tenants_select on public.tenants;
drop policy if exists tenants_insert on public.tenants;
drop policy if exists tenants_update on public.tenants;
drop policy if exists shops_select on public.shops;
drop policy if exists shops_insert on public.shops;
drop policy if exists shops_update on public.shops;

create policy tenants_select on public.tenants
  for select
  using (id = public.auth_user_tenant_id());

create policy tenants_insert on public.tenants
  for insert
  with check (public.auth_is_tenant_admin());

create policy tenants_update on public.tenants
  for update
  using (id = public.auth_user_tenant_id() and public.auth_has_permission('settings.manageShop'))
  with check (id = public.auth_user_tenant_id() and public.auth_has_permission('settings.manageShop'));

create policy shops_select on public.shops
  for select
  using (tenant_id = public.auth_user_tenant_id());

create policy shops_insert on public.shops
  for insert
  with check (tenant_id = public.auth_user_tenant_id() and public.auth_has_permission('settings.manageShop'));

create policy shops_update on public.shops
  for update
  using (tenant_id = public.auth_user_tenant_id() and public.auth_has_permission('settings.manageShop'))
  with check (tenant_id = public.auth_user_tenant_id() and public.auth_has_permission('settings.manageShop'));

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_managed on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;

create policy profiles_select_own on public.profiles
  for select
  using (id = auth.uid());

create policy profiles_select_managed on public.profiles
  for select
  using (
    public.auth_has_permission('settings.manageUsers')
    and tenant_id = public.auth_user_tenant_id()
  );

create policy profiles_insert on public.profiles
  for insert
  with check (
    public.auth_has_permission('settings.manageUsers')
    and tenant_id = public.auth_user_tenant_id()
    and allowed_order_sections <@ array['Men','Chudidar','Blouse']::text[]
    and (
      shop_id is null
      or exists (
        select 1 from public.shops s
        where s.id = shop_id
          and s.tenant_id = public.auth_user_tenant_id()
      )
    )
  );

create policy profiles_update on public.profiles
  for update
  using (
    public.auth_has_permission('settings.manageUsers')
    and tenant_id = public.auth_user_tenant_id()
  )
  with check (
    public.auth_has_permission('settings.manageUsers')
    and tenant_id = public.auth_user_tenant_id()
    and allowed_order_sections <@ array['Men','Chudidar','Blouse']::text[]
    and (
      shop_id is null
      or exists (
        select 1 from public.shops s
        where s.id = shop_id
          and s.tenant_id = public.auth_user_tenant_id()
      )
    )
  );

alter table public.customers
  add column if not exists tenant_id uuid references public.tenants(id) on delete restrict,
  add column if not exists shop_id uuid references public.shops(id) on delete restrict;

update public.customers c
set tenant_id = t.id
from public.tenants t
where c.tenant_id is null
  and t.name = 'NewLook';

update public.customers c
set shop_id = s.id
from public.shops s
where c.shop_id is null
  and s.tenant_id = c.tenant_id
  and s.name = 'Main Shop';

alter table public.customers
  alter column tenant_id set not null,
  alter column shop_id set not null,
  alter column tenant_id set default public.auth_user_tenant_id(),
  alter column shop_id set default public.auth_user_shop_id();

drop index if exists public.customers_phone_unique_idx;
create unique index if not exists customers_tenant_phone_unique_idx
  on public.customers (tenant_id, phone);

drop policy if exists customers_select on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_update on public.customers;

create policy customers_select on public.customers
  for select
  using (
    public.auth_has_permission('customers.view')
    and tenant_id = public.auth_user_tenant_id()
    and (public.auth_is_tenant_admin() or shop_id = public.auth_user_shop_id())
  );

create policy customers_insert on public.customers
  for insert
  with check (
    public.auth_has_permission('customers.create')
    and tenant_id = public.auth_user_tenant_id()
    and shop_id = public.auth_user_shop_id()
  );

create policy customers_update on public.customers
  for update
  using (
    public.auth_has_permission('customers.edit')
    and tenant_id = public.auth_user_tenant_id()
    and (public.auth_is_tenant_admin() or shop_id = public.auth_user_shop_id())
  )
  with check (
    public.auth_has_permission('customers.edit')
    and tenant_id = public.auth_user_tenant_id()
    and (public.auth_is_tenant_admin() or shop_id = public.auth_user_shop_id())
  );

create or replace function public.auth_can_access_customer(p_customer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.tenant_id = public.auth_user_tenant_id()
      and (public.auth_is_tenant_admin() or c.shop_id = public.auth_user_shop_id())
  )
$$;

alter table public.catalog_garment_types
  drop constraint if exists catalog_garment_types_order_section_check;

update public.catalog_garment_types
set order_section = 'Chudidar'
where order_section = 'Chutti';

alter table public.catalog_garment_types
  add constraint catalog_garment_types_order_section_check
  check (order_section in ('Men','Chudidar','Blouse'));

alter table public.orders
  add column if not exists tenant_id uuid references public.tenants(id) on delete restrict,
  add column if not exists shop_id uuid references public.shops(id) on delete restrict;

update public.orders o
set tenant_id = t.id
from public.tenants t
where o.tenant_id is null
  and t.name = 'NewLook';

update public.orders o
set shop_id = s.id
from public.shops s
where o.shop_id is null
  and s.tenant_id = o.tenant_id
  and s.name = 'Main Shop';

with numbered as (
  select
    id,
    row_number() over (
      partition by tenant_id, shop_id
      order by order_date nulls last, created_at nulls last, id
    )::integer as next_sequence
  from public.orders
  where tenant_id is not null
    and shop_id is not null
)
update public.orders o
set order_sequence = numbered.next_sequence,
    order_number = numbered.next_sequence::text
from numbered
where numbered.id = o.id;

alter table public.orders
  alter column tenant_id set not null,
  alter column shop_id set not null,
  alter column tenant_id set default public.auth_user_tenant_id(),
  alter column shop_id set default public.auth_user_shop_id();

alter table public.orders
  drop constraint if exists orders_order_section_check;

update public.orders
set order_section = 'Chudidar'
where order_section = 'Chutti';

alter table public.orders
  add constraint orders_order_section_check
  check (order_section is null or order_section in ('Men','Chudidar','Blouse'));

alter table public.orders
  drop constraint if exists orders_order_number_key;

drop index if exists public.orders_section_sequence_unique_idx;
create unique index if not exists orders_shop_sequence_unique_idx
  on public.orders (tenant_id, shop_id, order_sequence)
  where order_sequence is not null;

create or replace function public.auth_can_access_order(p_order_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and public.auth_can_access_scope(o.tenant_id, o.shop_id, o.order_section)
  )
$$;

create table if not exists public.shop_order_number_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  last_seq integer not null default 0 check (last_seq >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, shop_id)
);

insert into public.shop_order_number_counters (tenant_id, shop_id, last_seq, updated_at)
select tenant_id, shop_id, coalesce(max(order_sequence), 0), now()
from public.orders
where tenant_id is not null and shop_id is not null
group by tenant_id, shop_id
on conflict (tenant_id, shop_id) do update
set last_seq = greatest(public.shop_order_number_counters.last_seq, excluded.last_seq),
    updated_at = now();

alter table public.shop_order_number_counters enable row level security;
revoke all on public.shop_order_number_counters from public, anon, authenticated;

create or replace function public.generate_order_number(p_order_section text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant_id uuid := public.auth_user_tenant_id();
  v_shop_id uuid := public.auth_user_shop_id();
  v_sequence integer;
begin
  if not public.auth_has_permission('orders.create') then
    raise exception 'permission denied: orders.create required';
  end if;
  if v_tenant_id is null or v_shop_id is null then
    raise exception 'user is not assigned to a tenant/shop';
  end if;
  if p_order_section not in ('Men', 'Chudidar', 'Blouse') then
    raise exception 'invalid order section';
  end if;
  if not public.auth_can_access_scope(v_tenant_id, v_shop_id, p_order_section) then
    raise exception 'permission denied for order section';
  end if;

  insert into public.shop_order_number_counters (tenant_id, shop_id, last_seq, updated_at)
  values (v_tenant_id, v_shop_id, 1, now())
  on conflict (tenant_id, shop_id) do update
    set last_seq = public.shop_order_number_counters.last_seq + 1,
        updated_at = now()
  returning last_seq into v_sequence;

  return v_sequence::text;
end;
$$;

create or replace function public.peek_next_order_number(p_order_section text) returns text
language sql security definer stable set search_path = public, pg_temp as $$
  select case
    when not public.auth_has_permission('orders.create') then null
    when public.auth_user_tenant_id() is null or public.auth_user_shop_id() is null then null
    when p_order_section not in ('Men', 'Chudidar', 'Blouse') then null
    when not public.auth_can_access_scope(public.auth_user_tenant_id(), public.auth_user_shop_id(), p_order_section) then null
    else (
      coalesce((
        select last_seq
        from public.shop_order_number_counters
        where tenant_id = public.auth_user_tenant_id()
          and shop_id = public.auth_user_shop_id()
      ), 0) + 1
    )::text
  end
$$;

drop policy if exists orders_select on public.orders;
drop policy if exists orders_insert on public.orders;
drop policy if exists orders_update on public.orders;
drop policy if exists order_items_select on public.order_items;
drop policy if exists order_items_insert on public.order_items;
drop policy if exists order_items_update on public.order_items;
drop policy if exists order_items_delete on public.order_items;

create policy orders_select on public.orders for select
  using (
    public.auth_has_permission('orders.view')
    and public.auth_can_access_scope(tenant_id, shop_id, order_section)
  );

create policy orders_insert on public.orders for insert
  with check (
    public.auth_has_permission('orders.create')
    and public.auth_can_access_scope(tenant_id, shop_id, order_section)
  );

create policy orders_update on public.orders for update
  using (
    (public.auth_has_permission('orders.edit') or public.auth_has_permission('orders.changeStatus'))
    and public.auth_can_access_scope(tenant_id, shop_id, order_section)
  )
  with check (
    (public.auth_has_permission('orders.edit') or public.auth_has_permission('orders.changeStatus'))
    and public.auth_can_access_scope(tenant_id, shop_id, order_section)
  );

create policy order_items_select on public.order_items for select
  using (
    public.auth_has_permission('orders.view')
    and exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.auth_can_access_scope(o.tenant_id, o.shop_id, o.order_section)
    )
  );

create policy order_items_insert on public.order_items for insert
  with check (
    (public.auth_has_permission('orders.create') or public.auth_has_permission('orders.edit'))
    and exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.auth_can_access_scope(o.tenant_id, o.shop_id, o.order_section)
    )
  );

create policy order_items_update on public.order_items for update
  using (
    public.auth_has_permission('orders.edit')
    and exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.auth_can_access_scope(o.tenant_id, o.shop_id, o.order_section)
    )
  )
  with check (
    public.auth_has_permission('orders.edit')
    and exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.auth_can_access_scope(o.tenant_id, o.shop_id, o.order_section)
    )
  );

create policy order_items_delete on public.order_items for delete
  using (
    public.auth_has_permission('orders.edit')
    and exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.auth_can_access_scope(o.tenant_id, o.shop_id, o.order_section)
    )
  );

create or replace function public.create_order_with_items(
  p_customer_id uuid, p_customer_snapshot jsonb, p_order_date date,
  p_trial_date date, p_delivery_date date, p_delivery_promise_note text,
  p_advance_paid numeric, p_payment_mode text, p_status text,
  p_order_section text, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order_id uuid; v_order_number text; v_invoice_number text;
  v_taxable_total numeric; v_total_amount numeric; v_balance numeric; v_payment_status text;
  v_order_sequence integer; v_tenant_id uuid := public.auth_user_tenant_id(); v_shop_id uuid := public.auth_user_shop_id();
begin
  if not public.auth_has_permission('orders.create') then raise exception 'permission denied: orders.create required'; end if;
  if v_tenant_id is null or v_shop_id is null then raise exception 'user is not assigned to a tenant/shop'; end if;
  if p_order_section not in ('Men', 'Chudidar', 'Blouse') then raise exception 'invalid order section'; end if;
  if not public.auth_can_access_scope(v_tenant_id, v_shop_id, p_order_section) then raise exception 'permission denied for order section'; end if;

  select coalesce(sum((item->>'amount')::numeric), 0) into v_taxable_total from jsonb_array_elements(p_items) item;
  v_total_amount := public.order_total_with_configured_tax(v_taxable_total);
  v_balance := v_total_amount - p_advance_paid;
  v_payment_status := case when v_total_amount = 0 then 'Not calculated' when v_balance <= 0 then 'Paid' when p_delivery_date is not null and p_delivery_date < current_date then 'Overdue' else 'Due' end;
  v_order_number := public.generate_order_number(p_order_section);
  v_order_sequence := v_order_number::integer;
  v_invoice_number := public.generate_invoice_number();

  insert into public.orders (tenant_id, shop_id, order_number, order_section, order_sequence, invoice_number, customer_id, customer_snapshot, order_date, trial_date, delivery_date, delivery_promise_note, total_amount, advance_paid, balance, payment_mode, status, payment_status)
  values (v_tenant_id, v_shop_id, v_order_number, p_order_section, v_order_sequence, v_invoice_number, p_customer_id, p_customer_snapshot, p_order_date, p_trial_date, p_delivery_date, coalesce(p_delivery_promise_note, ''), v_total_amount, p_advance_paid, v_balance, p_payment_mode, p_status, v_payment_status)
  returning id into v_order_id;

  insert into public.order_items (order_id, serial_no, particular, garment_type_id, size, qty, rate, add_ons, add_ons_total, final_rate, amount, measurements, field_schema_snapshot, fabric_source, fabric_notes, design_notes, alteration_issue, alteration_required_change, alteration_charge_type, linked_original_order_id)
  select v_order_id, (item->>'serialNo')::int, item->>'particular', nullif(item->>'garmentTypeId','')::uuid, item->>'size', (item->>'qty')::int, (item->>'rate')::numeric, item->'addOns', (item->>'addOnsTotal')::numeric, (item->>'finalRate')::numeric, (item->>'amount')::numeric, item->'measurements', item->'fieldSchemaSnapshot', coalesce(nullif(item->>'fabricSource',''),'Not specified'), coalesce(item->>'fabricNotes',''), coalesce(item->>'designNotes',''), coalesce(item->>'alterationIssue',''), coalesce(item->>'alterationRequiredChange',''), nullif(item->>'alterationChargeType',''), nullif(item->>'linkedOriginalOrderId','')::uuid
  from jsonb_array_elements(p_items) item;

  if p_advance_paid > 0 then insert into public.payments (order_id, amount, payment_date, payment_mode, payment_type, notes, recorded_by) values (v_order_id, p_advance_paid, p_order_date, p_payment_mode, 'Advance', null, auth.uid()); end if;
  return v_order_id;
end;
$$;

grant execute on function public.generate_order_number(text) to authenticated, service_role;
grant execute on function public.peek_next_order_number(text) to authenticated, service_role;
grant execute on function public.create_order_with_items(uuid, jsonb, date, date, date, text, numeric, text, text, text, jsonb) to authenticated, service_role;

create or replace function public.save_garment_type_configuration(
  p_garment_type_id uuid,
  p_name text,
  p_order_section text,
  p_shortcut_code integer,
  p_base_price numeric,
  p_addon_ids uuid[],
  p_is_active boolean,
  p_legacy_measurement_field_ids text[],
  p_field_assignments jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_garment_id uuid;
begin
  if not public.auth_has_permission('catalog.manage') then
    raise exception 'permission denied: catalog.manage required';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'garment name is required';
  end if;
  if p_order_section not in ('Men', 'Chudidar', 'Blouse') then
    raise exception 'invalid order section';
  end if;
  if p_base_price is null or p_base_price < 0 then
    raise exception 'base price must be zero or greater';
  end if;
  if p_is_active and (p_shortcut_code is null or p_shortcut_code <= 0) then
    raise exception 'numeric code is required for active garment types';
  end if;
  if jsonb_typeof(coalesce(p_field_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'field assignments must be an array';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_field_assignments, '[]'::jsonb)) assignment
    group by assignment->>'fieldId'
    having count(*) > 1
  ) then
    raise exception 'duplicate field assignments are not allowed';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_field_assignments, '[]'::jsonb)) assignment
    left join public.catalog_fields field on field.id = nullif(assignment->>'fieldId', '')::uuid
    where field.id is null or not field.is_active
  ) then
    raise exception 'each assigned field must exist and be active';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_addon_ids, '{}'::uuid[])) addon_id
    left join public.catalog_addons addon on addon.id = addon_id
    where addon.id is null
  ) then
    raise exception 'unknown add-on';
  end if;

  if p_garment_type_id is null then
    insert into public.catalog_garment_types (
      name, order_section, shortcut_code, base_price, measurement_field_ids,
      addon_ids, is_active
    ) values (
      btrim(p_name), p_order_section, p_shortcut_code, p_base_price,
      coalesce(p_legacy_measurement_field_ids, '{}'::text[]),
      coalesce(p_addon_ids, '{}'::uuid[]), p_is_active
    ) returning id into v_garment_id;
  else
    update public.catalog_garment_types
    set
      name = btrim(p_name),
      order_section = p_order_section,
      shortcut_code = p_shortcut_code,
      base_price = p_base_price,
      measurement_field_ids = coalesce(p_legacy_measurement_field_ids, '{}'::text[]),
      addon_ids = coalesce(p_addon_ids, '{}'::uuid[]),
      is_active = p_is_active,
      updated_at = now()
    where id = p_garment_type_id
    returning id into v_garment_id;

    if v_garment_id is null then
      raise exception 'garment type not found';
    end if;
  end if;

  delete from public.garment_type_fields where garment_type_id = v_garment_id;

  insert into public.garment_type_fields (
    garment_type_id, field_id, section_id, display_order, is_required, default_value
  )
  select
    v_garment_id,
    (assignment->>'fieldId')::uuid,
    nullif(assignment->>'sectionId', '')::uuid,
    greatest(coalesce((assignment->>'displayOrder')::integer, 1), 1),
    coalesce((assignment->>'isRequired')::boolean, false),
    assignment->'defaultValue'
  from jsonb_array_elements(coalesce(p_field_assignments, '[]'::jsonb)) assignment
  order by greatest(coalesce((assignment->>'displayOrder')::integer, 1), 1);

  return v_garment_id;
end;
$$;

grant execute on function public.save_garment_type_configuration(
  uuid, text, text, integer, numeric, uuid[], boolean, text[], jsonb
) to authenticated, service_role;

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select
  using (
    public.auth_has_permission('orders.viewPayments')
    and public.auth_can_access_order(order_id)
  );

drop policy if exists order_attachments_select on public.order_attachments;
drop policy if exists order_attachments_insert on public.order_attachments;
drop policy if exists order_attachments_delete on public.order_attachments;

create policy order_attachments_select on public.order_attachments
  for select
  using (
    public.auth_has_permission('orders.view')
    and public.auth_can_access_order(order_id)
  );

create policy order_attachments_insert on public.order_attachments
  for insert
  with check (
    public.auth_has_permission('orders.edit')
    and public.auth_can_access_order(order_id)
  );

create policy order_attachments_delete on public.order_attachments
  for delete
  using (
    public.auth_has_permission('orders.edit')
    and public.auth_can_access_order(order_id)
  );

drop policy if exists job_cards_select on public.job_cards;
drop policy if exists job_cards_insert on public.job_cards;
drop policy if exists job_cards_update on public.job_cards;

create policy job_cards_select on public.job_cards for select
  using (
    (public.auth_has_permission('orders.view') or public.auth_has_permission('staff.view'))
    and public.auth_can_access_order(order_id)
  );

create policy job_cards_insert on public.job_cards for insert
  with check (
    (public.auth_has_permission('orders.create') or public.auth_has_permission('orders.edit') or public.auth_has_permission('staff.manage'))
    and public.auth_can_access_order(order_id)
  );

create policy job_cards_update on public.job_cards for update
  using (
    (public.auth_has_permission('orders.edit') or public.auth_has_permission('staff.manage') or public.auth_has_permission('orders.changeStatus'))
    and public.auth_can_access_order(order_id)
  )
  with check (
    (public.auth_has_permission('orders.edit') or public.auth_has_permission('staff.manage') or public.auth_has_permission('orders.changeStatus'))
    and public.auth_can_access_order(order_id)
  );

drop policy if exists job_card_stage_slips_select on public.job_card_stage_slips;
drop policy if exists job_card_stage_slips_insert on public.job_card_stage_slips;
drop policy if exists job_card_stage_slips_update on public.job_card_stage_slips;

create policy job_card_stage_slips_select on public.job_card_stage_slips for select
  using (
    (public.auth_has_permission('orders.view') or public.auth_has_permission('staff.view'))
    and public.auth_can_access_order(order_id)
  );

create policy job_card_stage_slips_insert on public.job_card_stage_slips for insert
  with check (
    (public.auth_has_permission('orders.printJobCard') or public.auth_has_permission('staff.manage'))
    and public.auth_can_access_order(order_id)
  );

create policy job_card_stage_slips_update on public.job_card_stage_slips for update
  using (
    public.auth_has_permission('staff.manage')
    and public.auth_can_access_order(order_id)
  )
  with check (
    public.auth_has_permission('staff.manage')
    and public.auth_can_access_order(order_id)
  );

drop policy if exists customer_measurements_select on public.customer_measurements;
drop policy if exists customer_measurements_insert on public.customer_measurements;
drop policy if exists customer_measurements_update on public.customer_measurements;
drop policy if exists garment_measurements_select on public.garment_measurements;
drop policy if exists garment_measurements_insert on public.garment_measurements;
drop policy if exists garment_measurements_update on public.garment_measurements;

create policy customer_measurements_select on public.customer_measurements
  for select
  using (
    public.auth_has_permission('customers.viewMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

create policy customer_measurements_insert on public.customer_measurements
  for insert
  with check (
    public.auth_has_permission('customers.editMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

create policy customer_measurements_update on public.customer_measurements
  for update
  using (
    public.auth_has_permission('customers.editMeasurements')
    and public.auth_can_access_customer(customer_id)
  )
  with check (
    public.auth_has_permission('customers.editMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

create policy garment_measurements_select on public.garment_measurements
  for select
  using (
    public.auth_has_permission('customers.viewMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

create policy garment_measurements_insert on public.garment_measurements
  for insert
  with check (
    public.auth_has_permission('customers.editMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

create policy garment_measurements_update on public.garment_measurements
  for update
  using (
    public.auth_has_permission('customers.editMeasurements')
    and public.auth_can_access_customer(customer_id)
  )
  with check (
    public.auth_has_permission('customers.editMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

drop policy if exists customer_measurement_revisions_select on public.customer_measurement_revisions;
drop policy if exists customer_measurement_revisions_insert on public.customer_measurement_revisions;
drop policy if exists garment_measurement_revisions_select on public.garment_measurement_revisions;
drop policy if exists garment_measurement_revisions_insert on public.garment_measurement_revisions;

create policy customer_measurement_revisions_select on public.customer_measurement_revisions
  for select
  using (
    public.auth_has_permission('customers.viewMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

create policy customer_measurement_revisions_insert on public.customer_measurement_revisions
  for insert
  with check (
    public.auth_has_permission('customers.editMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

create policy garment_measurement_revisions_select on public.garment_measurement_revisions
  for select
  using (
    public.auth_has_permission('customers.viewMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

create policy garment_measurement_revisions_insert on public.garment_measurement_revisions
  for insert
  with check (
    public.auth_has_permission('customers.editMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

drop policy if exists measurement_attachments_select on public.measurement_attachments;
drop policy if exists measurement_attachments_insert on public.measurement_attachments;
drop policy if exists measurement_attachments_delete on public.measurement_attachments;

create policy measurement_attachments_select on public.measurement_attachments
  for select
  using (
    public.auth_has_permission('customers.viewMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

create policy measurement_attachments_insert on public.measurement_attachments
  for insert
  with check (
    public.auth_has_permission('customers.editMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

create policy measurement_attachments_delete on public.measurement_attachments
  for delete
  using (
    public.auth_has_permission('customers.editMeasurements')
    and public.auth_can_access_customer(customer_id)
  );

create or replace function public.record_payment(
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
  if not public.auth_has_permission('orders.recordPayment') then
    raise exception 'permission denied: orders.recordPayment required';
  end if;
  if not public.auth_can_access_order(p_order_id) then
    raise exception 'permission denied for order';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;
  if p_payment_date is not null and p_payment_date > current_date then
    raise exception 'payment date cannot be in the future';
  end if;

  select balance into v_balance from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found: %', p_order_id;
  end if;
  if p_amount > v_balance then
    raise exception 'amount exceeds remaining balance of %', v_balance;
  end if;

  select exists(select 1 from public.payments where order_id = p_order_id and not voided) into v_has_prior;
  v_type := case when p_amount >= v_balance then 'Final' when not v_has_prior then 'Advance' else 'Partial' end;

  insert into public.payments (order_id, amount, payment_date, payment_mode, payment_type, notes, recorded_by)
  values (p_order_id, p_amount, coalesce(p_payment_date, current_date), p_payment_mode, v_type, p_notes, auth.uid())
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

create or replace function public.void_payment(
  p_payment_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  if not public.auth_has_permission('orders.voidPayment') then
    raise exception 'permission denied: orders.voidPayment required';
  end if;

  select order_id into v_order_id
  from public.payments
  where id = p_payment_id
    and not voided;
  if not found then
    raise exception 'payment not found or already voided: %', p_payment_id;
  end if;
  if not public.auth_can_access_order(v_order_id) then
    raise exception 'permission denied for order';
  end if;

  update public.payments set
    voided = true,
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason = p_reason
  where id = p_payment_id;
end;
$$;

create or replace function public.mark_order_ready_with_bin(
  p_order_id uuid,
  p_delivery_bin text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  if not public.auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;
  if not public.auth_can_access_order(p_order_id) then
    raise exception 'permission denied for order';
  end if;

  update public.orders
     set status = 'Ready',
         delivery_bin = nullif(btrim(coalesce(p_delivery_bin, '')), ''),
         updated_at = now()
   where id = p_order_id
     and status not in ('Cancelled', 'Delivered')
  returning id into v_order_id;

  if v_order_id is null then
    raise exception 'order not found or cannot be marked ready';
  end if;
  update public.job_cards
     set current_stage = 'Ready',
         assigned_staff_id = null,
         completed_date = current_date,
         updated_at = now()
   where order_id = p_order_id
     and not cancelled;
  return v_order_id;
end;
$$;

create or replace function public.quick_collect_and_deliver(
  p_order_id uuid,
  p_amount numeric default 0,
  p_payment_mode text default 'Cash',
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_balance numeric;
begin
  if not public.auth_has_permission('orders.edit') then
    raise exception 'permission denied: orders.edit required';
  end if;
  if not public.auth_can_access_order(p_order_id) then
    raise exception 'permission denied for order';
  end if;
  if p_amount is not null and p_amount > 0 and not public.auth_has_permission('orders.recordPayment') then
    raise exception 'permission denied: orders.recordPayment required';
  end if;

  select status, balance into v_status, v_balance
    from public.orders
   where id = p_order_id
   for update;
  if not found then raise exception 'order not found'; end if;
  if v_status = 'Delivered' then raise exception 'order is already delivered'; end if;
  if v_status <> 'Ready' then raise exception 'only Ready orders can be delivered'; end if;

  if coalesce(p_amount, 0) > 0 then
    perform public.record_payment(p_order_id, p_amount, current_date, p_payment_mode, p_notes);
    select balance into v_balance from public.orders where id = p_order_id;
  end if;
  if coalesce(v_balance, 0) > 0 then
    raise exception 'collect the remaining balance of % before delivery', v_balance;
  end if;

  update public.orders set status = 'Delivered', updated_at = now() where id = p_order_id;
  return p_order_id;
end;
$$;

grant execute on function public.record_payment(uuid, numeric, date, text, text) to authenticated, service_role;
grant execute on function public.void_payment(uuid, text) to authenticated, service_role;
grant execute on function public.mark_order_ready_with_bin(uuid, text) to authenticated, service_role;
grant execute on function public.quick_collect_and_deliver(uuid, numeric, text, text) to authenticated, service_role;
