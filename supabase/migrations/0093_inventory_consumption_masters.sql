-- Configurable inventory item types and delivery-time garment consumption.

create table if not exists public.inventory_item_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists inventory_item_types_name_key
  on public.inventory_item_types (lower(btrim(name)));

insert into public.inventory_item_types (name)
select distinct btrim(item_type) from public.inventory_items where btrim(item_type) <> ''
on conflict do nothing;
insert into public.inventory_item_types (name)
values ('Fabric'), ('Zip'), ('Belt Patti'), ('Collar Patti'), ('Front Patti'), ('Button'), ('Thread'), ('Other')
on conflict do nothing;

alter table public.inventory_items drop constraint if exists inventory_items_item_type_check;

create table if not exists public.inventory_consumption_rules (
  id uuid primary key default gen_random_uuid(),
  garment_type_id uuid not null references public.catalog_garment_types(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  calculation_type text not null check (calculation_type in ('Fixed','Measurement Range')),
  measurement_field_code text,
  fixed_quantity numeric check (fixed_quantity is null or fixed_quantity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (garment_type_id, inventory_item_id),
  check (
    (calculation_type = 'Fixed' and fixed_quantity is not null and measurement_field_code is null)
    or
    (calculation_type = 'Measurement Range' and fixed_quantity is null and nullif(btrim(measurement_field_code), '') is not null)
  )
);

create table if not exists public.inventory_consumption_ranges (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.inventory_consumption_rules(id) on delete cascade,
  from_value numeric not null,
  to_value numeric not null,
  quantity numeric not null check (quantity > 0),
  created_at timestamptz not null default now(),
  check (from_value <= to_value),
  unique (rule_id, from_value, to_value)
);

alter table public.inventory_movements add column if not exists order_item_id uuid references public.order_items(id) on delete set null;
alter table public.inventory_movements add column if not exists consumption_rule_id uuid references public.inventory_consumption_rules(id) on delete set null;

create table if not exists public.inventory_delivery_consumptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  rule_id uuid not null references public.inventory_consumption_rules(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  delivered_quantity integer not null check (delivered_quantity > 0),
  quantity_per_garment numeric not null check (quantity_per_garment > 0),
  consumed_quantity numeric not null check (consumed_quantity > 0),
  measurement_field_code text,
  measurement_value numeric,
  created_at timestamptz not null default now()
);

create or replace function public.consume_inventory_for_delivered_item() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rule record;
  v_delta integer;
  v_measurement numeric;
  v_per_garment numeric;
  v_consumed numeric;
  v_on_hand numeric;
  v_consumption_id uuid;
begin
  v_delta := new.delivered_qty - old.delivered_qty;
  if v_delta <= 0 then return new; end if;

  for v_rule in
    select r.*, i.name as item_name
      from public.inventory_consumption_rules r
      join public.inventory_items i on i.id = r.inventory_item_id
     where r.garment_type_id = new.garment_type_id and r.is_active and i.active
  loop
    if v_rule.calculation_type = 'Fixed' then
      v_per_garment := v_rule.fixed_quantity;
      v_measurement := null;
    else
      begin
        v_measurement := nullif(btrim(new.measurements ->> v_rule.measurement_field_code), '')::numeric;
      exception when invalid_text_representation then
        raise exception 'Invalid % measurement for % inventory consumption', v_rule.measurement_field_code, new.particular;
      end;
      if v_measurement is null then
        raise exception 'Missing % measurement for % inventory consumption', v_rule.measurement_field_code, new.particular;
      end if;
      select quantity into v_per_garment
        from public.inventory_consumption_ranges
       where rule_id = v_rule.id and v_measurement between from_value and to_value
       order by from_value desc limit 1;
      if v_per_garment is null then
        raise exception 'No inventory range configured for % measurement % (%)', v_rule.measurement_field_code, v_measurement, new.particular;
      end if;
    end if;

    v_consumed := v_per_garment * v_delta;
    select quantity_on_hand into v_on_hand from public.inventory_items where id = v_rule.inventory_item_id for update;
    if v_on_hand < v_consumed then
      raise exception 'Insufficient stock for %: need %, available %', v_rule.item_name, v_consumed, v_on_hand;
    end if;

    insert into public.inventory_delivery_consumptions
      (order_id, order_item_id, rule_id, inventory_item_id, delivered_quantity, quantity_per_garment, consumed_quantity, measurement_field_code, measurement_value)
    values
      (new.order_id, new.id, v_rule.id, v_rule.inventory_item_id, v_delta, v_per_garment, v_consumed, v_rule.measurement_field_code, v_measurement)
    returning id into v_consumption_id;

    update public.inventory_items set quantity_on_hand = quantity_on_hand - v_consumed, updated_at = now()
     where id = v_rule.inventory_item_id;
    insert into public.inventory_movements
      (item_id, movement_type, quantity, movement_date, reason, order_id, order_item_id, consumption_rule_id, recorded_by)
    values
      (v_rule.inventory_item_id, 'Stock Out', v_consumed, current_date,
       'Automatic delivery consumption: ' || new.particular || ' x ' || v_delta, new.order_id, new.id, v_rule.id, auth.uid());
  end loop;
  return new;
end;
$$;

drop trigger if exists order_items_consume_inventory_after_delivery on public.order_items;
create trigger order_items_consume_inventory_after_delivery
after update of delivered_qty on public.order_items
for each row when (new.delivered_qty > old.delivered_qty)
execute function public.consume_inventory_for_delivered_item();

alter table public.inventory_item_types enable row level security;
alter table public.inventory_consumption_rules enable row level security;
alter table public.inventory_consumption_ranges enable row level security;
alter table public.inventory_delivery_consumptions enable row level security;

create policy inventory_item_types_select on public.inventory_item_types for select using (auth_has_permission('inventory.view'));
create policy inventory_item_types_insert on public.inventory_item_types for insert with check (auth_has_permission('inventory.manage'));
create policy inventory_item_types_update on public.inventory_item_types for update using (auth_has_permission('inventory.manage')) with check (auth_has_permission('inventory.manage'));
create policy inventory_consumption_rules_select on public.inventory_consumption_rules for select using (auth_has_permission('inventory.view'));
create policy inventory_consumption_rules_insert on public.inventory_consumption_rules for insert with check (auth_has_permission('inventory.manage'));
create policy inventory_consumption_rules_update on public.inventory_consumption_rules for update using (auth_has_permission('inventory.manage')) with check (auth_has_permission('inventory.manage'));
create policy inventory_consumption_rules_delete on public.inventory_consumption_rules for delete using (auth_has_permission('inventory.manage'));
create policy inventory_consumption_ranges_select on public.inventory_consumption_ranges for select using (auth_has_permission('inventory.view'));
create policy inventory_consumption_ranges_insert on public.inventory_consumption_ranges for insert with check (auth_has_permission('inventory.manage'));
create policy inventory_consumption_ranges_update on public.inventory_consumption_ranges for update using (auth_has_permission('inventory.manage')) with check (auth_has_permission('inventory.manage'));
create policy inventory_consumption_ranges_delete on public.inventory_consumption_ranges for delete using (auth_has_permission('inventory.manage'));
create policy inventory_delivery_consumptions_select on public.inventory_delivery_consumptions for select using (auth_has_permission('inventory.view'));

grant select, insert, update on public.inventory_item_types to authenticated, service_role;
grant select, insert, update, delete on public.inventory_consumption_rules, public.inventory_consumption_ranges to authenticated, service_role;
grant select on public.inventory_delivery_consumptions to authenticated, service_role;

notify pgrst, 'reload schema';
