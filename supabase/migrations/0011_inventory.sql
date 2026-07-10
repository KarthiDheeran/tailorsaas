-- Phase 8C: lightweight tailor-shop inventory.
--
-- Shop stock and customer-provided fabric are deliberately separate. Shop
-- stock affects quantity on hand. Customer fabric is tracked as custody
-- against a customer/order and must not be mixed into shop-owned stock.

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('Fabric','Button','Lining','Thread','Zip','Accessory','Other')),
  name text not null,
  sku text,
  color text,
  unit text not null check (unit in ('meter','piece','roll','packet','kg')),
  quantity_on_hand numeric not null default 0 check (quantity_on_hand >= 0),
  reorder_level numeric not null default 0 check (reorder_level >= 0),
  cost_per_unit numeric check (cost_per_unit is null or cost_per_unit >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('Stock In','Stock Out','Adjustment','Wastage')),
  quantity numeric not null check (quantity > 0),
  movement_date date not null default current_date,
  reason text,
  recorded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table customer_fabrics (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  fabric_description text not null,
  color text,
  quantity numeric not null check (quantity > 0),
  unit text not null check (unit in ('meter','piece','roll','packet','kg')),
  received_date date not null default current_date,
  status text not null default 'Received' check (status in ('Received','In Use','Returned','Consumed')),
  notes text,
  returned_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table inventory_items enable row level security;
alter table inventory_movements enable row level security;
alter table customer_fabrics enable row level security;

create policy inventory_items_select on inventory_items for select
  using (auth_has_permission('inventory.view'));
create policy inventory_items_insert on inventory_items for insert
  with check (auth_has_permission('inventory.manage'));
create policy inventory_items_update on inventory_items for update
  using (auth_has_permission('inventory.manage'))
  with check (auth_has_permission('inventory.manage'));

create policy inventory_movements_select on inventory_movements for select
  using (auth_has_permission('inventory.view'));
create policy inventory_movements_insert on inventory_movements for insert
  with check (auth_has_permission('inventory.manage'));

create policy customer_fabrics_select on customer_fabrics for select
  using (auth_has_permission('inventory.view'));
create policy customer_fabrics_insert on customer_fabrics for insert
  with check (auth_has_permission('inventory.manage'));
create policy customer_fabrics_update on customer_fabrics for update
  using (auth_has_permission('inventory.manage'))
  with check (auth_has_permission('inventory.manage'));

grant select, insert, update on inventory_items to authenticated, service_role;
grant select, insert on inventory_movements to authenticated, service_role;
grant select, insert, update on customer_fabrics to authenticated, service_role;

update roles
set permissions = permissions || array['inventory.view', 'inventory.manage']::text[]
where id = 'role-admin'
  and not ('inventory.view' = any(permissions));

update roles
set permissions = permissions || array['inventory.view', 'inventory.manage']::text[]
where id = 'role-manager'
  and not ('inventory.view' = any(permissions));
