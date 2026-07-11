-- Phase 8C: shop billing/receipt identity.
--
-- A singleton row used by Customer Receipt and Tailor Job Card print pages.
-- Tax/discount/refund math remains order-ledger work for a later migration;
-- this file only captures the shop identity printed on bills/job cards.

create table shop_billing_settings (
  id boolean primary key default true check (id),
  shop_name text not null default 'TailorSaaS',
  tagline text,
  phone text,
  email text,
  address text,
  gstin text,
  receipt_prefix text not null default 'INV',
  footer_note text not null default 'Please bring this receipt during pickup.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into shop_billing_settings (id, shop_name, tagline, receipt_prefix, footer_note)
values (true, 'TailorSaaS', 'Tailoring. Simplified.', 'INV', 'Please bring this receipt during pickup.')
on conflict (id) do nothing;

alter table shop_billing_settings enable row level security;

create policy shop_billing_settings_select on shop_billing_settings for select
  using (auth_has_permission('settings.view') or auth_has_permission('orders.printCustomerReceipt') or auth_has_permission('orders.printJobCard'));

create policy shop_billing_settings_insert on shop_billing_settings for insert
  with check (auth_has_permission('settings.manageShop'));

create policy shop_billing_settings_update on shop_billing_settings for update
  using (auth_has_permission('settings.manageShop'))
  with check (auth_has_permission('settings.manageShop'));

grant select, insert, update on shop_billing_settings to authenticated, service_role;

update roles
set permissions = permissions || array['settings.manageShop']::text[]
where id = 'role-admin'
  and not ('settings.manageShop' = any(permissions));
