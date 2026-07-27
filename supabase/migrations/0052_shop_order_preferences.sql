-- Default promise window for newly created orders. Existing order dates stay unchanged.
create table if not exists shop_order_preferences (
  id boolean primary key default true check (id),
  default_delivery_lead_days integer not null default 21 check (default_delivery_lead_days between 0 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into shop_order_preferences (id, default_delivery_lead_days)
values (true, 21)
on conflict (id) do nothing;

alter table shop_order_preferences enable row level security;

create policy shop_order_preferences_select on shop_order_preferences for select
  using (auth_has_permission('settings.view') or auth_has_permission('orders.create'));

create policy shop_order_preferences_insert on shop_order_preferences for insert
  with check (auth_has_permission('settings.manageShop'));

create policy shop_order_preferences_update on shop_order_preferences for update
  using (auth_has_permission('settings.manageShop'))
  with check (auth_has_permission('settings.manageShop'));

grant select, insert, update on shop_order_preferences to authenticated, service_role;
