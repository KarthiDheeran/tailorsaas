-- Family members may share a phone number. Only the same normalized name and
-- phone combination is a duplicate within a tenant.
drop index if exists public.customers_tenant_phone_unique_idx;
drop index if exists public.customers_phone_unique_idx;

create unique index if not exists customers_tenant_name_phone_unique_idx
  on public.customers (tenant_id, lower(btrim(name)), phone);
